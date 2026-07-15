import Subscription from '../models/Subscription.js';
import AIUsage from '../models/AIUsage.js';
import { getPlan } from './subscription-plans.js';

export async function getSubscriptionContext(user, requestedRole) {
  const userId=user.id||user._id; const role=requestedRole||(user.primaryRole==='seller'?'seller':'buyer');
  let subscription=await Subscription.findOne({userId});
  if(!subscription) subscription=await Subscription.create({userId,userType:role,isActive:true,status:'active',planKey:`${role}_free`,[role==='seller'?'sellerPlan':'buyerPlan']:`${role}_free`});
  const now=new Date(); if(subscription.expiryDate&&subscription.expiryDate<now&&subscription.status==='active'){subscription.status=subscription.gracePeriodEndsAt>now?'grace_period':'expired';subscription.isActive=subscription.status==='grace_period';await subscription.save();}
  const key=subscription.planKey||subscription[role==='seller'?'sellerPlan':'buyerPlan']||`${role}_free`; const plan=await getPlan(key,role)||await getPlan(`${role}_free`,role);
  const resetAt=subscription.usageResetAt||subscription.creditsResetAt; if(!resetAt||resetAt<=now){const next=new Date(now);next.setMonth(next.getMonth()+1);subscription.usage={};subscription.aiCreditsUsed=0;subscription.aiCreditsAllocated=plan.aiCredits;subscription.usageResetAt=next;subscription.creditsResetAt=next;await subscription.save();}
  return {subscription,plan,role};
}
export async function consumeUsage(user, feature, amount=1, options={}) { const context=await getSubscriptionContext(user,options.role); const usage={...(context.subscription.usage||{})}; const used=Number(usage[feature]||0); const limit=Number(context.plan.limits?.[feature]??-1); if(limit>=0&&used+amount>limit) throw Object.assign(new Error(`${feature} limit reached for ${context.plan.name}`),{statusCode:429,code:'SUBSCRIPTION_LIMIT'}); if(options.ai){const remaining=Number(context.subscription.aiCreditsAllocated||context.plan.aiCredits)-Number(context.subscription.aiCreditsUsed||0);if(remaining<amount)throw Object.assign(new Error('AI credits exhausted'),{statusCode:402,code:'AI_CREDITS_EXHAUSTED'});context.subscription.aiCreditsUsed=Number(context.subscription.aiCreditsUsed||0)+amount;} usage[feature]=used+amount;context.subscription.usage=usage;await context.subscription.save();if(options.ai)await AIUsage.create({userId:user.id||user._id,subscriptionId:context.subscription._id,feature:options.aiFeature||'chat',modelUsed:context.plan.aiProvider,status:'success'});return context; }
export function requireSubscriptionFeature(feature, options={}) { return async(req,res,next)=>{try{req.subscriptionContext=await consumeUsage(req.user,feature,options.amount||1,options);if(options.ai)req.aiRouting=modelForSubscription(req.subscriptionContext);next();}catch(error){res.status(error.statusCode||403).json({error:error.message,code:error.code||'SUBSCRIPTION_REQUIRED'});}}; }
export function modelForSubscription(context){return {provider:context.plan.aiProvider,model:process.env[`AI_MODEL_${context.plan.aiProvider.toUpperCase()}`]||null};}
