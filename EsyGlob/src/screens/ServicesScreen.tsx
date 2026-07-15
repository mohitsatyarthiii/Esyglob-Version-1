import React, { useMemo } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  StatusBar,
  ScrollView,
  Dimensions,
  Platform,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { fetchAggregatedServiceActivity } from '../api/services';
import { useAuth } from '../auth/AuthContext';
import { SERVICE_HUBS } from '../services/serviceHubs';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Design System ──────────────────────────────────────────────────────────

const D = {
  surface: '#FFFFFF',
  background: '#F8FAFC',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  text: '#0F172A',
  textSecondary: '#475569',
  textTertiary: '#94A3B8',
  primary: '#2563EB',
  primaryLight: '#EFF6FF',
  success: '#059669',
  successLight: '#ECFDF5',
  warning: '#D97706',
  warningLight: '#FFFBEB',
  violet: '#7C3AED',
  violetLight: '#F5F3FF',
  orange: '#F97316',
  orangeLight: '#FFF7ED',
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
};

// ─── Service Hub Detailed Data ──────────────────────────────────────────────

 const HUB_DETAILS: Record<string, {
  tagline: string;
  stats: { icon: string; label: string; value: string }[];
  features: { icon: string; title: string; desc: string }[];
  highlights: string[];
}> = {
  'logistics': {
    tagline: 'Global shipping & freight management',
    stats: [
      { icon: 'truck-fast', label: 'Active Carriers', value: '45+' },
      { icon: 'anchor', label: 'Ports Covered', value: '25+' },
      { icon: 'package-variant-closed', label: 'Monthly Shipments', value: '500+' },
    ],
    features: [
      { icon: 'ship', title: 'Freight Forwarding', desc: 'Sea, air & land freight solutions worldwide' },
      { icon: 'clipboard-check', title: 'Customs Clearance', desc: 'Hassle-free documentation & clearance' },
      { icon: 'warehouse', title: 'Warehousing', desc: 'Secure storage in 15+ locations' },
      { icon: 'truck-delivery', title: 'Last Mile Delivery', desc: 'Doorstep delivery to 25+ countries' },
    ],
    highlights: ['Real-time GPS tracking', 'Cargo insurance included', '24/7 support desk', 'Competitive rates'],
  },
  'quality': {
    tagline: 'Product inspection & quality assurance',
    stats: [
      { icon: 'account-check', label: 'Certified Inspectors', value: '50+' },
      { icon: 'earth', label: 'Countries Covered', value: '12+' },
      { icon: 'clipboard-text', label: 'Reports/Month', value: '200+' },
    ],
    features: [
      { icon: 'magnify-scan', title: 'Pre-shipment Inspection', desc: 'Complete quality check before dispatch' },
      { icon: 'flask', title: 'Lab Testing', desc: 'ISO 17025 certified partner laboratories' },
      { icon: 'factory', title: 'Factory Audits', desc: 'Complete facility & process assessment' },
      { icon: 'certificate', title: 'Certification Support', desc: 'CE, FDA, ISO, BIS & more certifications' },
    ],
    highlights: ['95% pass rate', '48hr report delivery', 'Certified inspectors', 'Photo & video evidence'],
  },
  'finance': {
    tagline: 'Trade finance & secure payment solutions',
    stats: [
      { icon: 'cash-multiple', label: 'Total Disbursed', value: '₹50Cr+' },
      { icon: 'shield-check', label: 'Secure Transactions', value: '2,500+' },
      { icon: 'account-group', label: 'Active Clients', value: '500+' },
    ],
    features: [
      { icon: 'credit-card', title: 'Trade Credit', desc: 'Up to 90 days interest-free credit period' },
      { icon: 'file-document', title: 'Invoice Factoring', desc: 'Quick cash against unpaid invoices' },
      { icon: 'bank-transfer', title: 'Export Finance', desc: 'Pre & post shipment funding available' },
      { icon: 'shield-lock', title: 'Escrow Service', desc: 'Secure payment protection for both parties' },
    ],
    highlights: ['Competitive interest rates', 'Quick 48hr disbursal', 'No collateral up to ₹25L', 'Escrow protection'],
  },
  'legal': {
    tagline: 'International trade legal & compliance',
    stats: [
      { icon: 'scale-balance', label: 'Legal Experts', value: '35+' },
      { icon: 'earth', label: 'Jurisdictions', value: '15+' },
      { icon: 'file-check', label: 'Case Success Rate', value: '96%' },
    ],
    features: [
      { icon: 'file-document-edit', title: 'Contract Drafting', desc: 'International sale & purchase agreements' },
      { icon: 'lightbulb-on', title: 'IP Protection', desc: 'Patent, trademark & design registration' },
      { icon: 'handshake', title: 'Dispute Resolution', desc: 'Arbitration, mediation & litigation support' },
      { icon: 'clipboard-list', title: 'Regulatory Compliance', desc: 'Customs, DGFT, RBI & FEMA compliance' },
    ],
    highlights: ['Free initial consultation', 'Multi-language support', 'Pan-India network', 'Dedicated case manager'],
  },
  'sourcing': {
    tagline: 'Product sourcing & supplier matching',
    stats: [
      { icon: 'store', label: 'Verified Suppliers', value: '5,000+' },
      { icon: 'package-variant', label: 'Products Listed', value: '50K+' },
      { icon: 'trophy', label: 'Match Success Rate', value: '92%' },
    ],
    features: [
      { icon: 'magnify', title: 'Supplier Discovery', desc: 'Smart supplier matching for your needs' },
      { icon: 'currency-inr', title: 'Price Negotiation', desc: 'Best market price guaranteed by experts' },
      { icon: 'cube-send', title: 'Sample Management', desc: 'Sample collection, testing & evaluation' },
      { icon: 'truck-check', title: 'Order Management', desc: 'End-to-end order tracking & management' },
    ],
    highlights: ['Verified suppliers only', 'Price comparison tool', 'Escrow payment protection', 'Dedicated sourcing agent'],
  },
  'marketing': {
    tagline: 'Digital marketing & global brand building',
    stats: [
      { icon: 'account-group', label: 'Monthly Reach', value: '500K+' },
      { icon: 'earth', label: 'Target Markets', value: '20+' },
      { icon: 'trending-up', label: 'Average ROI', value: '250%' },
    ],
    features: [
      { icon: 'google-ads', title: 'Digital Advertising', desc: 'Google, Meta, LinkedIn & B2B platforms' },
      { icon: 'calendar-star', title: 'Trade Show Support', desc: 'Exhibition booking, setup & lead capture' },
      { icon: 'book-open', title: 'Catalog Design', desc: 'Professional product & company catalogs' },
      { icon: 'account-arrow-right', title: 'Lead Generation', desc: 'Qualified B2B buyer leads generation' },
    ],
    highlights: ['Dedicated account manager', 'Monthly performance reports', 'Multi-platform campaigns', 'Content in 10+ languages'],
  },
  'packaging': {
    tagline: 'Custom packaging & branding solutions',
    stats: [
      { icon: 'cube-outline', label: 'Packaging Types', value: '50+' },
      { icon: 'palette', label: 'Design Templates', value: '200+' },
      { icon: 'package-up', label: 'Monthly Orders', value: '300+' },
    ],
    features: [
      { icon: 'package-variant', title: 'Custom Packaging', desc: 'Tailored packaging for any product type' },
      { icon: 'brush', title: 'Brand Design', desc: 'Logo, color & brand identity on packages' },
      { icon: 'recycle', title: 'Eco-Friendly Options', desc: 'Sustainable & biodegradable materials' },
      { icon: 'qrcode', title: 'Smart Packaging', desc: 'QR codes, RFID & anti-counterfeit tech' },
    ],
    highlights: ['Free design consultation', 'Bulk order discounts', 'Fast 7-day turnaround', 'Pan-India delivery'],
  },
  'translation': {
    tagline: 'Professional translation & localization',
    stats: [
      { icon: 'translate', label: 'Languages', value: '25+' },
      { icon: 'account-tie', label: 'Native Translators', value: '100+' },
      { icon: 'file-document-multiple', label: 'Documents/Month', value: '500+' },
    ],
    features: [
      { icon: 'file-translate', title: 'Document Translation', desc: 'Contracts, catalogs & certificates' },
      { icon: 'web', title: 'Website Localization', desc: 'Full website & e-commerce translation' },
      { icon: 'microphone', title: 'Interpretation', desc: 'Live interpretation for meetings & calls' },
      { icon: 'certificate', title: 'Certified Translation', desc: 'Notarized & government-approved docs' },
    ],
    highlights: ['Native speakers only', 'Industry-specific experts', '48hr delivery', 'Confidentiality guaranteed'],
  },
  'travel': {
    tagline: 'Business travel & visa assistance',
    stats: [
      { icon: 'airplane', label: 'Destinations', value: '40+' },
      { icon: 'passport', label: 'Visas Processed', value: '1,000+' },
      { icon: 'hotel', label: 'Partner Hotels', value: '500+' },
    ],
    features: [
      { icon: 'airplane-takeoff', title: 'Flight Booking', desc: 'Best rates on international business travel' },
      { icon: 'card-account-details', title: 'Visa Assistance', desc: 'Business visa processing & documentation' },
      { icon: 'bed', title: 'Hotel & Stay', desc: 'Curated business hotels near trade hubs' },
      { icon: 'car', title: 'Local Transport', desc: 'Airport pickup, car rental & interpretation' },
    ],
    highlights: ['Visa approval guarantee', 'Trade fair packages', '24/7 travel support', 'Corporate rates'],
  },
  'insurance': {
    tagline: 'Comprehensive trade & cargo insurance',
    stats: [
      { icon: 'shield-check', label: 'Claims Settled', value: '₹15Cr+' },
      { icon: 'file-document', label: 'Policies Issued', value: '2,000+' },
      { icon: 'clock-fast', label: 'Claim Settlement', value: '<72hrs' },
    ],
    features: [
      { icon: 'shield', title: 'Cargo Insurance', desc: 'All-risk coverage for sea, air & land shipments' },
      { icon: 'credit-card', title: 'Credit Insurance', desc: 'Protection against buyer defaults & insolvency' },
      { icon: 'domain', title: 'Property Insurance', desc: 'Warehouse, factory & office coverage' },
      { icon: 'account-group', title: 'Liability Insurance', desc: 'Product, public & employer liability cover' },
    ],
    highlights: ['Instant online quotes', 'Cashless claim settlement', 'Trusted insurance partners', '24/7 claim assistance'],
  },
  'compliance': {
    tagline: 'Regulatory compliance & certifications',
    stats: [
      { icon: 'certificate', label: 'Certifications', value: '40+' },
      { icon: 'earth', label: 'Regulatory Bodies', value: '20+' },
      { icon: 'clipboard-check', label: 'Compliance Rate', value: '98%' },
    ],
    features: [
      { icon: 'file-document', title: 'Documentation', desc: 'Export-import documentation & filing' },
      { icon: 'flask', title: 'Product Testing', desc: 'Safety, quality & performance testing' },
      { icon: 'certificate', title: 'Certifications', desc: 'CE, FDA, ISO, BIS, RoHS & more' },
      { icon: 'clipboard-list', title: 'Audit Support', desc: 'Pre-audit preparation & compliance gap analysis' },
    ],
    highlights: ['End-to-end support', 'Fast-track certification', 'Expert consultation', 'Annual compliance packages'],
  },
  'technology': {
    tagline: 'Trade tech & digital solutions',
    stats: [
      { icon: 'monitor', label: 'Platforms', value: '8+' },
      { icon: 'account-group', label: 'Active Users', value: '5,000+' },
      { icon: 'trending-up', label: 'Efficiency Gain', value: '35%' },
    ],
    features: [
      { icon: 'cloud', title: 'Trade Management', desc: 'Cloud-based end-to-end trade platform' },
      { icon: 'blockchain', title: 'Document Verification', desc: 'Secure document verification & smart contracts' },
      { icon: 'chart-line', title: 'Analytics', desc: 'Real-time trade analytics & market insights' },
      { icon: 'robot', title: 'AI Solutions', desc: 'AI-powered risk assessment & supplier matching' },
    ],
    highlights: ['API integration', 'Custom dashboards', 'Real-time tracking', 'Data security compliant'],
  },
};

