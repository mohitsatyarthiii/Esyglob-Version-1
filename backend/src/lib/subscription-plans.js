import SubscriptionPlan from '../models/SubscriptionPlan.js';

export const DEFAULT_PLANS = [
  // ==================== BUYER PLANS ====================
  {
    key: 'buyer_free',
    role: 'buyer',
    name: 'Free Buyer',
    description: 'For new buyers & small businesses starting their sourcing journey',
    prices: { monthly: 0, quarterly: 0, yearly: 0 },
    aiCredits: 1500, // INCREASED (Ollama friendly, was 500)
    storageLimitMb: 200, // INCREASED (was 100)
    supportLevel: 'standard',
    trustScoreBoost: 0,
    verificationLevel: 'basic',
    aiTier: 'esyai_lite',
    priorityRanking: 0,
    features: [
      // Core Marketplace
      '[Marketplace] Unlimited Product Browsing',
      '[Marketplace] Unlimited Seller Browsing',
      '[Marketplace] Save Products & Sellers',
      '[Marketplace] Basic RFQ Creation',
      '[Marketplace] Standard Search Filters',
      
      // AI Capabilities (Lite)
      '[EsyAI Lite] Basic AI Chat & Q&A',
      '[EsyAI Lite] Basic Product/Search Suggestions',
      '[EsyAI Lite] Basic Trade Calculator',
      
      // Tools
      '[Tools] Basic Shipment Tracking',
      '[Tools] Standard Support',
    ],
    limits: {
      aiRequests: 1500, // INCREASED (was 500)
      rfqs: 30,
      quotations: 30,
      products: 0,
      messages: 200,
      serviceBookings: 20,
      marketInsights: 20,
      imageUploads: 50,
      documents: 100,
      savedProducts: 500,
      savedSellers: 200,
      wishlistItems: 300,
    },
  },
  {
    key: 'buyer_pro',
    role: 'buyer',
    name: 'Buyer Pro',
    description: 'Smart AI tools & priority access for serious buyers',
    prices: { monthly: 1499, quarterly: 3999, yearly: 14990 },
    aiCredits: 500,
    storageLimitMb: 2048,
    supportLevel: 'priority',
    trustScoreBoost: 5,
    verificationLevel: 'basic',
    aiTier: 'esyai_pro',
    priorityRanking: 1,
    features: [
      '[Marketplace] Everything in Free Buyer',
      
      // Advanced AI (Pro)
      '[EsyAI Pro] Personalized AI Recommendations',
      '[EsyAI Pro] AI Price & MOQ Comparison',
      '[EsyAI Pro] AI RFQ Generator & Improver',
      '[EsyAI Pro] AI Smart Replies for Messages',
      '[EsyAI Pro] AI Market Insights (Advanced)',
      
      // Premium Tools
      '[Tools] Advanced Search Filters',
      '[Tools] Priority RFQ Placement',
      '[Tools] AI Recommended Sellers & Products',
      '[Tools] Trade Assurance & Escrow Access',
      '[Tools] Priority Support',
    ],
    limits: {
      aiRequests: 500,
      rfqs: 20,
      quotations: 30,
      products: 0,
      messages: 200,
      serviceBookings: 10,
      marketInsights: 20,
      imageUploads: 100,
      documents: 200,
      savedProducts: 500,
      savedSellers: 200,
      wishlistItems: -1,
    },
  },
  {
    key: 'buyer_business',
    role: 'buyer',
    name: 'Buyer Business',
    description: 'Advanced trade intelligence & AI business assistant for growing importers',
    prices: { monthly: 3999, quarterly: 10799, yearly: 39990 },
    aiCredits: 2000,
    storageLimitMb: 10240,
    supportLevel: 'priority',
    trustScoreBoost: 10,
    verificationLevel: 'business',
    aiTier: 'esyai_advanced',
    priorityRanking: 2,
    features: [
      '[Marketplace] Everything in Buyer Pro',
      
      // Business AI (Advanced)
      '[EsyAI Advanced] AI Trade Consultant & Negotiation Assistant',
      '[EsyAI Advanced] AI Import/Export Guide',
      '[EsyAI Advanced] AI Customs & Compliance Checker',
      '[EsyAI Advanced] AI Demand & Trend Forecasting',
      
      // Intelligence
      '[Intelligence] Country Wise Trade Insights',
      '[Intelligence] Import/Export Data Access',
      '[Intelligence] Tariff & Duty Calculator',
      '[Intelligence] HS Code Finder',
      
      // Collaboration
      '[Team] Multi-Team Access (Up to 5 Members)',
      '[Team] Shared RFQs & Wishlists',
      '[Team] Advanced Analytics Dashboard',
      '[Team] Dedicated Priority Support',
    ],
    limits: {
      aiRequests: 2000,
      rfqs: 100,
      quotations: 150,
      products: 0,
      messages: 1000,
      serviceBookings: 50,
      marketInsights: 100,
      imageUploads: 500,
      documents: 1000,
      savedProducts: -1,
      savedSellers: -1,
      wishlistItems: -1,
      teamMembers: 5,
    },
  },
  {
    key: 'buyer_enterprise',
    role: 'buyer',
    name: 'Buyer Enterprise',
    description: 'Full-scale enterprise procurement with personal AI trade consultant',
    prices: { monthly: 9999, quarterly: 26999, yearly: 99990 },
    aiCredits: 10000,
    storageLimitMb: 51200,
    supportLevel: 'dedicated',
    trustScoreBoost: 20,
    verificationLevel: 'enterprise',
    aiTier: 'esyai_enterprise',
    priorityRanking: 3,
    features: [
      '[Marketplace] Everything in Buyer Business',
      
      // Full Enterprise AI
      '[EsyAI Enterprise] Personal AI Trade Consultant',
      '[EsyAI Enterprise] AI Daily Briefs & Weekly Reports',
      '[EsyAI Enterprise] AI Risk & Supply Chain Analysis',
      '[EsyAI Enterprise] AI Procurement & Profit Optimization',
      
      // Enterprise Tools
      '[Enterprise] API Access',
      '[Enterprise] Dedicated Account Manager',
      '[Enterprise] SLA Guaranteed Support',
      '[Enterprise] Unlimited Team Workspace',
      '[Enterprise] ERP Integration Ready',
    ],
    limits: {
      aiRequests: 10000,
      rfqs: -1,
      quotations: -1,
      products: 0,
      messages: -1,
      serviceBookings: -1,
      marketInsights: -1,
      imageUploads: -1,
      documents: -1,
      savedProducts: -1,
      savedSellers: -1,
      wishlistItems: -1,
      teamMembers: -1,
    },
  },

  // ==================== SELLER PLANS ====================
  {
    key: 'seller_free',
    role: 'seller',
    name: 'Free Seller',
    description: 'Start selling on EsyGlob with basic store & tools',
    prices: { monthly: 0, quarterly: 0, yearly: 0 },
    aiCredits: 1500, // INCREASED (Ollama friendly, was 50)
    storageLimitMb: 200, // INCREASED (was 100)
    supportLevel: 'standard',
    trustScoreBoost: 0,
    verificationLevel: 'basic',
    aiTier: 'esyai_lite',
    priorityRanking: 0,
    features: [
      // Marketplace
      '[Marketplace] Basic Store Setup',
      '[Marketplace] List up to 15 Products',
      '[Marketplace] Basic RFQ Access & Messaging',
      
      // AI Lite
      '[EsyAI Lite] Basic Product Description Generator',
      '[EsyAI Lite] Basic AI Chat Q&A',
      
      // Verification
      '[Verification] Email & Mobile Verification',
      '[Tools] Standard Support',
    ],
    limits: {
      aiRequests: 1500, // INCREASED (was 500)
      rfqs: 30,
      quotations: 30,
      products: 15,
      messages: 60,
      serviceBookings: 20,
      marketInsights: 20,
      imageUploads: 50,
      documents: 100,
    },
  },
  {
    key: 'seller_verified',
    role: 'seller',
    name: 'Verified Seller',
    description: 'Get verified, build trust & unlock growth tools',
    prices: { monthly: 2499, quarterly: 6749, yearly: 24990 },
    aiCredits: 500,
    storageLimitMb: 2048,
    supportLevel: 'priority',
    trustScoreBoost: 10,
    verificationLevel: 'business',
    aiTier: 'esyai_pro',
    priorityRanking: 1,
    features: [
      '[Marketplace] Everything in Free Seller',
      
      // Verification
      '[Verification] GST, PAN, Business & Bank Verification',
      '[Verification] Verified Badge on Profile',
      '[Verification] Higher Trust Score (+10)',
      
      // AI Pro
      '[EsyAI Pro] Advanced AI SEO Title & Keywords Generator',
      '[EsyAI Pro] AI Quotation Generator',
      '[EsyAI Pro] AI Product Improvement Suggestions',
      
      // Growth
      '[Growth] Unlock up to 50 Products',
      '[Growth] Better Search Rankings',
      '[Growth] Priority RFQ Access',
      '[Growth] Seller Analytics Dashboard',
      '[Growth] Priority Support',
    ],
    limits: {
      aiRequests: 500,
      rfqs: 20,
      quotations: 30,
      products: 50,
      messages: 200,
      serviceBookings: 10,
      marketInsights: 20,
      imageUploads: 100,
      documents: 200,
    },
  },
  {
    key: 'seller_gold',
    role: 'seller',
    name: 'Gold Seller',
    description: 'Factory verified, priority ranking & AI-powered sales optimization',
    prices: { monthly: 5999, quarterly: 16199, yearly: 59990 },
    aiCredits: 2500,
    storageLimitMb: 10240,
    supportLevel: 'priority',
    trustScoreBoost: 20,
    verificationLevel: 'factory',
    aiTier: 'esyai_advanced',
    priorityRanking: 2,
    features: [
      '[Marketplace] Everything in Verified Seller',
      
      // Premium Verification
      '[Verification] Factory & Export License Verification',
      '[Verification] Gold Badge on Profile',
      '[Verification] Premium Trust Score (+20)',
      
      // AI Advanced
      '[EsyAI Advanced] AI Catalog & Pricing Optimizer',
      '[EsyAI Advanced] AI Competitor Analysis',
      '[EsyAI Advanced] AI Buyer Matching & Lead Suggestions',
      '[EsyAI Advanced] AI Product Performance Analytics',
      
      // Growth
      '[Growth] Featured Listings & Homepage Placement',
      '[Growth] Unlimited Products',
      '[Growth] Advanced Analytics & Sales Reports',
      '[Growth] Priority Support',
    ],
    limits: {
      aiRequests: 2500,
      rfqs: 100,
      quotations: 150,
      products: -1,
      messages: 1000,
      serviceBookings: 50,
      marketInsights: 100,
      imageUploads: 500,
      documents: 1000,
    },
  },
  {
    key: 'seller_enterprise',
    role: 'seller',
    name: 'Enterprise Seller',
    description: 'Diamond verification, AI sales manager & global expansion tools',
    prices: { monthly: 14999, quarterly: 40499, yearly: 149990 },
    aiCredits: 10000,
    storageLimitMb: 51200,
    supportLevel: 'dedicated',
    trustScoreBoost: 30,
    verificationLevel: 'diamond',
    aiTier: 'esyai_enterprise',
    priorityRanking: 3,
    features: [
      '[Marketplace] Everything in Gold Seller',
      
      // Enterprise Verification
      '[Verification] Diamond Badge (Highest Trust)',
      '[Verification] Legal & Video Verification',
      '[Verification] Premium Trust Score (+30)',
      
      // AI Enterprise
      '[EsyAI Enterprise] AI Sales Manager & Business Consultant',
      '[EsyAI Enterprise] AI Revenue Forecast & Global Expansion Insights',
      '[EsyAI Enterprise] AI Lead Qualification & Follow-up Automation',
      '[EsyAI Enterprise] AI Daily Sales Brief & Weekly Reports',
      
      // Enterprise Tools
      '[Enterprise] API Access',
      '[Enterprise] Dedicated Success Manager',
      '[Enterprise] Premium SLA Support',
      '[Enterprise] Multi-User Workspace',
      '[Enterprise] Custom Feature Development',
    ],
    limits: {
      aiRequests: 10000,
      rfqs: -1,
      quotations: -1,
      products: -1,
      messages: -1,
      serviceBookings: -1,
      marketInsights: -1,
      imageUploads: -1,
      documents: -1,
      teamMembers: -1,
    },
  },
];

export async function ensureSubscriptionPlans() {
  const count = await SubscriptionPlan.countDocuments();
  if (!count) {
    await SubscriptionPlan.insertMany(DEFAULT_PLANS);
  }
}

export async function getPlan(key, role) {
  await ensureSubscriptionPlans();
  const aliases = {
    free: `${role}_free`,
    basic: 'buyer_pro',
    standard: 'buyer_business',
    prime: 'buyer_enterprise',
    buyer_basic: 'buyer_pro',
    buyer_standard: 'buyer_business',
    buyer_prime: 'buyer_enterprise',
    verified_batch: 'seller_verified',
    verified_supplier: 'seller_gold',
  };
  return SubscriptionPlan.findOne({
    key: aliases[key] || key,
    role,
    status: 'active',
  }).lean();
}

export async function listPlans(role) {
  await ensureSubscriptionPlans();
  return SubscriptionPlan.find({ role, status: 'active' })
    .sort({ priorityRanking: 1 })
    .lean();
}
