import { apiRequest } from './client';
import { unwrapData } from './normalizers';

export type BillingCycle = 'monthly' | 'quarterly' | 'yearly';

export type SubscriptionPlan = {
  _id: string;
  key: string;
  role: 'buyer' | 'seller';
  name: string;
  description?: string;
  prices: Record<BillingCycle, number>;
  features: string[];
  aiCredits: number;
  storageLimitMb: number;
  limits: Record<string, number>;
  supportLevel: string;
  priorityRanking: number;
  verificationLevel: string;
  trustScoreBoost: number;
  aiTier: 'esyai_lite' | 'esyai_pro' | 'esyai_advanced' | 'esyai_enterprise';
  aiModel?: string;
  premiumBadge?: string;
  recommended?: boolean;
  popular?: boolean;
  businessGrowthScore?: number;
  subtitle?: string;
  currency?: string;
  currencySymbol?: string;
  savings?: Partial<Record<BillingCycle, number>>;
  branding?: { badge?: string; color?: string; icon?: string };
};

export type SubscriptionOverview = {
  subscription: Record<string, any>;
  plan: SubscriptionPlan;
  usage: Record<string, any>;
};

export async function fetchSubscription(role: 'buyer' | 'seller') {
  const data = unwrapData<any>(await apiRequest('/subscription', { query: { role } }));
  return {
    ...data,
    plan: normalizeSubscriptionPlan(data?.plan, role),
    usage: data?.usage ?? {},
    subscription: data?.subscription ?? {},
  } as SubscriptionOverview;
}

/**
 * ✅ FIXED: Fetch subscription plans from backend
 * Backend returns: { plans: SubscriptionPlan[] }
 * apiRequest already unwraps the response, so we just access data.plans
 */
export async function fetchSubscriptionPlans(role: 'buyer' | 'seller') {
  const payload = unwrapData<any>(await apiRequest('/subscription/plans', { query: { role } }));
  const plans = Array.isArray(payload) ? payload : Array.isArray(payload?.plans) ? payload.plans : [];
  return plans.map((plan: unknown) => normalizeSubscriptionPlan(plan, role));
}

function amount(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value && typeof value === 'object' && 'amount' in value) return Number((value as any).amount) || 0;
  return Number(value) || 0;
}

function featureList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (!value || typeof value !== 'object') return [];
  const grouped = value as Record<string, unknown>;
  return [...new Set(['core', 'ai', 'highlighted'].flatMap(key =>
    Array.isArray(grouped[key]) ? (grouped[key] as unknown[]).map(String) : [],
  ).filter(Boolean))];
}

export function normalizeSubscriptionPlan(value: unknown, fallbackRole: 'buyer' | 'seller'): SubscriptionPlan {
  const plan = value && typeof value === 'object' ? value as Record<string, any> : {};
  const key = String(plan.key ?? `${fallbackRole}_starter`);
  const cycles: BillingCycle[] = ['monthly', 'quarterly', 'yearly'];
  const prices = Object.fromEntries(cycles.map(cycle => [cycle, amount(plan.prices?.[cycle])])) as Record<BillingCycle, number>;
  const savings = Object.fromEntries(cycles.map(cycle => [cycle, Number(plan.prices?.[cycle]?.savingsPercent ?? 0)]));
  const priceMeta = plan.prices?.monthly ?? plan.prices?.yearly ?? {};
  return {
    _id: String(plan._id ?? key), key,
    role: plan.role === 'seller' ? 'seller' : fallbackRole,
    name: String(plan.name ?? plan.tier ?? 'Starter'),
    subtitle: String(plan.subtitle ?? ''), description: String(plan.description ?? ''),
    prices, savings,
    currency: String(priceMeta.currency ?? 'INR'), currencySymbol: String(priceMeta.symbol ?? '₹'),
    features: featureList(plan.features),
    aiCredits: amount(plan.aiCredits?.monthly ?? plan.aiCredits),
    storageLimitMb: amount(plan.storageLimitMb),
    limits: plan.restrictions ?? plan.limits ?? {},
    supportLevel: String(plan.support?.level ?? plan.supportLevel ?? 'standard'),
    priorityRanking: Number(plan.priorityRanking ?? 0),
    verificationLevel: String(plan.verificationLevel ?? 'basic'),
    trustScoreBoost: Number(plan.trustScoreBoost ?? 0),
    aiTier: plan.aiTier ?? 'esyai_lite', aiModel: plan.aiModel,
    premiumBadge: plan.branding?.badge ?? plan.premiumBadge,
    branding: plan.branding,
    recommended: Boolean(plan.recommended), popular: Boolean(plan.isPopular ?? plan.popular),
    businessGrowthScore: Number(plan.businessGrowthScore ?? 0) || undefined,
  };
}

export async function createSubscriptionOrder(
  planType: string,
  duration: BillingCycle
) {
  return unwrapData<any>(
    await apiRequest('/subscription/create-order', {
      method: 'POST',
      body: { planType, duration },
    })
  );
}

export async function verifySubscriptionPayment(
  body: Record<string, unknown>
) {
  return unwrapData<any>(
    await apiRequest('/payments/verify/subscription', {
      method: 'POST',
      body,
    })
  );
}

export async function setSubscriptionAutoRenew(autoRenew: boolean) {
  return unwrapData<any>(
    await apiRequest('/subscription/auto-renew', {
      method: 'PATCH',
      body: { autoRenew },
    })
  );
}