// Default fallback for any hub without explicit details
const getDefaultHubDetails = (hub: typeof SERVICE_HUBS[0]) => ({
  tagline: hub.description || 'Comprehensive trade service solution',
  stats: [
    { icon: 'briefcase-outline', label: 'Services', value: `${hub.items.length}` },
    { icon: 'account-check', label: 'Providers', value: '100+' },
    { icon: 'star', label: 'Rating', value: '4.5/5' },
  ],
  features: hub.items.slice(0, 4).map((item, i) => ({
    icon: item.icon || 'circle-small',
    title: item.title,
    desc: 'Professional trade service with verified providers',
  })),
  highlights: ['Verified providers', 'Competitive pricing', 'Quality guaranteed', '24/7 support'],
});

// ─── Quick Stats ────────────────────────────────────────────────────────────

function QuickStats({ totals }: { totals: any }) {
  const items = [
    { icon: 'flash', label: 'Active', count: totals.active, color: '#2563EB', bg: '#EFF6FF' },
    { icon: 'clock-outline', label: 'Pending', count: totals.pending, color: '#D97706', bg: '#FFFBEB' },
    { icon: 'check-circle', label: 'Done', count: totals.completed, color: '#059669', bg: '#ECFDF5' },
  ];

  return (
    <View style={quickStyles.container}>
      <View style={quickStyles.row}>
        {items.map((item, i) => (
          <View key={i} style={[quickStyles.item, { backgroundColor: item.bg }]}>
            <Icon name={item.icon} size={18} color={item.color} />
            <Text style={[quickStyles.count, { color: item.color }]}>{item.count}</Text>
            <Text style={quickStyles.label}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const quickStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  item: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  count: {
    fontSize: 16,
    fontWeight: '800',
    flex: 1,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    color: D.textTertiary,
  },
});

// ─── Service Hub Card (Enhanced with More Info) ─────────────────────────────

function ServiceHubCard({ 
  hub, 
  getHubActivity 
}: { 
  hub: (typeof SERVICE_HUBS)[0]; 
  getHubActivity: (key: string) => { active: number; pending: number };
}) {
  const navigation = useNavigation<any>();
  const counts = getHubActivity(hub.key);
  const hasPending = counts.pending > 0;
  const details = HUB_DETAILS[hub.key] || getDefaultHubDetails(hub);

  const borderColors = [
    '#2563EB', '#7C3AED', '#059669', '#F97316', '#0891B2', '#4F46E5', '#DC2626', '#CA8A04', '#0D9488', '#9333EA',
  ];
  const borderColor = borderColors[Math.abs(hub.key.split('').reduce((s, c) => s + c.charCodeAt(0), 0)) % borderColors.length];

  return (
    <Pressable
      onPress={() => hub.key === 'assurance' ? navigation.navigate('TradeAssurance') : navigation.navigate('ServiceHub', { hubKey: hub.key })}
      style={({ pressed }) => [
        cardStyles.card,
        pressed && cardStyles.cardPressed,
      ]}
    >
      {/* ── Header Section ── */}
      <View style={cardStyles.header}>
        <View style={cardStyles.headerLeft}>
          <View style={[cardStyles.iconWrap, { backgroundColor: hub.tint || D.primaryLight }]}>
            <Icon name={hub.icon} size={26} color={hub.color || D.primary} />
          </View>
          <View style={cardStyles.headerInfo}>
            <Text style={cardStyles.title}>{hub.title}</Text>
            <Text style={cardStyles.tagline}>{details.tagline}</Text>
          </View>
        </View>
        
        {counts.active > 0 && (
          <View style={[cardStyles.statusBadge, { 
            backgroundColor: hasPending ? D.warningLight : D.successLight,
            borderColor: hasPending ? '#FDE68A' : '#A7F3D0',
          }]}>
            <View style={[cardStyles.statusDot, { backgroundColor: hasPending ? D.warning : D.success }]} />
            <Text style={[cardStyles.statusText, { color: hasPending ? D.warning : D.success }]}>
              {counts.active} {hasPending ? 'pending' : 'active'}
            </Text>
          </View>
        )}
      </View>

      {/* ── Stats Row ── */}
      {details.stats.length > 0 && (
        <View style={cardStyles.statsRow}>
          {details.stats.map((stat, i) => (
            <View key={i} style={cardStyles.statItem}>
              <View style={[cardStyles.statIconCircle, { backgroundColor: (hub.tint || D.primaryLight) }]}>
                <Icon name={stat.icon} size={14} color={hub.color || D.primary} />
              </View>
              <Text style={cardStyles.statValue}>{stat.value}</Text>
              <Text style={cardStyles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Features Grid ── */}
      <View style={cardStyles.featuresGrid}>
        {details.features.map((feature, i) => (
          <View key={i} style={cardStyles.featureItem}>
            <View style={[cardStyles.featureIconBox, { backgroundColor: (hub.tint || D.primaryLight) }]}>
              <Icon name={feature.icon} size={16} color={hub.color || D.primary} />
            </View>
            <View style={cardStyles.featureTextWrap}>
              <Text style={cardStyles.featureTitle}>{feature.title}</Text>
              {feature.desc ? (
                <Text style={cardStyles.featureDesc} numberOfLines={1}>{feature.desc}</Text>
              ) : null}
            </View>
          </View>
        ))}
      </View>

      {/* ── Highlights ── */}
      {details.highlights.length > 0 && (
        <View style={cardStyles.highlightsRow}>
          {details.highlights.map((highlight, i) => (
            <View key={i} style={[cardStyles.highlightPill, { backgroundColor: (hub.tint || D.primaryLight) }]}>
              <Icon name="check-circle" size={10} color={hub.color || D.primary} />
              <Text style={[cardStyles.highlightText, { color: hub.color || D.primary }]}>
                {highlight}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Footer ── */}
      <View style={cardStyles.footer}>
        <View style={cardStyles.serviceCount}>
          <Icon name="view-grid-outline" size={14} color={D.textTertiary} />
          <Text style={cardStyles.serviceCountText}>{hub.items.length} services available</Text>
        </View>
        <View style={[cardStyles.exploreBtn, { backgroundColor: hub.color + '15' || D.primaryLight }]}>
          <Text style={[cardStyles.exploreText, { color: hub.color || D.primary }]}>Explore Hub</Text>
          <Icon name="arrow-right" size={14} color={hub.color || D.primary} />
        </View>
      </View>
    </Pressable>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: D.surface,
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: D.border,
    ...D.shadow,
  },
  cardPressed: {
    backgroundColor: '#FAFBFC',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: 16,
    paddingBottom: 12,
    gap: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    gap: 14,
    flex: 1,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerInfo: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: D.text,
    letterSpacing: -0.2,
  },
  tagline: {
    fontSize: 12,
    color: D.textTertiary,
    fontWeight: '500',
    lineHeight: 16,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 5,
    borderWidth: 1,
    flexShrink: 0,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },

  // Stats Row
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 8,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    gap: 4,
    borderWidth: 1,
    borderColor: D.borderLight,
  },
  statIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700',
    color: D.text,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: D.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  // Features Grid
  featuresGrid: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 8,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: D.borderLight,
  },
  featureIconBox: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  featureTextWrap: {
    flex: 1,
    gap: 2,
  },
  featureTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: D.text,
  },
  featureDesc: {
    fontSize: 11,
    color: D.textTertiary,
    fontWeight: '500',
  },

  // Highlights
  highlightsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  highlightPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  highlightText: {
    fontSize: 10,
    fontWeight: '600',
  },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: D.borderLight,
    backgroundColor: '#FAFBFC',
  },
  serviceCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  serviceCountText: {
    fontSize: 11,
    fontWeight: '600',
    color: D.textTertiary,
  },
  exploreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  exploreText: {
    fontSize: 12,
    fontWeight: '700',
  },
});

// ─── Main Component ─────────────────────────────────────────────────────────

export default function ServicesScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { activeRole, user } = useAuth();
  const role = activeRole === 'seller' ? 'seller' : 'buyer';

  const activity = useQuery({
    queryKey: ['service-activity', role],
    queryFn: () => fetchAggregatedServiceActivity(role),
    staleTime: 30_000,
    refetchInterval: 45_000,
  });

  const totals = useMemo(
    () => ({
      active: (activity.data ?? []).filter(
        x => !['completed', 'cancelled', 'rejected'].includes(String(x.status ?? '').toLowerCase())
      ).length,
      pending: (activity.data ?? []).filter(
        x => String(x.status ?? '').toLowerCase().includes('pending') || String(x.status ?? '') === 'submitted'
      ).length,
      completed: (activity.data ?? []).filter(
        x => String(x.status ?? '').toLowerCase() === 'completed'
      ).length,
    }),
    [activity.data]
  );

  const getHubActivity = (hubKey: string) => {
    const hub = SERVICE_HUBS.find(h => h.key === hubKey);
    if (!hub) return { active: 0, pending: 0 };
    const matching = (activity.data ?? []).filter(a =>
      hub.items.some(i => i.serviceKey && [a.serviceKey, a.originalServiceKey].includes(i.serviceKey))
    );
    return {
      active: matching.filter(x => !['completed', 'cancelled'].includes(String(x.status ?? '').toLowerCase())).length,
      pending: matching.filter(x => String(x.status ?? '').toLowerCase().includes('pending')).length,
    };
  };

  const ListHeader = () => (
    <View>
      {/* ── Header with Back Button ── */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="arrow-left" size={20} color={D.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Services</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* ── Premium Hero Card ── */}
      <LinearGradient
        colors={['#1E3A8A', '#2563EB', '#3B82F6']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCard}
      >
        <View style={styles.heroPattern}>
          <View style={[styles.heroCircle, { width: 140, height: 140, top: -40, right: -40 }]} />
          <View style={[styles.heroCircle, { width: 80, height: 80, bottom: -20, left: -20 }]} />
        </View>
        
        <Text style={styles.heroGreeting}>
          {user?.name ? `Hello, ${user.name.split(' ')[0]}` : 'Welcome'}
        </Text>
        <Text style={styles.heroTitle}>Trade Services Hub</Text>
        <Text style={styles.heroSubtitle}>
          End-to-end B2B solutions for global commerce
        </Text>
        
        <View style={styles.heroStats}>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{SERVICE_HUBS.length}</Text>
            <Text style={styles.heroStatLabel}>Hubs</Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>
              {SERVICE_HUBS.reduce((s, h) => s + h.items.length, 0)}
            </Text>
            <Text style={styles.heroStatLabel}>Services</Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>80+</Text>
            <Text style={styles.heroStatLabel}>Countries</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Quick Stats */}
      <QuickStats totals={totals} />

      {/* Section Divider */}
      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>All Services</Text>
        <View style={styles.dividerLine} />
      </View>
    </View>
  );

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#1E3A8A" />
      <FlatList
        data={SERVICE_HUBS}
        keyExtractor={item => item.key}
        renderItem={({ item }) => <ServiceHubCard hub={item} getHubActivity={getHubActivity} />}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={<View style={{ height: 40 }} />}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={activity.isRefetching}
            onRefresh={() => activity.refetch()}
            tintColor={D.primary}
            colors={[D.primary]}
            progressBackgroundColor={D.surface}
          />
        }
      />
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: D.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: D.surface,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: D.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: D.text,
  },

  // Hero Card
  heroCard: {
    marginHorizontal: 16,
    marginTop: 4,
    borderRadius: 20,
    padding: 20,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  heroPattern: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
  },
  heroCircle: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  heroGreeting: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
    marginBottom: 4,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '500',
    marginBottom: 16,
  },
  heroStats: {
    flexDirection: 'row',
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  heroStat: {
    flex: 1,
    alignItems: 'center',
  },
  heroStatValue: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFF',
  },
  heroStatLabel: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '600',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  heroStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center',
  },

  // Divider
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 24,
    marginBottom: 14,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: D.border,
  },
  dividerText: {
    fontSize: 11,
    fontWeight: '700',
    color: D.textTertiary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
});
