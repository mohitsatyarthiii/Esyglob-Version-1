export type HubItem = {
  title: string;
  icon: string;
  serviceKey?: string;
  route?: string;
  params?: Record<string, unknown>;
  keywords?: string[];
  description?: string;
  stats?: string;
  badge?: string;
  badgeColor?: string;
  popular?: boolean;
};

export type ServiceHub = {
  key: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  tint: string;
  stats?: { label: string; value: string; icon: string }[];
  items: HubItem[];
};

const item = (
  title: string,
  icon: string,
  options?: {
    serviceKey?: string;
    route?: string;
    params?: Record<string, unknown>;
    description?: string;
    stats?: string;
    badge?: string;
    badgeColor?: string;
    popular?: boolean;
  }
): HubItem => ({
  title,
  icon,
  serviceKey: options?.serviceKey,
  route: options?.route,
  params: options?.params,
  description: options?.description,
  stats: options?.stats,
  badge: options?.badge,
  badgeColor: options?.badgeColor,
  popular: options?.popular,
});

export const SERVICE_HUBS: ServiceHub[] = [
  // 📦 LOGISTICS
  {
    key: 'logistics',
    title: 'Logistics & Shipment',
    description: 'Book, track & manage international shipments with end-to-end visibility.',
    icon: 'truck-fast-outline',
    color: '#0284C7',
    tint: '#E0F2FE',
    stats: [
      { label: 'Carriers', value: '50+', icon: 'ferry' },
      { label: 'Countries', value: '180+', icon: 'earth' },
      { label: 'Active', value: '24/7', icon: 'clock-outline' },
    ],
    items: [
      item('Book Shipment', 'truck-delivery-outline', {
        serviceKey: 'shipping',
        description: 'Ocean, air, express & courier options with real-time tracking',
        stats: '2-7 days delivery',
        badge: 'Popular',
        badgeColor: '#f97316',
        popular: true,
      }),
      item('Customs Clearance', 'office-building-cog-outline', {
        serviceKey: 'customs-brokerage',
        description: 'Import/export clearance with HS codes & duty estimates',
        stats: '2-6 days processing',
        badge: 'Essential',
        badgeColor: '#10b981',
      }),
      item('Warehousing', 'warehouse', {
        serviceKey: 'warehousing',
        description: 'Storage, inventory management & fulfillment operations',
        stats: '1-3 days setup',
        badge: 'Limited',
        badgeColor: '#f59e0b',
      }),
      item('Documentation', 'file-export-outline', {
        serviceKey: 'documentation-support',
        description: 'Commercial invoices, packing lists & trade documents',
        stats: '1-4 days turnaround',
        badge: 'New',
        badgeColor: '#3b82f6',
      }),
    ],
  },

  // 🛡️ INSURANCE & CONSULTING
  {
    key: 'insurance',
    title: 'Insurance & Consulting',
    description: 'Protect your cargo and get expert guidance for international trade.',
    icon: 'shield-account-outline',
    color: '#7C3AED',
    tint: '#F3E8FF',
    stats: [
      { label: 'Coverage', value: '100%', icon: 'shield-check-outline' },
      { label: 'Experts', value: '200+', icon: 'account-tie-outline' },
      { label: 'Response', value: '<4hrs', icon: 'timer-outline' },
    ],
    items: [
      item('Cargo Insurance', 'shield-airplane-outline', {
        serviceKey: 'insurance',
        description: 'Comprehensive cargo & shipment insurance coverage',
        stats: 'Quote in 24hrs',
        badge: 'Recommended',
        badgeColor: '#8b5cf6',
        popular: true,
      }),
      item('Trade Consulting', 'account-tie-outline', {
        serviceKey: 'consulting',
        description: 'Expert advice on sourcing, compliance & market entry',
        stats: '1-5 days response',
        badge: 'Premium',
        badgeColor: '#ec4899',
      }),
      item('Quality Inspection', 'medal-outline', {
        serviceKey: 'quality-inspection',
        description: 'Factory audits, pre-shipment & loading inspections',
        stats: 'From $149',
        badge: 'Trusted',
        badgeColor: '#6366f1',
      }),
    ],
  },

  // 💰 BANKING & FINANCING
  {
    key: 'banking',
    title: 'Banking & Financing',
    description: 'Secure payments, escrow protection & flexible trade financing.',
    icon: 'bank-outline',
    color: '#059669',
    tint: '#D1FAE5',
    stats: [
      { label: 'Volume', value: '$500M+', icon: 'cash-multiple' },
      { label: 'Payout', value: '<48hrs', icon: 'clock-fast' },
      { label: 'Currencies', value: '30+', icon: 'currency-usd' },
    ],
    items: [
      item('Wallet & Payments', 'wallet-outline', {
        route: 'Wallet',
        description: 'Multi-currency wallet with instant transfers & withdrawals',
        stats: '0% transfer fee',
        badge: 'Active',
        badgeColor: '#10b981',
        popular: true,
      }),
      item('Escrow Services', 'shield-lock-outline', {
        serviceKey: 'escrow',
        description: 'Secure milestone payments with buyer-seller protection',
        stats: 'Same day setup',
        badge: 'Secure',
        badgeColor: '#059669',
      }),
      item('Trade Financing', 'finance', {
        serviceKey: 'trade-financing',
        description: 'PO financing, invoice factoring & working capital loans',
        stats: '3-10 days approval',
        badge: 'Flexible',
        badgeColor: '#0284C7',
      }),
    ],
  },

  // 🔒 TRADE ASSURANCE
  {
    key: 'assurance',
    title: 'Trade Assurance',
    description: 'End-to-end order protection, dispute resolution & verification.',
    icon: 'shield-star-outline',
    color: '#EA580C',
    tint: '#FFEDD5',
    stats: [
      { label: 'Orders', value: '50K+', icon: 'package-variant-closed' },
      { label: 'Claims', value: '99%', icon: 'check-circle-outline' },
      { label: 'Coverage', value: 'Full', icon: 'umbrella-outline' },
    ],
    items: [
      item('Protected Orders', 'shield-check-outline', {
        route: 'Orders',
        description: 'Track order coverage, quality & delivery guarantees',
        stats: 'Real-time status',
        badge: 'Live',
        badgeColor: '#10b981',
        popular: true,
      }),
      item('File a Dispute', 'clipboard-alert-outline', {
        serviceKey: 'dispute-resolution',
        description: 'Resolve quality, delivery or payment disputes quickly',
        stats: '7-15 days resolution',
        badge: 'Priority',
        badgeColor: '#ef4444',
      }),
      item('Claims History', 'gavel', {
        serviceKey: 'dispute-resolution',
        description: 'View all past & ongoing claims with detailed timelines',
        stats: 'Full history',
        badge: 'Track',
        badgeColor: '#f59e0b',
      }),
      item('Buyer Protection', 'account-lock-outline', {
        route: 'Orders',
        description: 'Refund guarantee if orders don\'t meet specifications',
        stats: '100% refund',
        badge: 'Guaranteed',
        badgeColor: '#6366f1',
      }),
      item('Seller Protection', 'store-lock-outline', {
        route: 'Orders',
        description: 'Payment assurance for verified sellers on every order',
        stats: 'Secure payout',
        badge: 'Verified',
        badgeColor: '#8b5cf6',
      }),
      item('Verification', 'check-decagram-outline', {
        route: 'SellerOnboarding',
        description: 'Get your business verified to unlock premium features',
        stats: '2-5 days process',
        badge: 'Important',
        badgeColor: '#ea580c',
      }),
    ],
  },

  // 🎯 HELP & SUPPORT
  {
    key: 'support',
    title: 'Help & Support',
    description: '24/7 assistance, knowledge base & dedicated account managers.',
    icon: 'lifebuoy',
    color: '#DC2626',
    tint: '#FEE2E2',
    stats: [
      { label: 'Satisfaction', value: '98%', icon: 'emoticon-happy-outline' },
      { label: 'Response', value: '<5min', icon: 'message-reply-text-outline' },
      { label: 'Languages', value: '15+', icon: 'translate' },
    ],
    items: [
      item('Raise Support Ticket', 'ticket-confirmation-outline', {
        route: 'HelpSupport',
        params: { focus: 'ticket' },
        description: 'Create a support ticket and track its status',
        stats: 'All statuses',
        badge: 'Track',
        badgeColor: '#6366f1',
        popular: true,
      }),
      item('Service History', 'briefcase-clock-outline', {
        route: 'BookedServiceDetails',
        params: { mode: 'list' },
        description: 'Complete history of all your booked services & requests',
        stats: 'Lifetime records',
        badge: 'Archive',
        badgeColor: '#64748b',
      }),
      item('FAQ & Guides', 'book-open-page-variant-outline', {
        route: 'HelpSupport',
        params: { focus: 'faq' },
        description: 'Detailed guides, tutorials & frequently asked questions',
        stats: '200+ articles',
        badge: 'Learn',
        badgeColor: '#10b981',
      }),
      item('Contact Support', 'headset', {
        route: 'HelpSupport',
        description: 'Email, phone & callback options for personalized help',
        stats: '24/7 available',
        badge: 'Human',
        badgeColor: '#f97316',
      }),
      item('Live Chat', 'message-processing-outline', {
        route: 'AIChat',
        description: 'Get instant help from the existing EsyAI assistant',
        stats: 'Avg <2min reply',
        badge: 'Fastest',
        badgeColor: '#ef4444',
        popular: true,
      }),
    ],
  },

  // 🧰 TOOLS & UTILITIES
  {
    key: 'tools',
    title: 'Trade Tools',
    description: 'Powerful calculators, search tools & productivity enhancers.',
    icon: 'tools',
    color: '#4F46E5',
    tint: '#E0E7FF',
    stats: [
      { label: 'Tools', value: '8+', icon: 'toolbox-outline' },
      { label: 'Users', value: '10K+', icon: 'account-multiple-outline' },
      { label: 'Free', value: '100%', icon: 'gift-outline' },
    ],
    items: [
      item('Esy Calculator', 'calculator-variant-outline', {
        route: 'EsyCalculator',
        description: 'Import/export cost, duties & margin calculator',
        stats: 'Free tool',
        badge: 'Popular',
        badgeColor: '#f97316',
        popular: true,
      }),
      item('HS Code Finder', 'barcode-scan', {
        route: 'HSCodeFinder',
        description: 'Search HS codes for any product category worldwide',
        stats: '10K+ codes',
        badge: 'Essential',
        badgeColor: '#10b981',
      }),
      item('Image Search', 'image-search-outline', {
        route: 'ImageSearch',
        description: 'Find products & suppliers using product images',
        stats: 'AI powered',
        badge: 'Smart',
        badgeColor: '#8b5cf6',
      }),
      item('Currency Converter', 'currency-usd', {
        route: 'EsyCalculator',
        params: { tab: 'currency' },
        description: 'Real-time exchange rates for 30+ global currencies',
        stats: 'Live rates',
        badge: 'Real-time',
        badgeColor: '#3b82f6',
      }),
    ],
  },
];

export function getServiceHub(key: string) {
  return SERVICE_HUBS.find(hub => hub.key === key);
}

export function getHubStats() {
  return {
    totalServices: SERVICE_HUBS.reduce((acc, hub) => acc + hub.items.length, 0),
    totalHubs: SERVICE_HUBS.length,
    popularServices: SERVICE_HUBS.flatMap(hub => hub.items).filter(item => item.popular).length,
  };
}

export function searchServices(query: string) {
  const q = query.toLowerCase();
  return SERVICE_HUBS.flatMap(hub =>
    hub.items.filter(
      item =>
        item.title.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q) ||
        item.keywords?.some(k => k.toLowerCase().includes(q))
    )
  );
}
