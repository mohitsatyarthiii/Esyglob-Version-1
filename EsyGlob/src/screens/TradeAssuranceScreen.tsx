import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';

const { width } = Dimensions.get('window');

const CORE = [
  ['shield-lock-outline', 'Secure Transactions', 'Multi-layer escrow protection with milestone-based payment release, real-time verification, and bank-grade encryption.'],
  ['package-variant-closed-check', 'Order Protection', 'Complete order coverage including quality inspections, shipment monitoring, documentation verification, and delivery confirmation.'],
  ['cash-refund', 'Refund & Dispute Protection', 'Evidence-based dispute resolution with dedicated support team. Eligible claims resolved within 15 business days.'],
  ['file-certificate-outline', 'Verified Trade Partners', 'Comprehensive supplier verification with trust scores, business badges, compliance documents, and performance history.'],
  ['shield-star', 'Quality Guarantee', 'Product quality as per agreed specifications. Independent third-party inspection available for every order.'],
  ['clock-check', 'On-Time Delivery', 'Shipment tracking with delay protection. Compensation for eligible delayed deliveries beyond committed timeline.'],
];

const PROTECTION_LAYERS = [
  {
    icon: 'security',
    title: 'Payment Protection',
    desc: 'Funds held securely until order milestones are met',
    details: [
      'Escrow-based payment holding',
      'Milestone-based release system',
      'Bank-grade 256-bit encryption',
      'PCI DSS compliant processing',
      'Multi-currency support (20+ currencies)',
      'Real-time transaction monitoring',
    ],
  },
  {
    icon: 'certificate',
    title: 'Supplier Verification',
    desc: 'Every supplier undergoes rigorous verification process',
    details: [
      'Business registration verification',
      'Factory & facility inspection',
      'Financial stability assessment',
      'Past performance analysis',
      'Compliance document verification',
      'Continuous monitoring & re-verification',
    ],
  },
  {
    icon: 'clipboard-check',
    title: 'Quality Assurance',
    desc: 'Multiple quality checkpoints throughout your order journey',
    details: [
      'Pre-production sample approval',
      'In-line production inspection',
      'Pre-shipment quality check',
      'Container loading supervision',
      'Third-party lab testing available',
      'Photo & video documentation',
    ],
  },
  {
    icon: 'truck-delivery',
    title: 'Logistics Protection',
    desc: 'Complete shipment protection from origin to destination',
    details: [
      'Real-time GPS tracking',
      'Cargo insurance coverage',
      'Delay compensation eligible',
      'Damage & loss protection',
      'Customs clearance support',
      'Multi-modal transport coverage',
    ],
  },
  {
    icon: 'handshake',
    title: 'Dispute Resolution',
    desc: 'Fair and transparent conflict resolution process',
    details: [
      'Dedicated case manager assigned',
      'Evidence-based investigation',
      'Mediation support provided',
      'Resolution within 15 business days',
      'Multi-language support',
      'Legally binding outcomes',
    ],
  },
];

const STATS = [
  { icon: 'shield-check', value: '₹200Cr+', label: 'Protected Transactions' },
  { icon: 'account-group', value: '5,000+', label: 'Verified Suppliers' },
  { icon: 'check-circle', value: '98%', label: 'Dispute Resolution' },
  { icon: 'clock-fast', value: '<15 Days', label: 'Avg. Resolution Time' },
];

const ADDITIONAL_FEATURES = [
  {
    icon: 'star',
    title: 'Trust Score System',
    desc: 'Comprehensive scoring based on 50+ parameters including transaction history, response time, quality ratings, and dispute record.',
  },
  {
    icon: 'badge-account',
    title: 'Verification Badges',
    desc: 'Multiple verification levels - Basic, Advanced, Premium, and Elite - each requiring progressively deeper verification.',
  },
  {
    icon: 'chart-line',
    title: 'Performance Analytics',
    desc: 'Detailed supplier performance metrics including on-time delivery rate, quality compliance score, and buyer satisfaction index.',
  },
  {
    icon: 'shield-sync',
    title: 'Continuous Monitoring',
    desc: 'AI-powered monitoring system tracks supplier performance, flagging any deviations from established patterns.',
  },
  {
    icon: 'file-document-multiple',
    title: 'Documentation Support',
    desc: 'Complete trade documentation assistance including invoices, packing lists, certificates of origin, and compliance documents.',
  },
  {
    icon: 'headset',
    title: 'Dedicated Support',
    desc: '24/7 multilingual support team with trade experts available via chat, call, and email for immediate assistance.',
  },
];

