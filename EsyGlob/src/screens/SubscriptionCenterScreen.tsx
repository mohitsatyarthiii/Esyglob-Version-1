import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import RazorpayCheckout from 'react-native-razorpay';
import LinearGradient from 'react-native-linear-gradient';
import {
  createSubscriptionOrder,
  fetchSubscription,
  fetchSubscriptionPlans,
  SubscriptionPlan,
  verifySubscriptionPayment,
} from '../api/subscription';
import { useAuth } from '../auth/AuthContext';
import { ErrorState } from '../components/StateViews';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Helpers ──────────────────────────────────────────────
const AI_TIER_MAP: Record<string, { name: string; icon: string; color: string; bg: string }> = {
  esyai_lite: { name: 'EsyAI Lite', icon: 'chip', color: '#64748B', bg: '#F1F5F9' },
  esyai_pro: { name: 'EsyAI Pro', icon: 'chip', color: '#2563EB', bg: '#EFF6FF' },
  esyai_advanced: { name: 'EsyAI Advanced', icon: 'chip', color: '#7C3AED', bg: '#F5F3FF' },
  esyai_enterprise: { name: 'EsyAI Enterprise', icon: 'chip', color: '#D97706', bg: '#FFFBEB' },
};

function getAiTierFromPlanKey(key: string): string {
  if (key.includes('free')) return 'esyai_lite';
  if (key.includes('pro') || key.includes('verified')) return 'esyai_pro';
  if (key.includes('business') || key.includes('gold')) return 'esyai_advanced';
  if (key.includes('enterprise')) return 'esyai_enterprise';
  return 'esyai_lite';
}

function getAiTierInfo(plan: SubscriptionPlan | null) {
  if (!plan) return AI_TIER_MAP.esyai_lite;
  const tier = plan.aiTier || (plan as any).aiProvider || getAiTierFromPlanKey(plan.key);
  const oldMapping: Record<string, string> = {
    ollama: 'esyai_lite', deepseek: 'esyai_pro', openai: 'esyai_advanced',
    chatgpt: 'esyai_advanced', claude: 'esyai_enterprise',
  };
  const mapped = oldMapping[(tier || '').toLowerCase()] || tier;
  return AI_TIER_MAP[mapped] || AI_TIER_MAP.esyai_lite;
}

function getAiModelName(plan: SubscriptionPlan | null): string {
  if (!plan) return 'EsyAI Lite';
  if (plan.aiModel) return plan.aiModel;
  const aiTier = plan.aiTier || getAiTierFromPlanKey(plan.key);
  const names: Record<string, string> = {
    esyai_lite: 'EsyAI Lite', esyai_pro: 'EsyAI Pro',
    esyai_advanced: 'EsyAI Advanced', esyai_enterprise: 'EsyAI Enterprise',
  };
  return names[aiTier] || 'EsyAI Lite';
}

function getDefaultGrowthScore(key: string): number {
  if (key.includes('free')) return 15;
  if (key.includes('pro') || key.includes('verified')) return 45;
  if (key.includes('business') || key.includes('gold')) return 75;
  if (key.includes('enterprise')) return 100;
  return 15;
}

