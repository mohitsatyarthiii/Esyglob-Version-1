import { listPlans } from '../lib/subscription-plans.js';
import { listServices } from '../lib/services-catalog.js';
import Dispute from '../models/Dispute.js';
import ShippingOrder from '../models/ShippingOrder.js';
import TradeAssurance from '../models/TradeAssurance.js';
import PaymentMethod from '../models/PaymentMethod.js';
import HSCodeService from './hs-code.service.js';

const FEATURE_ACTIONS = [
  { test: /subscription|membership|premium|plan|ai credit/i, label: 'Membership plans', route: 'SubscriptionCenter', icon: 'crown-outline' },
  { test: /market insight|market research|import|export intelligence/i, label: 'Market Insights', route: 'MarketInsights', icon: 'chart-timeline-variant' },
  { test: /trade assurance|buyer protection|escrow/i, label: 'Trade Assurance', route: 'TradeAssurance', icon: 'shield-check-outline' },
  { test: /shipping|shipment|logistics|tracking/i, label: 'Shipping & Logistics', route: 'ShippingService', icon: 'truck-outline' },
  { test: /refund|return|dispute/i, label: 'Disputes & refunds', route: 'DisputeService', icon: 'scale-balance' },
  { test: /support|help|faq|policy/i, label: 'Help & Support', route: 'HelpSupport', icon: 'lifebuoy' },
  { test: /rfq|request for quotation/i, label: 'RFQs & Quotations', route: 'RFQ', icon: 'file-document-outline' },
  { test: /\border|purchase/i, label: 'My Orders', route: 'Orders', icon: 'package-variant-closed' },
  { test: /service/i, label: 'Marketplace Services', route: 'MainTabs', params: { screen: 'Services' }, icon: 'briefcase-outline' },
  { test: /categor/i, label: 'Browse Categories', route: 'MainTabs', params: { screen: 'Categories' }, icon: 'shape-outline' },
];

function action(label, route, params = {}, icon = 'arrow-right-circle-outline', entityType = 'feature') {
  return { id: `${entityType}:${route}:${JSON.stringify(params)}`, label, route, params, icon, entityType };
}

function navigationActions(message, results, role) {
  const actions = [];
  (results.products || []).slice(0, 6).forEach(item => actions.push(action(item.name || 'Open product', 'ProductDetails', { productId: String(item._id) }, 'package-variant', 'product')));
  (results.suppliers || []).slice(0, 6).forEach(item => actions.push(action(item.companyName || item.businessName || 'Open seller', 'SellerDetails', { sellerId: String(item._id) }, 'factory', 'seller')));
  (results.categories || []).slice(0, 4).forEach(item => actions.push(action(item.name || 'Open category', 'ProductListing', { category: item.name || item.slug, categoryName: item.name }, 'shape-outline', 'category')));
  (results.rfqs || []).slice(0, 4).forEach(item => actions.push(action(item.title || 'Open RFQ', 'RFQDetails', { rfqId: String(item._id) }, 'file-document-outline', 'rfq')));
  (results.quotations || []).slice(0, 4).forEach(item => actions.push(action(item.rfqId?.title || item.productId?.name || 'Open quotation', 'QuotationDetails', { quotationId: String(item._id) }, 'cash-multiple', 'quotation')));
  (results.orders || []).slice(0, 4).forEach(item => actions.push(action(item.orderNumber || 'Open order', 'OrderDetails', { orderId: String(item._id) }, 'package-variant-closed', 'order')));
  (results.services || []).slice(0, 4).forEach(item => actions.push(action(item.title, 'ServiceDetails', { serviceKey: item.key }, 'briefcase-outline', 'service')));
  FEATURE_ACTIONS.filter(item => item.test.test(message)).forEach(item => actions.push(action(item.label, item.route, { role, ...(item.params || {}) }, item.icon)));
  return [...new Map(actions.map(item => [item.id, item])).values()].slice(0, 20);
}

function needsPlans(message) {
  return /subscription|membership|premium|plan|pricing|price.*plan|ai credit|storage limit|feature limit/i.test(message);
}

function needsServices(message) {
  return /service|trade assurance|escrow|shipping|logistics|inspection|verification|warehouse|financ|customs|dispute|document|tax|support/i.test(message);
}