const BUYER_BENEFITS = [
  '100% payment protection with escrow',
  'Verified supplier discovery & matching',
  'Quality guarantee as per specifications',
  'Independent third-party inspection',
  'Real-time order & shipment tracking',
  'Delay compensation eligibility',
  'Dedicated dispute resolution manager',
  'Free trade documentation support',
  'Supplier performance insights',
  'Multi-currency payment options',
  'Cargo insurance coverage',
  'Post-delivery quality support',
];

const SELLER_BENEFITS = [
  'Verified seller identity & trust badges',
  'Guaranteed payment on order completion',
  'Protection against fraudulent chargebacks',
  'Order evidence & milestone documentation',
  'Increased buyer confidence & conversion',
  'Priority listing in buyer searches',
  'Access to trade finance options',
  'Dispute resolution support',
  'Performance analytics dashboard',
  'Marketing & promotional support',
  'Dedicated account manager',
  'Export documentation assistance',
];

const COVERAGE_MATRIX = [
  ['Coverage', 'Basic', 'Advanced', 'Premium'],
  ['Payment Protection', '✓', '✓', '✓'],
  ['Supplier Verification', '✓', '✓', '✓'],
  ['Quality Inspection', '—', '✓', '✓'],
  ['Cargo Insurance', '—', '✓', '✓'],
  ['Delay Compensation', '—', '—', '✓'],
  ['Dedicated Manager', '—', '—', '✓'],
  ['Priority Support', '—', '—', '✓'],
];

const STEPS = [
  { title: 'Choose Supplier', desc: 'Browse verified suppliers with trust scores & badges' },
  { title: 'Agree Terms', desc: 'Define specifications, quality standards & milestones' },
  { title: 'Secure Payment', desc: 'Deposit payment in escrow for complete protection' },
  { title: 'Track Progress', desc: 'Monitor production, quality checks & shipment' },
  { title: 'Receive & Confirm', desc: 'Inspect goods & release payment or raise dispute' },
];

