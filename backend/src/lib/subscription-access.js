import crypto from 'node:crypto';
import Subscription from '../models/Subscription.js';
import AIUsage from '../models/AIUsage.js';
import { getPlan } from './subscription-plans.js';

const RESERVATION_TTL_MS = Math.max(60_000, Number(process.env.AI_CREDIT_RESERVATION_TTL_MS || 10 * 60_000));

function userIdOf(user) {
  return user.id || user._id;
}

function planCreditCount(plan) {
  return Number(plan.aiCredits?.monthly ?? plan.aiCredits ?? 0);
}

export function creditSnapshot(subscription, plan, todayUsed = null) {
  const included = planCreditCount(plan);
  const purchased = Number(subscription.aiCreditsPurchased || 0);
  const allocated = Number(subscription.aiCreditsAllocated ?? included + purchased);
  const used = Number(subscription.aiCreditsUsed || 0);
  const reserved = Number(subscription.aiCreditsReserved || 0);
  const remaining = Math.max(0, allocated - used - reserved);
  return {
    allocated, included, purchased,
    used,
    reserved,
    remaining,
    todayUsed: todayUsed == null ? undefined : Number(todayUsed || 0),
    usagePercentage: allocated > 0 ? Math.min(100, Math.round((used / allocated) * 100)) : 100,
    resetAt: subscription.usageResetAt || subscription.creditsResetAt || null,
    renewalAt: subscription.renewalDate || subscription.expiryDate || null,
    low: allocated > 0 && remaining / allocated <= 0.2,
    exhausted: remaining <= 0,
  };
}

async function releaseExpiredReservations(subscription) {
  if (Number(subscription.aiCreditsReserved || 0) <= 0) return subscription;
  const expired = await AIUsage.find({
    subscriptionId: subscription._id,
    status: 'pending',
    createdAt: { $lte: new Date(Date.now() - RESERVATION_TTL_MS) },
  }).select('_id creditAmount').lean();
  if (!expired.length) return subscription;
  const credits = expired.reduce((sum, item) => sum + Number(item.creditAmount || 1), 0);
  await AIUsage.updateMany({ _id: { $in: expired.map(item => item._id) }, status: 'pending' }, {
    $set: { status: 'failed', errorMessage: 'Credit reservation expired before completion', completedAt: new Date() },
  });
  return Subscription.findByIdAndUpdate(subscription._id, {
    $inc: { aiCreditsReserved: -Math.min(credits, Number(subscription.aiCreditsReserved || 0)) },
  }, { returnDocument: 'after' });
}

export async function getSubscriptionContext(user, requestedRole) {
  const userId = userIdOf(user);
  const role = requestedRole || (user.primaryRole === 'seller' ? 'seller' : 'buyer');
  let subscription = await Subscription.findOne({ userId });
  if (!subscription) {
    subscription = await Subscription.create({ userId, userType: role, isActive: true, status: 'active', planKey: `${role}_free`, [role === 'seller' ? 'sellerPlan' : 'buyerPlan']: `${role}_free` });
  }
  const now = new Date();
  if (subscription.expiryDate && subscription.expiryDate < now && subscription.status === 'active') {
    subscription.status = subscription.gracePeriodEndsAt > now ? 'grace_period' : 'expired';
    subscription.isActive = subscription.status === 'grace_period';
    await subscription.save();
  }
  const key = subscription.planKey || subscription[role === 'seller' ? 'sellerPlan' : 'buyerPlan'] || `${role}_free`;
  const plan = await getPlan(key, role) || await getPlan(`${role}_free`, role);
  const resetAt = subscription.usageResetAt || subscription.creditsResetAt;
  if (!resetAt || resetAt <= now) {
    const next = new Date(now);
    next.setMonth(next.getMonth() + 1);
    subscription.usage = {};
    subscription.aiCreditsUsed = 0;
    subscription.aiCreditsReserved = 0;
    subscription.aiCreditsAllocated = planCreditCount(plan) + Number(subscription.aiCreditsPurchased || 0);
    subscription.usageResetAt = next;
    subscription.creditsResetAt = next;
    await subscription.save();
  }
  subscription = await releaseExpiredReservations(subscription) || subscription;
  return { subscription, plan, role };
}

export async function getAICreditSnapshot(user, requestedRole) {
  const context = await getSubscriptionContext(user, requestedRole);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayRows = await AIUsage.aggregate([
    { $match: { userId: context.subscription.userId, status: 'success', createdAt: { $gte: today } } },
    { $group: { _id: null, credits: { $sum: '$creditAmount' } } },
  ]);
  return creditSnapshot(context.subscription, context.plan, todayRows[0]?.credits || 0);
}

export async function consumeUsage(user, feature, amount = 1, options = {}) {
  const context = await getSubscriptionContext(user, options.role);
  const usage = { ...(context.subscription.usage || {}) };
  const used = Number(usage[feature] || 0);
  const limits = context.plan.restrictions || context.plan.limits || {};
  const limit = Number(limits[feature] ?? -1);
  if (limit >= 0 && used + amount > limit) throw Object.assign(new Error(`${feature} limit reached for ${context.plan.name}`), { statusCode: 429, code: 'SUBSCRIPTION_LIMIT' });
  usage[feature] = used + amount;
  context.subscription.usage = usage;
  await context.subscription.save();
  return context;
}