export default class AIPlatformContextService {
  static async enrich({ message, role, results, userId }) {
    const wantsDisputes = /my .*dispute|dispute.*status|refund.*status/i.test(message);
    const wantsShipping = /my .*ship|track.*ship|shipment.*status|logistics.*status/i.test(message);
    const wantsAssurance = /my .*assurance|assurance.*status|protected order/i.test(message);
    const wantsPayments = /my payment method|saved payment|payment method/i.test(message);
    const wantsHsCodes = /product|import|export|trade|customs|hs\s*code|tariff|classification|market research|regulation/i.test(message);
    const [plans, services, disputes, shipments, assurances, paymentMethods, hsCodes] = await Promise.all([
      needsPlans(message) ? listPlans(role === 'seller' ? 'seller' : 'buyer') : Promise.resolve([]),
      Promise.resolve(needsServices(message) ? listServices() : []),
      wantsDisputes ? Dispute.find({ $or: [{ initiatorId: userId }, { respondentId: userId }] }).select('_id disputeNumber transactionType type title status claimAmount currency createdAt updatedAt').sort({ updatedAt: -1 }).limit(8).lean() : [],
      wantsShipping ? ShippingOrder.find({ userId }).select('_id orderNumber type status pickup.country delivery.country carrier trackingNumber estimatedDelivery shippingCost currency createdAt').sort({ createdAt: -1 }).limit(8).lean() : [],
      wantsAssurance ? TradeAssurance.find({ userId }).select('_id orderId assuranceNumber status orderAmount currency expectedDeliveryDate inspectionRequired inspectionResult coverageAmount coverageType refundAmount createdAt').sort({ createdAt: -1 }).limit(8).lean() : [],
      wantsPayments ? PaymentMethod.find({ userId, role: role === 'seller' ? 'seller' : 'buyer' }).select('_id type label bankName maskedAccountNumber cardBrand cardLast4 verificationStatus isDefault').sort({ isDefault: -1, createdAt: -1 }).limit(8).lean() : [],
      wantsHsCodes ? HSCodeService.search({ query: message, limit: 8 }).then(result => result.items).catch(() => []) : [],
    ]);
    const safePlans = plans.map(plan => ({
      key: plan.key, name: plan.name, description: plan.description, prices: plan.prices,
      features: plan.features, aiCredits: plan.aiCredits, storageLimitMb: plan.storageLimitMb,
      supportLevel: plan.supportLevel, verificationLevel: plan.verificationLevel,
      trustScoreBoost: plan.trustScoreBoost, limits: plan.limits,
    }));
    const safeServices = services.map(service => ({ key: service.key, title: service.title, description: service.description, requirements: service.requirements, benefits: service.benefits }));
    const modelPlans = safePlans.map(plan => ({ key: plan.key, name: plan.name, prices: plan.prices, aiCredits: plan.aiCredits, supportLevel: plan.supportLevel, verificationLevel: plan.verificationLevel, limits: plan.limits, features: plan.features?.slice(0, 6), totalFeatures: plan.features?.length || 0 }));
    const modelServices = safeServices.slice(0, 8).map(service => ({ key: service.key, title: service.title, description: service.description }));
    return {
      plans: safePlans,
      services: safeServices,
      account: { disputes, shipments, assurances, paymentMethods },
      hsCodes,
      navigationActions: navigationActions(message, results, role),
      text: [
        modelPlans.length ? `Live ${role} membership plan essentials (full records are available in response data):\n${JSON.stringify(modelPlans)}` : '',
        modelServices.length ? `Current marketplace services:\n${JSON.stringify(modelServices)}` : '',
        disputes.length ? `Authorized current-user disputes:\n${JSON.stringify(disputes)}` : '',
        shipments.length ? `Authorized current-user shipments:\n${JSON.stringify(shipments)}` : '',
        assurances.length ? `Authorized current-user Trade Assurance records:\n${JSON.stringify(assurances)}` : '',
        paymentMethods.length ? `Authorized current-user payment methods (masked fields only):\n${JSON.stringify(paymentMethods)}` : '',
        hsCodes.length ? `HS classification candidates from the live EsyGlob HS database:\n${JSON.stringify(hsCodes.map(item => ({ code: item.code, description: item.officialDescription, chapter: item.chapter, category: item.category, certifications: item.applicableCertifications })).slice(0, 8))}` : wantsHsCodes ? 'The HS classification database returned no matching seeded records. Do not guess a code; ask the user to verify classification.' : '',
      ].filter(Boolean).join('\n'),
    };
  }
}
