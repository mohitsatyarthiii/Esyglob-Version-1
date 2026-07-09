// ==================== PLAN DEFINITIONS ====================

export const PLANS = {
  // BUYER PLANS
  free: {
    name: 'Free',
    type: 'buyer',
    price: { monthly: 0, yearly: 0 },
    features: ['Basic product search', 'Limited RFQs', 'Basic support'],
  },
  basic: {
    name: 'Basic',
    type: 'buyer',
    price: { monthly: 499, yearly: 4990 },
    features: ['Unlimited product search', 'Up to 10 RFQs/month', 'Email support'],
  },
  buyer_basic: {
    name: 'Buyer Basic',
    type: 'buyer',
    price: { monthly: 499, yearly: 4990 },
    features: ['Unlimited product search', 'Up to 10 RFQs/month', 'Email support'],
  },
  standard: {
    name: 'Standard',
    type: 'buyer',
    price: { monthly: 999, yearly: 9990 },
    features: ['Unlimited search', 'Unlimited RFQs', 'Priority support', 'Trade Assurance'],
  },
  buyer_standard: {
    name: 'Buyer Standard',
    type: 'buyer',
    price: { monthly: 999, yearly: 9990 },
    features: ['Unlimited search', 'Unlimited RFQs', 'Priority support', 'Trade Assurance'],
  },
  prime: {
    name: 'Prime',
    type: 'buyer',
    price: { monthly: 1999, yearly: 19990 },
    features: ['All Standard features', 'Dedicated account manager', 'Early access to products', 'Advanced analytics'],
  },
  buyer_prime: {
    name: 'Buyer Prime',
    type: 'buyer',
    price: { monthly: 1999, yearly: 19990 },
    features: ['All Standard features', 'Dedicated account manager', 'Early access', 'Advanced analytics'],
  },

  // SELLER PLANS
  verified_supplier: {
    name: 'Verified Supplier',
    type: 'seller',
    price: { monthly: 2999, yearly: 29990, '3years': 79990 },
    features: ['Verified badge', 'Unlimited products', 'RFQ access', 'Priority listing'],
  },
  verified_batch: {
    name: 'Verified Batch',
    type: 'seller',
    price: { monthly: 1999, yearly: 19990, '3years': 49990 },
    features: ['Verified badge', 'Up to 50 products', 'RFQ access', 'Standard listing'],
  },
};

// Duration to months mapping
export const DURATION_MONTHS = {
  monthly: 1,
  yearly: 12,
  '3years': 36,
};

/**
 * Check if plan is valid
 */
export function isValidPlan(planType, duration = 'monthly') {
  const plan = PLANS[planType];
  if (!plan) return false;
  return Boolean(plan.price[duration]);
}

/**
 * Get plan price
 */
export function getPlanPrice(planType, duration = 'monthly') {
  const plan = PLANS[planType];
  if (!plan) return 0;
  return plan.price[duration] || plan.price.monthly || 0;
}

/**
 * Get months included
 */
export function getMonthsIncluded(planType, duration = 'monthly') {
  return DURATION_MONTHS[duration] || 1;
}

/**
 * Get plan details
 */
export function getPlanDetails(planType) {
  return PLANS[planType] || null;
}

/**
 * Get all plans
 */
export function getAllPlans(userType = null) {
  if (userType) {
    return Object.entries(PLANS)
      .filter(([, plan]) => plan.type === userType)
      .map(([key, plan]) => ({ key, ...plan }));
  }
  return Object.entries(PLANS).map(([key, plan]) => ({ key, ...plan }));
}