export async function reserveAIUsage(user, feature, amount = 1, options = {}) {
  const context = await getSubscriptionContext(user, options.role);
  const limits = context.plan.restrictions || context.plan.limits || {};
  const featureUsed = Number(context.subscription.usage?.[feature] || 0);
  const limit = Number(limits[feature] ?? -1);
  if (limit >= 0 && featureUsed + amount > limit) throw Object.assign(new Error(`${feature} limit reached for ${context.plan.name}`), { statusCode: 429, code: 'SUBSCRIPTION_LIMIT' });

  const requestId = String(options.requestId || crypto.randomUUID()).slice(0, 160);
  let usageRecord;
  try {
    usageRecord = await AIUsage.create({
      userId: userIdOf(user), subscriptionId: context.subscription._id,
      feature: options.aiFeature || 'chat', modelUsed: context.plan.aiTier || context.plan.aiProvider || 'gemma3:4b',
      status: 'pending', requestId, creditAmount: amount,
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    throw Object.assign(new Error('This AI request is already being processed'), { statusCode: 409, code: 'AI_REQUEST_DUPLICATE' });
  }

  const subscription = await Subscription.findOneAndUpdate({
    _id: context.subscription._id,
    $expr: { $gte: [{ $subtract: [{ $ifNull: ['$aiCreditsAllocated', 0] }, { $add: [{ $ifNull: ['$aiCreditsUsed', 0] }, { $ifNull: ['$aiCreditsReserved', 0] }] }] }, amount] },
  }, { $inc: { aiCreditsReserved: amount } }, { returnDocument: 'after' });
  if (!subscription) {
    await AIUsage.updateOne({ _id: usageRecord._id }, { $set: { status: 'rate_limited', errorMessage: 'AI credits exhausted', completedAt: new Date() } });
    throw Object.assign(new Error('AI credits exhausted'), { statusCode: 402, code: 'AI_CREDITS_EXHAUSTED', credits: creditSnapshot(context.subscription, context.plan) });
  }
  return { ...context, subscription, requestId, usageId: usageRecord._id, amount, feature };
}

export async function commitUsageReservation(req, metrics = {}) {
  const reservation = req.aiCreditReservation;
  if (!reservation || req.aiCreditSettled) return req.aiCreditSnapshot || null;
  const claimed = await AIUsage.findOneAndUpdate({ _id: reservation.usageId, status: 'pending' }, {
    $set: {
      status: 'success', completedAt: new Date(), responseTokens: Number(metrics.responseTokens || 0),
      totalTokens: Number(metrics.totalTokens || metrics.responseTokens || 0), responseTime: Number(metrics.responseTime || 0),
    },
  }, { returnDocument: 'after' });
  if (!claimed) return req.aiCreditSnapshot || null;
  const subscription = await Subscription.findByIdAndUpdate(reservation.subscription._id, {
    $inc: { aiCreditsReserved: -reservation.amount, aiCreditsUsed: reservation.amount, [`usage.${reservation.feature}`]: reservation.amount },
  }, { returnDocument: 'after' });
  req.aiCreditSettled = true;
  req.aiCreditSnapshot = creditSnapshot(subscription, reservation.plan);
  return req.aiCreditSnapshot;
}

export async function releaseUsageReservation(req, error) {
  const reservation = req.aiCreditReservation;
  if (!reservation || req.aiCreditSettled) return req.aiCreditSnapshot || null;
  const released = await AIUsage.findOneAndUpdate({ _id: reservation.usageId, status: 'pending' }, {
    $set: { status: 'failed', errorMessage: String(error?.message || 'AI request did not complete').slice(0, 500), completedAt: new Date() },
  }, { returnDocument: 'after' });
  if (released) {
    await Subscription.updateOne({ _id: reservation.subscription._id }, { $inc: { aiCreditsReserved: -reservation.amount } });
  }
  req.aiCreditSettled = true;
  return null;
}

export async function refundUsage(user, feature, amount = 1, options = {}) {
  const context = await getSubscriptionContext(user, options.role);
  const usage = { ...(context.subscription.usage || {}) };
  usage[feature] = Math.max(0, Number(usage[feature] || 0) - amount);
  context.subscription.usage = usage;
  if (options.ai) context.subscription.aiCreditsUsed = Math.max(0, Number(context.subscription.aiCreditsUsed || 0) - amount);
  await context.subscription.save();
  return context;
}

export function requireSubscriptionFeature(feature, options = {}) {
  return async (req, res, next) => {
    try {
      if (options.ai && !req.aiRequestReceivedAt) req.aiRequestReceivedAt = Date.now();
      req.subscriptionContext = options.ai
        ? await reserveAIUsage(req.user, feature, options.amount || 1, { ...options, requestId: req.get('x-ai-request-id') || req.id })
        : await consumeUsage(req.user, feature, options.amount || 1, options);
      if (options.ai) {
        req.aiCreditReservation = req.subscriptionContext;
        req.aiRouting = modelForSubscription(req.subscriptionContext);
        res.once('finish', () => {
          if (req.aiCreditSettled) return;
          const settle = res.statusCode < 400 ? commitUsageReservation(req) : releaseUsageReservation(req);
          settle.catch(error => console.error('[AI-Credits] Settlement failed:', error));
        });
        res.once('close', () => {
          if (!res.writableEnded && !req.aiCreditSettled) releaseUsageReservation(req, new Error('Client disconnected')).catch(() => undefined);
        });
      }
      next();
    } catch (error) {
      res.status(error.statusCode || 403).json({ error: error.message, code: error.code || 'SUBSCRIPTION_REQUIRED', credits: error.credits });
    }
  };
}

export function modelForSubscription() {
  return { provider: 'ollama', model: 'gemma3:4b' };
}
