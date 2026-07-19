import SubscriptionPlan from '../models/SubscriptionPlan.js';

export const DEFAULT_PLANS = [
  // ==================== BUYER TIERS ====================
  {
    key: 'buyer_starter',
    role: 'buyer',
    tier: 'starter',
    name: 'Starter',
    subtitle: 'For New Importers',
    description: 'Begin your global sourcing journey with essential tools and AI assistance',
    prices: {
      monthly: { amount: 0, currency: 'INR', symbol: '₹' },
      quarterly: { amount: 0, currency: 'INR', symbol: '₹' },
      yearly: { amount: 0, currency: 'INR', symbol: '₹' }
    },
    aiCredits: {
      monthly: 500,
      rollover: false,
      bonusOnUpgrade: 0
    },
    storageLimitMb: 500,
    support: {
      level: 'standard',
      responseTime: '48 hours',
      channels: ['email', 'help_center']
    },
    trustScoreBoost: 0,
    verificationLevel: 'basic',
    aiTier: 'esyai_lite',
    priorityRanking: 0,
    branding: {
      badge: null,
      color: '#6B7280',
      icon: 'starter_badge'
    },
    features: {
      core: [
        'Unlimited Product & Seller Browsing',
        'Basic AI Chat Assistant',
        'Standard Search Filters',
        'Basic RFQ Creation (Up to 5)',
        'Save Products & Sellers',
        'Basic Trade Calculator',
        'Email & Mobile Verification',
        'Standard Support Access'
      ],
      ai: [
        'Basic Product Recommendations',
        'Simple Search Suggestions',
        'Basic Shipment Tracking'
      ],
      highlighted: [
        'Free Forever',
        'No Credit Card Required',
        '500 AI Credits Monthly'
      ]
    },
    restrictions: {
      rfqsPerMonth: 5,
      quotationsPerMonth: 10,
      maxActiveMessages: 50,
      maxServiceBookings: 5,
      maxMarketInsights: 10,
      maxImageUploads: 25,
      maxDocuments: 50,
      maxSavedProducts: 100,
      maxSavedSellers: 50,
      maxWishlistItems: 50,
      products: 0,
      teamMembers: 1
    },
    isPopular: false,
    isActive: true,
    metadata: {
      version: '2.0',
      lastUpdated: new Date(),
      region: 'india'
    }
  },
  {
    key: 'buyer_growth',
    role: 'buyer',
    tier: 'growth',
    name: 'Growth',
    subtitle: 'For Serious Importers',
    description: 'Accelerate your sourcing with advanced AI tools, priority access & trade insights',
    prices: {
      monthly: { amount: 1499, currency: 'INR', symbol: '₹' },
      quarterly: { amount: 3999, currency: 'INR', symbol: '₹', savingsPercent: 11 },
      yearly: { amount: 14990, currency: 'INR', symbol: '₹', savingsPercent: 17 }
    },
    aiCredits: {
      monthly: 2000,
      rollover: true,
      maxRollover: 2000,
      bonusOnUpgrade: 1000
    },
    storageLimitMb: 5120,
    support: {
      level: 'priority',
      responseTime: '12 hours',
      channels: ['email', 'chat', 'whatsapp']
    },
    trustScoreBoost: 10,
    verificationLevel: 'business',
    aiTier: 'esyai_pro',
    priorityRanking: 1,
    branding: {
      badge: 'Growth Badge',
      color: '#3B82F6',
      icon: 'growth_badge'
    },
    features: {
      core: [
        'Everything in Starter, plus:',
        'Advanced AI Price & MOQ Comparison',
        'AI RFQ Generator & Improver',
        'Smart Reply Suggestions',
        'Advanced Search & Filters',
        'Priority RFQ Placement',
        'Trade Assurance Access',
        'Priority Support (12hr Response)'
      ],
      ai: [
        'Personalized AI Recommendations',
        'AI Market & Pricing Insights',
        'AI Seller Matching',
        'AI Negotiation Tips'
      ],
      highlighted: [
        '2,000 AI Credits/Month',
        'Credit Rollover (Up to 2,000)',
        'WhatsApp Support',
        'Most Popular Choice'
      ]
    },
    restrictions: {
      rfqsPerMonth: 30,
      quotationsPerMonth: 50,
      maxActiveMessages: 500,
      maxServiceBookings: 25,
      maxMarketInsights: 50,
      maxImageUploads: 200,
      maxDocuments: 500,
      maxSavedProducts: 1000,
      maxSavedSellers: 500,
      maxWishlistItems: 500,
      products: 0,
      teamMembers: 1
    },
    isPopular: true,
    isActive: true,
    metadata: {
      version: '2.0',
      lastUpdated: new Date(),
      region: 'india'
    }
  },
  {
    key: 'buyer_business',
    role: 'buyer',
    tier: 'business',
    name: 'Business',
    subtitle: 'For Growing Companies',
    description: 'Enterprise-grade trade intelligence with AI business assistant & team collaboration',
    prices: {
      monthly: { amount: 3999, currency: 'INR', symbol: '₹' },
      quarterly: { amount: 10799, currency: 'INR', symbol: '₹', savingsPercent: 10 },
      yearly: { amount: 39990, currency: 'INR', symbol: '₹', savingsPercent: 17 }
    },
    aiCredits: {
      monthly: 5000,
      rollover: true,
      maxRollover: 5000,
      bonusOnUpgrade: 2500
    },
    storageLimitMb: 20480,
    support: {
      level: 'priority_plus',
      responseTime: '4 hours',
      channels: ['email', 'chat', 'whatsapp', 'phone']
    },
    trustScoreBoost: 20,
    verificationLevel: 'business_verified',
    aiTier: 'esyai_advanced',
    priorityRanking: 2,
    branding: {
      badge: 'Business Badge',
      color: '#8B5CF6',
      icon: 'business_badge'
    },
    features: {
      core: [
        'Everything in Growth, plus:',
        'AI Trade Consultant & Negotiation',
        'Import/Export Compliance Checker',
        'Tariff & Duty Calculator',
        'HS Code Finder & Classification',
        'Team Workspace (Up to 5 Members)',
        'Shared RFQs & Wishlists',
        'Advanced Analytics Dashboard',
        'Dedicated Priority Support (4hr)'
      ],
      ai: [
        'AI Demand & Trend Forecasting',
        'Country-wise Trade Intelligence',
        'AI Supply Chain Risk Analysis',
        'AI Procurement Optimization'
      ],
      highlighted: [
        '5,000 AI Credits/Month',
        'Team Collaboration (5 Members)',
        'Phone Support Available',
        'Advanced Trade Analytics'
      ]
    },
    restrictions: {
      rfqsPerMonth: 100,
      quotationsPerMonth: 200,
      maxActiveMessages: 2000,
      maxServiceBookings: 100,
      maxMarketInsights: 200,
      maxImageUploads: 1000,
      maxDocuments: 2000,
      maxSavedProducts: -1,
      maxSavedSellers: -1,
      maxWishlistItems: -1,
      products: 0,
      teamMembers: 5
    },
    isPopular: false,
    isActive: true,
    metadata: {
      version: '2.0',
      lastUpdated: new Date(),
      region: 'india'
    }
  },
  {
    key: 'buyer_enterprise',
    role: 'buyer',
    tier: 'enterprise',
    name: 'Enterprise',
    subtitle: 'For Large Organizations',
    description: 'Full-scale procurement solution with dedicated AI consultant & custom integrations',
    prices: {
      monthly: { amount: 9999, currency: 'INR', symbol: '₹' },
      quarterly: { amount: 26999, currency: 'INR', symbol: '₹', savingsPercent: 10 },
      yearly: { amount: 99990, currency: 'INR', symbol: '₹', savingsPercent: 17 }
    },
    aiCredits: {
      monthly: 15000,
      rollover: true,
      maxRollover: 15000,
      bonusOnUpgrade: 5000
    },
    storageLimitMb: 102400,
    support: {
      level: 'dedicated',
      responseTime: '1 hour',
      channels: ['email', 'chat', 'whatsapp', 'phone', 'dedicated_manager']
    },
    trustScoreBoost: 30,
    verificationLevel: 'enterprise_verified',
    aiTier: 'esyai_enterprise',
    priorityRanking: 3,
    branding: {
      badge: 'Enterprise Badge',
      color: '#EC4899',
      icon: 'enterprise_badge'
    },
    features: {
      core: [
        'Everything in Business, plus:',
        'Dedicated AI Trade Consultant',
        'Custom API Access & Webhooks',
        'ERP/CRM Integration Support',
        'Unlimited Team Workspace',
        'SLA Guaranteed Support (1hr)',
        'Dedicated Account Manager',
        'Custom Feature Development',
        'White-label Options Available'
      ],
      ai: [
        'Personal AI Procurement Manager',
        'AI Daily Briefs & Weekly Reports',
        'Advanced Risk & Compliance AI',
        'AI Profit Optimization Engine',
        'Custom AI Model Training'
      ],
      highlighted: [
        '15,000 AI Credits/Month',
        'Dedicated Account Manager',
        '1-Hour Response SLA',
        'Custom Integration Support'
      ]
    },
    restrictions: {
      rfqsPerMonth: -1,
      quotationsPerMonth: -1,
      maxActiveMessages: -1,
      maxServiceBookings: -1,
      maxMarketInsights: -1,
      maxImageUploads: -1,
      maxDocuments: -1,
      maxSavedProducts: -1,
      maxSavedSellers: -1,
      maxWishlistItems: -1,
      products: 0,
      teamMembers: -1
    },
    isPopular: false,
    isActive: true,
    metadata: {
      version: '2.0',
      lastUpdated: new Date(),
      region: 'india'
    }
  },

  // ==================== SELLER TIERS ====================
  {
    key: 'seller_starter',
    role: 'seller',
    tier: 'starter',
    name: 'Starter',
    subtitle: 'For New Sellers',
    description: 'Start your export journey with essential store tools & basic AI assistance',
    prices: {
      monthly: { amount: 0, currency: 'INR', symbol: '₹' },
      quarterly: { amount: 0, currency: 'INR', symbol: '₹' },
      yearly: { amount: 0, currency: 'INR', symbol: '₹' }
    },
    aiCredits: {
      monthly: 500,
      rollover: false,
      bonusOnUpgrade: 0
    },
    storageLimitMb: 500,
    support: {
      level: 'standard',
      responseTime: '48 hours',
      channels: ['email', 'help_center']
    },
    trustScoreBoost: 0,
    verificationLevel: 'basic',
    aiTier: 'esyai_lite',
    priorityRanking: 0,
    branding: {
      badge: null,
      color: '#6B7280',
      icon: 'starter_badge'
    },
    features: {
      core: [
        'Basic Store Setup',
        'List Up to 15 Products',
        'Basic RFQ Access & Quoting',
        'Email & Mobile Verification',
        'Basic Analytics Dashboard',
        'Standard Support Access'
      ],
      ai: [
        'Basic Product Description Generator',
        'Simple Chat Q&A',
        'Basic Keyword Suggestions'
      ],
      highlighted: [
        'Free Forever',
        'No Credit Card Required',
        '15 Product Listings',
        '500 AI Credits Monthly'
      ]
    },
    restrictions: {
      rfqsPerMonth: 10,
      quotationsPerMonth: 20,
      maxActiveMessages: 50,
      maxServiceBookings: 5,
      maxMarketInsights: 10,
      maxImageUploads: 25,
      maxDocuments: 50,
      maxProducts: 15,
      teamMembers: 1
    },
    isPopular: false,
    isActive: true,
    metadata: {
      version: '2.0',
      lastUpdated: new Date(),
      region: 'india'
    }
  },
  {
    key: 'seller_verified',
    role: 'seller',
    tier: 'verified',
    name: 'Verified',
    subtitle: 'For Established Sellers',
    description: 'Build trust with verification badges, advanced AI tools & better visibility',
    prices: {
      monthly: { amount: 2499, currency: 'INR', symbol: '₹' },
      quarterly: { amount: 6749, currency: 'INR', symbol: '₹', savingsPercent: 10 },
      yearly: { amount: 24990, currency: 'INR', symbol: '₹', savingsPercent: 17 }
    },
    aiCredits: {
      monthly: 2000,
      rollover: true,
      maxRollover: 2000,
      bonusOnUpgrade: 1000
    },
    storageLimitMb: 5120,
    support: {
      level: 'priority',
      responseTime: '12 hours',
      channels: ['email', 'chat', 'whatsapp']
    },
    trustScoreBoost: 15,
    verificationLevel: 'business_verified',
    aiTier: 'esyai_pro',
    priorityRanking: 1,
    branding: {
      badge: 'Verified Badge',
      color: '#3B82F6',
      icon: 'verified_badge'
    },
    features: {
      core: [
        'Everything in Starter, plus:',
        'Business & Bank Verification',
        'Verified Badge on Profile',
        'Up to 100 Product Listings',
        'Priority Search Rankings',
        'Priority RFQ Access',
        'Seller Analytics Dashboard',
        'Priority Support (12hr Response)'
      ],
      ai: [
        'AI SEO Title & Keywords Generator',
        'AI Quotation Generator',
        'AI Product Improvement Suggestions',
        'AI Competitor Analysis'
      ],
      highlighted: [
        'Verified Trust Badge',
        '2,000 AI Credits/Month',
        '100 Product Listings',
        'WhatsApp Support',
        'Most Popular'
      ]
    },
    restrictions: {
      rfqsPerMonth: 50,
      quotationsPerMonth: 100,
      maxActiveMessages: 500,
      maxServiceBookings: 25,
      maxMarketInsights: 50,
      maxImageUploads: 200,
      maxDocuments: 500,
      maxProducts: 100,
      teamMembers: 1
    },
    isPopular: true,
    isActive: true,
    metadata: {
      version: '2.0',
      lastUpdated: new Date(),
      region: 'india'
    }
  },
  {
    key: 'seller_gold',
    role: 'seller',
    tier: 'gold',
    name: 'Gold',
    subtitle: 'For Top Sellers',
    description: 'Factory verification, premium visibility & AI-powered sales optimization',
    prices: {
      monthly: { amount: 5999, currency: 'INR', symbol: '₹' },
      quarterly: { amount: 16199, currency: 'INR', symbol: '₹', savingsPercent: 10 },
      yearly: { amount: 59990, currency: 'INR', symbol: '₹', savingsPercent: 17 }
    },
    aiCredits: {
      monthly: 5000,
      rollover: true,
      maxRollover: 5000,
      bonusOnUpgrade: 2500
    },
    storageLimitMb: 20480,
    support: {
      level: 'priority_plus',
      responseTime: '4 hours',
      channels: ['email', 'chat', 'whatsapp', 'phone']
    },
    trustScoreBoost: 25,
    verificationLevel: 'factory_verified',
    aiTier: 'esyai_advanced',
    priorityRanking: 2,
    branding: {
      badge: 'Gold Badge',
      color: '#F59E0B',
      icon: 'gold_badge'
    },
    features: {
      core: [
        'Everything in Verified, plus:',
        'Factory & Export License Verification',
        'Gold Trust Badge',
        'Unlimited Product Listings',
        'Featured Listing Placement',
        'Homepage Visibility',
        'Advanced Sales Analytics',
        'Priority Support (4hr Response)'
      ],
      ai: [
        'AI Catalog & Pricing Optimizer',
        'AI Buyer Matching & Lead Scoring',
        'AI Product Performance Analytics',
        'AI Market Expansion Insights'
      ],
      highlighted: [
        'Gold Trust Badge',
        '5,000 AI Credits/Month',
        'Unlimited Products',
        'Featured Listings',
        'Phone Support'
      ]
    },
    restrictions: {
      rfqsPerMonth: 200,
      quotationsPerMonth: 500,
      maxActiveMessages: 2000,
      maxServiceBookings: 100,
      maxMarketInsights: 200,
      maxImageUploads: 1000,
      maxDocuments: 2000,
      maxProducts: -1,
      teamMembers: 3
    },
    isPopular: false,
    isActive: true,
    metadata: {
      version: '2.0',
      lastUpdated: new Date(),
      region: 'india'
    }
  },
  {
    key: 'seller_enterprise',
    role: 'seller',
    tier: 'enterprise',
    name: 'Enterprise',
    subtitle: 'For Global Exporters',
    description: 'Diamond verification, AI sales automation & global expansion toolkit',
    prices: {
      monthly: { amount: 14999, currency: 'INR', symbol: '₹' },
      quarterly: { amount: 40499, currency: 'INR', symbol: '₹', savingsPercent: 10 },
      yearly: { amount: 149990, currency: 'INR', symbol: '₹', savingsPercent: 17 }
    },
    aiCredits: {
      monthly: 15000,
      rollover: true,
      maxRollover: 15000,
      bonusOnUpgrade: 5000
    },
    storageLimitMb: 102400,
    support: {
      level: 'dedicated',
      responseTime: '1 hour',
      channels: ['email', 'chat', 'whatsapp', 'phone', 'dedicated_manager']
    },
    trustScoreBoost: 35,
    verificationLevel: 'diamond_verified',
    aiTier: 'esyai_enterprise',
    priorityRanking: 3,
    branding: {
      badge: 'Diamond Badge',
      color: '#EC4899',
      icon: 'diamond_badge'
    },
    features: {
      core: [
        'Everything in Gold, plus:',
        'Diamond Badge (Highest Trust)',
        'Legal & Video Verification',
        'Dedicated Success Manager',
        'Custom API Access',
        'Multi-User Workspace',
        'SLA Guaranteed Support (1hr)',
        'Custom Feature Development',
        'White-label Options Available'
      ],
      ai: [
        'AI Sales Manager & Consultant',
        'AI Revenue Forecasting',
        'AI Lead Follow-up Automation',
        'AI Daily Sales Briefs',
        'Custom AI Model Training'
      ],
      highlighted: [
        'Diamond Trust Badge',
        '15,000 AI Credits/Month',
        'Dedicated Success Manager',
        '1-Hour Response SLA',
        'Custom Development'
      ]
    },
    restrictions: {
      rfqsPerMonth: -1,
      quotationsPerMonth: -1,
      maxActiveMessages: -1,
      maxServiceBookings: -1,
      maxMarketInsights: -1,
      maxImageUploads: -1,
      maxDocuments: -1,
      maxProducts: -1,
      teamMembers: -1
    },
    isPopular: false,
    isActive: true,
    metadata: {
      version: '2.0',
      lastUpdated: new Date(),
      region: 'india'
    }
  }
];