// ─── Main Component ───────────────────────────────────────
export default function SubscriptionCenterScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const qc = useQueryClient();
  const { activeRole } = useAuth();
  const role = route.params?.role || (activeRole === 'seller' ? 'seller' : 'buyer');
  
  const [activeTab, setActiveTab] = useState<'monthly' | 'quarterly' | 'yearly'>('yearly');
  const [expandedPlanKey, setExpandedPlanKey] = useState<string | null>(null);
  const [upgradingPlanKey, setUpgradingPlanKey] = useState<string | null>(null);

  const overview = useQuery({
    queryKey: ['subscription', role],
    queryFn: () => fetchSubscription(role),
  });

  const plansQuery = useQuery({
    queryKey: ['subscription-plans', role],
    queryFn: () => fetchSubscriptionPlans(role),
  });

  const buy = useMutation({
    mutationFn: async (plan: SubscriptionPlan) => {
      if (!plan.prices[activeTab]) throw new Error('This billing cycle is unavailable.');
      const order = await createSubscriptionOrder(plan.key, activeTab);
      const gateway = await RazorpayCheckout.open({
        key: order.key,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: 'EsyGlob',
        description: `${plan.name} subscription`,
        prefill: order.user,
        theme: { color: '#F59E0B' }, // Golden theme for CTA
      });
      return verifySubscriptionPayment({
        planType: plan.key, duration: activeTab,
        razorpayPaymentId: gateway.razorpay_payment_id,
        razorpayOrderId: gateway.razorpay_order_id,
        razorpaySignature: gateway.razorpay_signature,
      });
    },
    onSuccess: async () => {
      setUpgradingPlanKey(null);
      await qc.invalidateQueries({ queryKey: ['subscription'] });
      Alert.alert('🎉 Subscription Activated', 'Your plan is now active.');
    },
    onError: (e: Error) => {
      setUpgradingPlanKey(null);
      Alert.alert('Payment Failed', e.message);
    },
  });

  if (overview.isLoading || plansQuery.isLoading) return <SkeletonLoader />;
  if (overview.isError || plansQuery.isError)
    return <ErrorState message="Could not load subscription details." onRetry={() => { overview.refetch(); plansQuery.refetch(); }} />;

  const data = overview.data!;
  const current = data.plan;
  const remaining = Number(data.usage?.aiCreditsRemaining ?? 0);
  const plans = plansQuery.data!;
  const sortedPlans = [...plans].sort((a, b) => a.priorityRanking - b.priorityRanking);

  const handleExpand = (key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedPlanKey(expandedPlanKey === key ? null : key);
  };

  const handleUpgrade = (plan: SubscriptionPlan) => {
    if (plan.key === current.key) return;
    setUpgradingPlanKey(plan.key);
    buy.mutate(plan);
  };

  const getPriceForTab = (plan: SubscriptionPlan) => plan.prices[activeTab] || 0;

  return (
    <View style={s.screen}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => nav.goBack()} style={s.headerBtn}>
          <Icon name="arrow-left" size={24} color="#1A1A2E" />
        </Pressable>
        <View style={s.headerTitleContainer}>
          <Text style={s.headerTitle}>Pricing</Text>
        </View>
        <Pressable onPress={() => nav.navigate('InvoiceDetails', {})} style={s.headerBtn}>
          <Icon name="receipt-text-outline" size={24} color="#1A1A2E" />
        </Pressable>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Hero Tagline */}
        <View style={s.heroSection}>
          <Text style={s.heroTitle}>Pricing on your terms</Text>
          <Text style={s.heroSubtitle}>
            Whichever plan you pick, it's free until you love your docs.
          </Text>
        </View>

        {/* Billing Tabs */}
        <View style={s.tabContainer}>
          <Pressable onPress={() => setActiveTab('monthly')} style={[s.tabBtn, activeTab === 'monthly' && s.tabBtnActive]}>
            <Text style={[s.tabText, activeTab === 'monthly' && s.tabTextActive]}>Monthly</Text>
          </Pressable>
          <Pressable onPress={() => setActiveTab('quarterly')} style={[s.tabBtn, activeTab === 'quarterly' && s.tabBtnActive]}>
            <Text style={[s.tabText, activeTab === 'quarterly' && s.tabTextActive]}>Quarterly</Text>
          </Pressable>
          <Pressable onPress={() => setActiveTab('yearly')} style={[s.tabBtn, activeTab === 'yearly' && s.tabBtnActive]}>
            <Text style={[s.tabText, activeTab === 'yearly' && s.tabTextActive]}>Yearly</Text>
            {activeTab === 'yearly' && (
              <View style={s.saveBadge}><Text style={s.saveBadgeText}>Save 35%</Text></View>
            )}
          </Pressable>
        </View>

        {/* Current Active Plan Banner */}
        <View style={s.activeBanner}>
          <View style={s.activeBannerLeft}>
            <Icon name="check-circle" size={20} color="#10B981" />
            <View>
              <Text style={s.activeBannerLabel}>Current Plan</Text>
              <Text style={s.activeBannerName}>{current.name || 'Free'}</Text>
            </View>
          </View>
          <View style={s.activeBannerRight}>
            <View style={s.creditsPill}>
              <Icon name="lightning-bolt" size={14} color="#F59E0B" />
              <Text style={s.creditsText}>{remaining} Credits left</Text>
            </View>
          </View>
        </View>

        {/* Premium Plan Cards */}
        <View style={s.cardsContainer}>
          {sortedPlans.map((plan) => {
            const isCurrent = current.key === plan.key;
            const isLoadingThis = upgradingPlanKey === plan.key && buy.isPending;
            const price = getPriceForTab(plan);
            const isFree = plan.key.includes('free');
            const isExpanded = expandedPlanKey === plan.key;

            // PREMIUM GOLDEN/ORANGE GRADIENTS
            let tierColors = { 
              gradient: ['#FFF7ED', '#FFFFFF'], // Light Orange/Gold Base
              border: '#FDBA74', 
              highlight: '#F97316',
              text: '#9A3412',
              glow: '#FED7AA'
            };
            
            if (plan.priorityRanking >= 3) { 
              tierColors = { 
                gradient: ['#FFFBEB', '#FEF3C7'], // Rich Gold
                border: '#F59E0B', 
                highlight: '#D97706',
                text: '#92400E',
                glow: '#FDE68A'
              };
            } else if (plan.priorityRanking >= 2) { 
              tierColors = { 
                gradient: ['#F0FDF4', '#DCFCE7'], // Premium Green/Orange mix
                border: '#34D399', 
                highlight: '#10B981',
                text: '#065F46',
                glow: '#A7F3D0'
              };
            }

            const aiInfo = getAiTierInfo(plan);
            const features = Array.isArray(plan.features) ? plan.features : [];
            
            // First 5 features
            const initialFeatures = features.slice(0, 5);
            // Remaining features
            const remainingFeatures = features.slice(5);
            // Last 5-6 features (Highlighted with Golden Star)
            const highlightedFeatures = remainingFeatures.slice(-6);

            return (
              <View key={plan.key} style={[s.planCard, { borderColor: tierColors.border }]}>
                
                {/* Premium Glow Background */}
                <LinearGradient 
                  colors={tierColors.gradient} 
                  style={s.planGradient} 
                  start={{ x: 0, y: 0 }} 
                  end={{ x: 1, y: 1 }} 
                />
                <View style={[s.glowOrb, { backgroundColor: tierColors.glow }]} />

                {/* Top Row */}
                <View style={s.planTopRow}>
                  <View style={[s.planTierBadge, { backgroundColor: tierColors.text + '20' }]}>
                    <Icon name={aiInfo.icon} size={14} color={tierColors.text} />
                    <Text style={[s.planTierText, { color: tierColors.text }]}>{aiInfo.name}</Text>
                  </View>
                  <View style={[s.statusBadge, isCurrent ? s.activeBadge : s.popularBadge]}>
                    <Text style={[s.statusText, { color: isCurrent ? '#047857' : '#B45309' }]}>
                      {isCurrent ? '● ACTIVE' : '★ POPULAR'}
                    </Text>
                  </View>
                </View>

                <Text style={s.planName}>{plan.name}</Text>

                <View style={s.priceRow}>
                  <Text style={s.currencySymbol}>₹</Text>
                  <Text style={s.priceAmount}>{isFree ? '0' : price.toLocaleString('en-IN')}</Text>
                  <Text style={s.pricePeriod}>/{activeTab === 'monthly' ? 'mo' : activeTab === 'quarterly' ? 'qtr' : 'yr'}</Text>
                  {!isFree && activeTab === 'yearly' && <Text style={s.discountBadge}>-35%</Text>}
                  {!isFree && activeTab === 'quarterly' && <Text style={s.discountBadge}>-15%</Text>}
                </View>

                <Text style={s.planTagline}>{plan.description || 'Premium tier features'}</Text>

                {/* Only 4 Limits: AI Credits, Storage, Support, Growth Score */}
                <View style={s.statsGrid}>
                  <View style={s.statItem}>
                    <Icon name="brain" size={16} color="#2563EB" />
                    <Text style={s.statLabel}>AI Credits</Text>
                    <Text style={s.statValue}>{plan.aiCredits || 0}</Text>
                  </View>
                  <View style={s.statItem}>
                    <Icon name="database" size={16} color="#2563EB" />
                    <Text style={s.statLabel}>Storage</Text>
                    <Text style={s.statValue}>{plan.storageLimitMb || 0} MB</Text>
                  </View>
                  <View style={s.statItem}>
                    <Icon name="headset" size={16} color="#2563EB" />
                    <Text style={s.statLabel}>Support</Text>
                    <Text style={s.statValue}>{plan.supportLevel || 'Standard'}</Text>
                  </View>
                  <View style={s.statItem}>
                    <Icon name="trending-up" size={16} color="#2563EB" />
                    <Text style={s.statLabel}>Growth</Text>
                    <Text style={s.statValue}>{plan.businessGrowthScore || getDefaultGrowthScore(plan.key)}%</Text>
                  </View>
                </View>

                {/* Features Section */}
                <View style={s.featuresContainer}>
                  {/* First 5 Features (Green Tick) */}
                  {initialFeatures.map((f, i) => (
                    <View key={`${plan.key}-init-${i}`} style={s.featureRow}>
                      <Icon name="check-circle" size={16} color="#10B981" />
                      <Text style={s.featureText}>{f}</Text>
                    </View>
                  ))}
                  
                  {/* View All Toggle */}
                  {remainingFeatures.length > 0 && (
                    <Pressable onPress={() => handleExpand(plan.key)} style={s.expandToggle}>
                      <Text style={[s.expandText, { color: tierColors.highlight }]}>
                        {isExpanded ? 'Hide details' : `View all ${remainingFeatures.length} more features`}
                      </Text>
                      <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={tierColors.highlight} />
                    </Pressable>
                  )}

                  {/* Expanded Features */}
                  {isExpanded && (
                    <View style={s.expandedFeatures}>
                      {/* Normal Remaining Features (Green Tick) */}
                      {remainingFeatures.slice(0, remainingFeatures.length - 6).map((f, i) => (
                        <View key={`${plan.key}-mid-${i}`} style={s.featureRow}>
                          <Icon name="check-circle" size={16} color="#10B981" />
                          <Text style={s.featureText}>{f}</Text>
                        </View>
                      ))}
                      
                      {/* LAST 5-6 FEATURES - PREMIUM HIGHLIGHT (GOLDEN STAR) */}
                      {highlightedFeatures.map((f, i) => (
                        <View key={`${plan.key}-highlight-${i}`} style={[s.featureRow, s.highlightedFeatureRow]}>
                          <Icon name="star" size={18} color="#F59E0B" />
                          <Text style={s.highlightedFeatureText}>{f}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                {/* CTA Button */}
                <Pressable
                  onPress={() => handleUpgrade(plan)}
                  disabled={isLoadingThis || isCurrent}
                  style={[
                    s.ctaButton, 
                    { backgroundColor: isCurrent ? '#E2E8F0' : tierColors.highlight },
                    isCurrent && s.ctaDisabled
                  ]}>
                  {isLoadingThis ? (
                    <ActivityIndicator color={isCurrent ? '#64748B' : '#FFFFFF'} />
                  ) : (
                    <Text style={[s.ctaText, { color: isCurrent ? '#64748B' : '#FFFFFF' }]}>
                      {isCurrent ? 'Current Plan' : 'Get it now'}
                    </Text>
                  )}
                </Pressable>

              </View>
            );
          })}
        </View>

        {/* Trust Footer */}
        <View style={s.trustFooter}>
          <Icon name="shield-check-outline" size={16} color="#94A3B8" />
          <Text style={s.trustText}>Secure payments · Instant activation · 24/7 support</Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Skeleton Loader ──────────────────────────────────────
function SkeletonLoader() {
  return (
    <View style={s.skeletonContainer}>
      <View style={s.skeletonHeader} />
      <View style={s.skeletonTab} />
      <View style={s.skeletonCard} />
      <View style={s.skeletonCard} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 48, paddingBottom: 16, paddingHorizontal: 20, backgroundColor: '#F8FAFC',
  },
  headerBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  headerTitleContainer: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#0F172A', letterSpacing: -0.5 },
  
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 40 },

  heroSection: { paddingVertical: 20, alignItems: 'center' },
  heroTitle: { fontSize: 28, fontWeight: '800', color: '#0F172A', textAlign: 'center', letterSpacing: -0.8, marginBottom: 6 },
  heroSubtitle: { fontSize: 14, color: '#64748B', textAlign: 'center', fontWeight: '400' },

  // Tabs
  tabContainer: {
    flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 30, padding: 4, marginBottom: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  tabBtn: { flex: 1, paddingVertical: 12, borderRadius: 26, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  tabBtnActive: { backgroundColor: '#0F172A' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#94A3B8' },
  tabTextActive: { color: '#FFFFFF' },
  saveBadge: { backgroundColor: '#F59E0B', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  saveBadgeText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },

  // Active Plan Banner
  activeBanner: {
    flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 24,
    borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'space-between',
  },
  activeBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  activeBannerLabel: { fontSize: 12, color: '#94A3B8', fontWeight: '500' },
  activeBannerName: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  activeBannerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  creditsPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FEF3C7', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  creditsText: { fontSize: 12, fontWeight: '600', color: '#D97706' },

  // Plan Cards
  cardsContainer: { gap: 20, marginBottom: 20 },
  
  planCard: {
    borderRadius: 24, borderWidth: 1, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 3,
    backgroundColor: '#FFFFFF', padding: 20, position: 'relative',
  },
  planGradient: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.6 },
  glowOrb: { position: 'absolute', top: -40, right: -40, width: 120, height: 120, borderRadius: 60, opacity: 0.4 },
  
  // Top Row
  planTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, zIndex: 1 },
  planTierBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  planTierText: { fontSize: 11, fontWeight: '700' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  activeBadge: { backgroundColor: '#D1FAE5' },
  popularBadge: { backgroundColor: '#FEF3C7' },
  statusText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },

  planName: { fontSize: 22, fontWeight: '800', color: '#0F172A', marginBottom: 4, zIndex: 1 },
  
  // Price
  priceRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 4, zIndex: 1 },
  currencySymbol: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  priceAmount: { fontSize: 34, fontWeight: '800', color: '#0F172A', marginLeft: 2 },
  pricePeriod: { fontSize: 14, color: '#64748B', fontWeight: '500', marginLeft: 4 },
  discountBadge: { backgroundColor: '#10B981', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, marginLeft: 12, fontSize: 12, fontWeight: '700', color: '#FFFFFF', overflow: 'hidden' },

  planTagline: { fontSize: 13, color: '#64748B', marginBottom: 16, zIndex: 1 },

  // Stats Grid (Only 4)
  statsGrid: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: '#F1F5F9', zIndex: 1 },
  statItem: { flex: 1, alignItems: 'center', gap: 4 },
  statLabel: { fontSize: 9, color: '#64748B', fontWeight: '700', textTransform: 'uppercase' },
  statValue: { fontSize: 13, fontWeight: '800', color: '#0F172A' },

  // Features Section
  featuresContainer: { marginBottom: 8, zIndex: 1 },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 6 },
  featureText: { fontSize: 13, color: '#334155', fontWeight: '500', flex: 1 },
  
  // Highlighted Features (Golden Star)
  highlightedFeatureRow: { marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: '#FEF3C7' },
  highlightedFeatureText: { fontSize: 13, color: '#B45309', fontWeight: '700', flex: 1 },

  expandToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingVertical: 4 },
  expandText: { fontSize: 13, fontWeight: '700' },
  expandedFeatures: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' },

  // CTA
  ctaButton: { paddingVertical: 16, borderRadius: 30, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  ctaDisabled: { opacity: 0.7 },
  ctaText: { fontSize: 16, fontWeight: '700' },

  // Trust
  trustFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10 },
  trustText: { fontSize: 12, color: '#94A3B8', fontWeight: '500' },

  // Skeleton
  skeletonContainer: { flex: 1, padding: 20, backgroundColor: '#F8FAFC' },
  skeletonHeader: { height: 60, backgroundColor: '#E2E8F0', borderRadius: 12, marginBottom: 20 },
  skeletonTab: { height: 40, backgroundColor: '#E2E8F0', borderRadius: 20, marginBottom: 20 },
  skeletonCard: { height: 220, backgroundColor: '#E2E8F0', borderRadius: 24, marginBottom: 16 },
});