export default function TradeAssuranceScreen() {
  const navigation = useNavigation<any>();

  return (
    <View style={s.screen}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => navigation.goBack()} style={s.headerBtn}>
          <Icon name="arrow-left" size={23} color="#111827" />
        </Pressable>
        <Text style={s.headerTitle}>Trade Assurance</Text>
        <View style={s.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Hero Card - Orange Theme */}
        <LinearGradient
          colors={['#FF6B00', '#FF8C00', '#FFA500']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.hero}
        >
          <View style={s.heroPattern}>
            <View style={[s.heroCircle, { width: 120, height: 120, top: -30, right: -30 }]} />
            <View style={[s.heroCircle, { width: 80, height: 80, bottom: -20, left: -20 }]} />
            <View style={[s.heroCircle, { width: 60, height: 60, top: 40, right: 60, opacity: 0.5 }]} />
          </View>
          <Icon name="shield-star" size={48} color="#FFF" />
          <Text style={s.heroTitle}>Trade with Confidence</Text>
          <Text style={s.heroText}>
            India's most comprehensive trade protection framework. Verified suppliers, secure payments, quality assurance, and dedicated dispute resolution — all in one place.
          </Text>
          <View style={s.heroBadges}>
            <View style={s.heroBadge}>
              <Icon name="security" size={14} color="#FFF" />
              <Text style={s.heroBadgeText}>Bank-Grade Security</Text>
            </View>
            <View style={s.heroBadge}>
              <Icon name="certificate" size={14} color="#FFF" />
              <Text style={s.heroBadgeText}>ISO Certified</Text>
            </View>
            <View style={s.heroBadge}>
              <Icon name="earth" size={14} color="#FFF" />
              <Text style={s.heroBadgeText}>Global Coverage</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Stats Bar */}
        <View style={s.statsBar}>
          {STATS.map((stat, i) => (
            <View key={i} style={s.statItem}>
              <View style={s.statIconWrap}>
                <Icon name={stat.icon} size={18} color="#FF6B00" />
              </View>
              <Text style={s.statValue}>{stat.value}</Text>
              <Text style={s.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* How It Works */}
        <Title icon="information-outline">How Protection Works</Title>
        <View style={s.timeline}>
          {STEPS.map((step, i) => (
            <View key={i} style={s.step}>
              <View style={s.stepNoWrap}>
                <View style={s.stepNo}>
                  <Text style={s.stepNoText}>{i + 1}</Text>
                </View>
                {i < STEPS.length - 1 && <View style={s.stepLine} />}
              </View>
              <View style={s.stepContent}>
                <Text style={s.stepTitle}>{step.title}</Text>
                <Text style={s.stepDesc}>{step.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Core Protection */}
        <Title icon="shield-star">Core Protection Features</Title>
        <View style={s.coreGrid}>
          {CORE.map(([icon, title, text]) => (
            <View key={title} style={s.coreCard}>
              <View style={s.coreIconWrap}>
                <Icon name={icon} size={24} color="#FF6B00" />
              </View>
              <Text style={s.coreCardTitle}>{title}</Text>
              <Text style={s.coreCardText} numberOfLines={3}>{text}</Text>
            </View>
          ))}
        </View>

        {/* Protection Layers */}
        <Title icon="layers">Protection Layers</Title>
        {PROTECTION_LAYERS.map((layer, i) => (
          <View key={i} style={s.layerCard}>
            <View style={s.layerHeader}>
              <View style={s.layerIconWrap}>
                <Icon name={layer.icon} size={22} color="#FF6B00" />
              </View>
              <View style={s.layerHeaderText}>
                <Text style={s.layerTitle}>{layer.title}</Text>
                <Text style={s.layerDesc}>{layer.desc}</Text>
              </View>
            </View>
            <View style={s.layerDetails}>
              {layer.details.map((detail, j) => (
                <View key={j} style={s.layerDetailItem}>
                  <Icon name="check-circle" size={14} color="#16A34A" />
                  <Text style={s.layerDetailText}>{detail}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}

  
        

        {/* Buyer Coverage */}
        <View style={s.coverageCard}>
          <View style={s.coverageHeader}>
            <View style={s.coverageIconWrap}>
              <Icon name="account-shield" size={24} color="#FF6B00" />
            </View>
            <View>
              <Text style={s.coverageTitle}>Buyer Protection</Text>
              <Text style={s.coverageSubtitle}>Complete coverage for importers & buyers</Text>
            </View>
          </View>
          <View style={s.benefitsGrid}>
            {BUYER_BENEFITS.map((benefit, i) => (
              <View key={i} style={s.benefitItem}>
                <Icon name="shield-check" size={14} color="#16A34A" />
                <Text style={s.benefitText}>{benefit}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Seller Coverage */}
        <View style={s.coverageCard}>
          <View style={s.coverageHeader}>
            <View style={s.coverageIconWrap}>
              <Icon name="store-check" size={24} color="#FF6B00" />
            </View>
            <View>
              <Text style={s.coverageTitle}>Seller Protection</Text>
              <Text style={s.coverageSubtitle}>Comprehensive coverage for exporters & suppliers</Text>
            </View>
          </View>
          <View style={s.benefitsGrid}>
            {SELLER_BENEFITS.map((benefit, i) => (
              <View key={i} style={s.benefitItem}>
                <Icon name="shield-check" size={14} color="#16A34A" />
                <Text style={s.benefitText}>{benefit}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Additional Features */}
        <Title icon="star">Additional Features</Title>
        <View style={s.featuresGrid}>
          {ADDITIONAL_FEATURES.map((feature, i) => (
            <View key={i} style={s.featureCard}>
              <View style={s.featureIconWrap}>
                <Icon name={feature.icon} size={20} color="#FF6B00" />
              </View>
              <Text style={s.featureTitle}>{feature.title}</Text>
              <Text style={s.featureDesc}>{feature.desc}</Text>
            </View>
          ))}
        </View>

        {/* Trust Banner */}
        <View style={s.trustBanner}>
          <Icon name="shield-star" size={32} color="#FF6B00" />
          <Text style={s.trustTitle}>Why Trust EsyGlob Trade Assurance?</Text>
          <Text style={s.trustText}>
            Our multi-layered protection framework is designed to safeguard every transaction. From supplier verification to secure payments and dispute resolution, we ensure complete peace of mind for both buyers and sellers.
          </Text>
          <View style={s.trustHighlights}>
            <View style={s.trustHighlight}>
              <Icon name="bank" size={20} color="#FF6B00" />
              <Text style={s.trustHighlightText}>Bank Partner</Text>
            </View>
            <View style={s.trustHighlight}>
              <Icon name="certificate" size={20} color="#FF6B00" />
              <Text style={s.trustHighlightText}>ISO 27001</Text>
            </View>
            <View style={s.trustHighlight}>
              <Icon name="security" size={20} color="#FF6B00" />
              <Text style={s.trustHighlightText}>RBI Compliant</Text>
            </View>
            <View style={s.trustHighlight}>
              <Icon name="earth" size={20} color="#FF6B00" />
              <Text style={s.trustHighlightText}>Global Standards</Text>
            </View>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Book Now Button */}
      
    </View>
  );
}

function Title({ children, icon }: { children: React.ReactNode; icon: string }) {
  return (
    <View style={s.sectionHeader}>
      <Icon name={icon} size={18} color="#FF6B00" />
      <Text style={s.sectionTitle}>{children}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  // Header
  header: {
    paddingTop: 48,
    paddingBottom: 10,
    paddingHorizontal: 12,
    backgroundColor: '#FFF',
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerBtn: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '900',
    color: '#111827',
  },

  content: {
    padding: 15,
  },

  // Hero - Orange Theme
  hero: {
    borderRadius: 20,
    padding: 24,
    alignItems: 'flex-start',
    position: 'relative',
    overflow: 'hidden',
    marginBottom: 12,
  },
  heroPattern: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  heroCircle: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFF',
    marginTop: 14,
    letterSpacing: -0.5,
  },
  heroText: {
    fontSize: 13,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 8,
    fontWeight: '500',
  },
  heroBadges: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    flexWrap: 'wrap',
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  heroBadgeText: {
    fontSize: 10,
    color: '#FFF',
    fontWeight: '700',
  },

  // Stats Bar
  statsBar: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#FFF7ED',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  // Section Title
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 22,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },

  // How It Works Timeline
  timeline: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  step: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  stepNoWrap: {
    alignItems: 'center',
    width: 28,
  },
  stepNo: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFF7ED',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FF6B00',
  },
  stepNoText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FF6B00',
  },
  stepLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#FED7AA',
    marginVertical: 4,
  },
  stepContent: {
    flex: 1,
    paddingBottom: 12,
  },
  stepTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 3,
  },
  stepDesc: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 16,
    fontWeight: '500',
  },

  // Core Protection Grid
  coreGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  coreCard: {
    width: (width - 40) / 2,
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  coreIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#FFF7ED',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  coreCardTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  coreCardText: {
    fontSize: 10,
    color: '#64748B',
    lineHeight: 15,
    fontWeight: '500',
  },

  // Protection Layers
  layerCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  layerHeader: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  layerIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFF7ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  layerHeaderText: {
    flex: 1,
  },
  layerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  layerDesc: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  layerDetails: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  layerDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  layerDetailText: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '600',
  },

  // Coverage Matrix
  matrixScroll: {
    marginBottom: 0,
  },
  matrix: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    minWidth: width - 30,
  },
  matrixRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  matrixHeaderRow: {
    backgroundColor: '#FFF7ED',
  },
  matrixCell: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#F1F5F9',
  },
  matrixFirstCell: {
    flex: 1.5,
    alignItems: 'flex-start',
  },
  matrixText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
  },
  matrixHeaderText: {
    fontWeight: '800',
    color: '#FF6B00',
    fontSize: 12,
  },
  matrixLabelText: {
    fontWeight: '700',
    color: '#0F172A',
    fontSize: 12,
  },

  // Coverage Cards
  coverageCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  coverageHeader: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  coverageIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFF7ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverageTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  coverageSubtitle: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 2,
  },
  benefitsGrid: {
    gap: 8,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  benefitText: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '600',
    flex: 1,
    lineHeight: 16,
  },

  // Additional Features
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  featureCard: {
    width: (width - 40) / 2,
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  featureIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FFF7ED',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  featureTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  featureDesc: {
    fontSize: 10,
    color: '#64748B',
    lineHeight: 15,
    fontWeight: '500',
  },

  // Trust Banner
  trustBanner: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    marginTop: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FF6B00',
    borderStyle: 'dashed',
  },
  trustTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 10,
    marginBottom: 6,
    textAlign: 'center',
  },
  trustText: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 17,
    fontWeight: '500',
  },
  trustHighlights: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  trustHighlight: {
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF7ED',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 70,
  },
  trustHighlightText: {
    fontSize: 9,
    color: '#FF6B00',
    fontWeight: '700',
  },

  // Bottom Bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  bottomInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  bottomText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  bookBtn: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  bookBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  bookBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFF',
  },
});