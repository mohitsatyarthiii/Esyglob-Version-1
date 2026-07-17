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
};

export type SubscriptionOverview = {
  subscription: Record<string, any>;
  plan: SubscriptionPlan;
  usage: Record<string, any>;
};

export async function fetchSubscription(role: 'buyer' | 'seller') {
  return unwrapData<SubscriptionOverview>(
    await apiRequest('/subscription', { query: { role } })
  );
}

/**
 * ✅ FIXED: Fetch subscription plans from backend
 * Backend returns: { plans: SubscriptionPlan[] }
 * apiRequest already unwraps the response, so we just access data.plans
 */
export async function fetchSubscriptionPlans(role: 'buyer' | 'seller') {
  // apiRequest returns the already unwrapped data (which is { plans: [...] })
  const data = await apiRequest('/subscription/plans', { query: { role } });
  
  // Return the plans array, or empty array if something goes wrong
  return (data as { plans: SubscriptionPlan[] })?.plans || [];
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