// Plan Management Utilities
export async function ensureSubscriptionPlans() {
  try {
    const count = await SubscriptionPlan.countDocuments();
    if (count === 0) {
      console.log('🌱 Seeding subscription plans...');
      await SubscriptionPlan.insertMany(DEFAULT_PLANS);
      console.log('✅ Subscription plans seeded successfully');
    }
  } catch (error) {
    console.error('❌ Error seeding subscription plans:', error);
  }
}

export async function getPlan(key, role) {
  await ensureSubscriptionPlans();
  
  const planAliases = {
    // Legacy compatibility mappings
    'free': `${role}_starter`,
    'buyer_free': 'buyer_starter',
    'buyer_pro': 'buyer_growth',
    'seller_free': 'seller_starter',
    'verified_batch': 'seller_verified',
    'verified_supplier': 'seller_gold',
    'seller_premium': 'seller_gold'
  };

  const resolvedKey = planAliases[key] || key;

  const plan = await SubscriptionPlan.findOne({
    key: resolvedKey,
    role,
    isActive: true
  }).lean();

  if (!plan) {
    console.warn(`⚠️ Plan not found: ${key} for role: ${role}`);
    // Fallback to starter plan
    return SubscriptionPlan.findOne({
      key: `${role}_starter`,
      isActive: true
    }).lean();
  }

  return plan;
}

export async function listPlans(role, options = {}) {
  await ensureSubscriptionPlans();
  
  const { includeInactive = false, sort = { priorityRanking: 1 } } = options;
  
  const query = { role };
  if (!includeInactive) {
    query.isActive = true;
  }

  return SubscriptionPlan.find(query)
    .sort(sort)
    .select('-__v -createdAt -updatedAt')
    .lean();
}

export async function getPlanByTier(role, tier) {
  await ensureSubscriptionPlans();
  
  return SubscriptionPlan.findOne({
    role,
    tier,
    isActive: true
  }).lean();
}

export async function comparePlans(role) {
  await ensureSubscriptionPlans();
  
  const plans = await SubscriptionPlan.find({
    role,
    isActive: true
  })
    .sort({ priorityRanking: 1 })
    .select('key tier name prices features restrictions aiCredits support trustScoreBoost verificationLevel branding')
    .lean();

  return {
    role,
    plans,
    totalTiers: plans.length,
    comparisonDate: new Date()
  };
}