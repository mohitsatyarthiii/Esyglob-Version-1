import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import RazorpayCheckout from 'react-native-razorpay';
import {
  BillingCycle,
  createSubscriptionOrder,
  fetchSubscription,
  fetchSubscriptionPlans,
  SubscriptionPlan,
  verifySubscriptionPayment,
} from '../api/subscription';
import { useAuth } from '../auth/AuthContext';
import { ErrorState } from '../components/StateViews';

const CYCLES: Array<{ key: BillingCycle; title: string; period: string; discount?: string }> = [
  { key: 'monthly', title: 'Monthly', period: '/mo' },
  { key: 'quarterly', title: 'Quarterly', period: '/qtr', discount: '-15%' },
  { key: 'yearly', title: 'Yearly', period: '/yr', discount: '-35%' },
];

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function SubscriptionCenterScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const queryClient = useQueryClient();
  const { activeRole } = useAuth();
  const role: 'buyer' | 'seller' =
    route.params?.role === 'seller' || route.params?.role === 'buyer'
      ? route.params.role
      : activeRole === 'seller'
        ? 'seller'
        : 'buyer';
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [expandedPlans, setExpandedPlans] = useState<Record<string, boolean>>({});

  const overviewQuery = useQuery({
    queryKey: ['subscription', role],
    queryFn: () => fetchSubscription(role),
  });
  const plansQuery = useQuery({
    queryKey: ['subscription-plans', role],
    queryFn: () => fetchSubscriptionPlans(role),
  });

  const purchase = useMutation({
    mutationFn: async (plan: SubscriptionPlan) => {
      const price = Number(plan.prices?.[cycle] || 0);
      if (price <= 0) throw new Error('This plan cannot be purchased for the selected billing cycle.');
      const order = await createSubscriptionOrder(plan.key, cycle);
      const result = await RazorpayCheckout.open({
        key: order.key,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: 'EsyGlob',
        description: `${plan.name} subscription`,
        prefill: order.user,
        theme: { color: '#2563EB' },
      });
      return verifySubscriptionPayment({
        planType: plan.key,
        duration: cycle,
        razorpayPaymentId: result.razorpay_payment_id,
        razorpayOrderId: result.razorpay_order_id,
        razorpaySignature: result.razorpay_signature,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['subscription', role] });
      await queryClient.invalidateQueries({ queryKey: ['invoices'] });
      Alert.alert('Subscription activated', 'Your subscription is now active.');
    },
    onError: (error: Error) => Alert.alert('Payment not completed', error.message),
  });

  const plans = useMemo(
    () => [...(plansQuery.data || [])].sort((a, b) => Number(a.priorityRanking || 0) - Number(b.priorityRanking || 0)),
    [plansQuery.data],
  );
  const currentPlan = overviewQuery.data?.plan;
  const subscription = overviewQuery.data?.subscription;
  const remainingCredits = Number(overviewQuery.data?.usage?.aiCreditsRemaining || 0);

  const toggleFeatures = (key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedPlans(value => ({ ...value, [key]: !value[key] }));
  };

  if (overviewQuery.isLoading || plansQuery.isLoading) return <SubscriptionSkeleton />;
  if (overviewQuery.isError || plansQuery.isError) {
    return (
      <ErrorState
        message="Subscription plans could not be loaded."
        onRetry={() => {
          overviewQuery.refetch();
          plansQuery.refetch();
        }}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headerButton}>
          <Icon name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Subscription Pricing</Text>
          <Text style={styles.headerSubtitle}>{role === 'seller' ? 'Seller' : 'Buyer'} plans from EsyGlob</Text>
        </View>
        <Pressable onPress={() => navigation.navigate('InvoiceDetails', {})} style={styles.headerButton}>
          <Icon name="receipt-text-outline" size={21} color="#2563EB" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {currentPlan ? (
          <LinearGradient colors={['#EFF6FF', '#FFFFFF']} style={styles.currentBanner}>
            <View style={styles.currentIcon}><Icon name="crown-outline" size={24} color="#2563EB" /></View>
            <View style={styles.currentCopy}>
              <Text style={styles.currentEyebrow}>CURRENT PLAN</Text>
              <Text style={styles.currentName}>{currentPlan.name}</Text>
              <Text style={styles.currentMeta}>{remainingCredits.toLocaleString('en-IN')} AI credits remaining</Text>
            </View>
            <View style={styles.expiryBox}>
              <Text style={styles.expiryLabel}>EXPIRY</Text>
              <Text style={styles.expiryValue}>{subscription?.expiryDate ? new Date(subscription.expiryDate).toLocaleDateString('en-IN') : 'No expiry'}</Text>
            </View>
          </LinearGradient>
        ) : null}

        <View style={styles.tabs}>
          {CYCLES.map(item => (
            <Pressable key={item.key} onPress={() => setCycle(item.key)} style={[styles.tab, cycle === item.key && styles.activeTab]}>
              {item.discount ? <Text style={[styles.discount, cycle === item.key && styles.activeDiscount]}>{item.discount}</Text> : null}
              <Text style={[styles.tabText, cycle === item.key && styles.activeTabText]}>{item.title}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Choose the right plan</Text>
        <Text style={styles.sectionSubtitle}>All information below is loaded from your subscription API.</Text>

        {plans.map(plan => (
          <PricingCard
            key={plan._id || plan.key}
            plan={plan}
            cycle={cycle}
            current={currentPlan?.key === plan.key}
            expanded={Boolean(expandedPlans[plan.key])}
            purchasing={purchase.isPending && purchase.variables?.key === plan.key}
            onToggle={() => toggleFeatures(plan.key)}
            onPurchase={() => purchase.mutate(plan)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function PricingCard({ plan, cycle, current, expanded, purchasing, onToggle, onPurchase }: {
  plan: SubscriptionPlan;
  cycle: BillingCycle;
  current: boolean;
  expanded: boolean;
  purchasing: boolean;
  onToggle: () => void;
  onPurchase: () => void;
}) {
  const rank = Number(plan.priorityRanking || 0);
  const palette = rank >= 3
    ? { colors: ['#FFFBEB', '#FEF3C7', '#FFFFFF'], border: '#F59E0B', accent: '#B45309', tier: 'LEGENDARY' }
    : rank >= 2
      ? { colors: ['#EFF6FF', '#DBEAFE', '#FFFFFF'], border: '#3B82F6', accent: '#1D4ED8', tier: 'PREMIUM' }
      : { colors: ['#F8FAFC', '#E2E8F0', '#FFFFFF'], border: '#CBD5E1', accent: '#475569', tier: 'COMMON' };
  const price = Number(plan.prices?.[cycle] || 0);
  const period = CYCLES.find(item => item.key === cycle)?.period || '';
  const features = Array.isArray(plan.features) ? plan.features : [];

  return (
    <LinearGradient colors={palette.colors} style={[styles.card, { borderColor: palette.border }]}>
      <View style={styles.badgeRow}>
        <View style={[styles.aiBadge, { backgroundColor: `${palette.border}20` }]}>
          <Icon name="robot-outline" size={14} color={palette.accent} />
          <Text style={[styles.aiBadgeText, { color: palette.accent }]}>{formatAiTier(plan.aiTier)}</Text>
        </View>
        <View style={[styles.statusBadge, current ? styles.activeBadge : styles.popularBadge]}>
          <Icon name={current ? 'check-circle' : 'star'} size={12} color={current ? '#047857' : '#B45309'} />
          <Text style={[styles.statusText, { color: current ? '#047857' : '#B45309' }]}>{current ? 'ACTIVE' : 'POPULAR'}</Text>
        </View>
      </View>

      <Text style={[styles.tierLabel, { color: palette.accent }]}>{palette.tier}</Text>
      <Text style={styles.planName}>{plan.name}</Text>
      <Text style={styles.description}>{plan.description || 'No description provided.'}</Text>
      <View style={styles.priceRow}>
        <Text style={styles.currency}>₹</Text>
        <Text style={styles.price}>{price.toLocaleString('en-IN')}</Text>
        <Text style={styles.period}>{period}</Text>
      </View>

      <View style={styles.statsGrid}>
        <QuickStat icon="brain" value={Number(plan.aiCredits || 0).toLocaleString('en-IN')} label="AI credits" />
        <QuickStat icon="database-outline" value={`${Number(plan.storageLimitMb || 0).toLocaleString('en-IN')} MB`} label="Storage" />
        <QuickStat icon="headset" value={plan.supportLevel || 'N/A'} label="Support" />
        <QuickStat icon="trending-up" value={`+${Number(plan.trustScoreBoost || 0)}`} label="Trust score" />
      </View>

      <Pressable onPress={onToggle} style={styles.featureToggle}>
        <View style={styles.featureToggleCopy}>
          <Icon name="format-list-checks" size={19} color="#2563EB" />
          <Text style={styles.featureToggleText}>{expanded ? 'Hide features' : `View all ${features.length} features`}</Text>
        </View>
        <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={22} color="#64748B" />
      </Pressable>

      {expanded ? (
        <View style={styles.featureList}>
          {features.map((feature, index) => (
            <View key={`${plan.key}-${index}-${feature}`} style={styles.featureRow}>
              <View style={styles.featureIcon}><Icon name="check" size={13} color="#FFFFFF" /></View>
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
          {!features.length ? <Text style={styles.noFeatures}>No features returned by the backend.</Text> : null}
        </View>
      ) : null}

      <Pressable disabled={current || purchasing || price <= 0} onPress={onPurchase} style={[styles.cta, (current || price <= 0) && styles.ctaDisabled]}>
        {purchasing ? <ActivityIndicator color="#FFFFFF" /> : <Text style={[styles.ctaText, (current || price <= 0) && styles.ctaTextDisabled]}>{current ? 'Current Plan' : price <= 0 ? 'Free Plan' : 'Get it now'}</Text>}
      </Pressable>
      <View style={styles.footerBadge}>
        <Icon name="shield-check-outline" size={15} color={palette.accent} />
        <Text style={[styles.footerText, { color: palette.accent }]}>Verification: {String(plan.verificationLevel || 'N/A').toUpperCase()}</Text>
      </View>
    </LinearGradient>
  );
}

function QuickStat({ icon, value, label }: { icon: string; value: string; label: string }) {
  return <View style={styles.stat}><Icon name={icon} size={17} color="#2563EB" /><Text numberOfLines={1} style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

function formatAiTier(value?: string) {
  return String(value || 'AI tier unavailable').replace(/^esyai_/i, 'EsyAI ').replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function SubscriptionSkeleton() {
  useEffect(() => {
    const timer = setInterval(() => LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut), 900);
    return () => clearInterval(timer);
  }, []);
  return <View style={styles.screen}><View style={styles.skeletonHeader} /><View style={styles.skeletonContent}><View style={styles.skeletonBanner} />{[0, 1, 2].map(item => <View key={item} style={styles.skeletonCard}><View style={styles.skeletonLineWide} /><View style={styles.skeletonLine} /><View style={styles.skeletonBlocks}><View style={styles.skeletonBlock} /><View style={styles.skeletonBlock} /><View style={styles.skeletonBlock} /><View style={styles.skeletonBlock} /></View></View>)}</View></View>;
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#F8FAFC', flex: 1 },
  header: { alignItems: 'center', backgroundColor: '#FFFFFF', borderBottomColor: '#E2E8F0', borderBottomWidth: 1, flexDirection: 'row', paddingBottom: 12, paddingHorizontal: 14, paddingTop: 48 },
  headerButton: { alignItems: 'center', height: 40, justifyContent: 'center', width: 40 },
  headerCopy: { alignItems: 'center', flex: 1 },
  headerTitle: { color: '#0F172A', fontSize: 18, fontWeight: '900' },
  headerSubtitle: { color: '#64748B', fontSize: 10, marginTop: 2 },
  content: { padding: 16, paddingBottom: 70 },
  currentBanner: { alignItems: 'center', borderColor: '#BFDBFE', borderRadius: 18, borderWidth: 1, flexDirection: 'row', marginBottom: 16, padding: 16 },
  currentIcon: { alignItems: 'center', backgroundColor: '#DBEAFE', borderRadius: 13, height: 44, justifyContent: 'center', width: 44 },
  currentCopy: { flex: 1, marginLeft: 11 },
  currentEyebrow: { color: '#2563EB', fontSize: 8, fontWeight: '900', letterSpacing: 0.7 },
  currentName: { color: '#0F172A', fontSize: 16, fontWeight: '900', marginTop: 2 },
  currentMeta: { color: '#475569', fontSize: 10, marginTop: 2 },
  expiryBox: { alignItems: 'flex-end' },
  expiryLabel: { color: '#94A3B8', fontSize: 8, fontWeight: '800' },
  expiryValue: { color: '#334155', fontSize: 10, fontWeight: '800', marginTop: 3 },
  tabs: { backgroundColor: '#E2E8F0', borderRadius: 14, flexDirection: 'row', marginBottom: 22, padding: 4 },
  tab: { alignItems: 'center', borderRadius: 11, flex: 1, justifyContent: 'center', minHeight: 51, paddingVertical: 7 },
  activeTab: { backgroundColor: '#FFFFFF', elevation: 2, shadowColor: '#0F172A', shadowOffset: { height: 1, width: 0 }, shadowOpacity: 0.08, shadowRadius: 4 },
  tabText: { color: '#64748B', fontSize: 11, fontWeight: '800' },
  activeTabText: { color: '#0F172A' },
  discount: { color: '#64748B', fontSize: 8, fontWeight: '900', marginBottom: 2 },
  activeDiscount: { color: '#16A34A' },
  sectionTitle: { color: '#0F172A', fontSize: 19, fontWeight: '900' },
  sectionSubtitle: { color: '#64748B', fontSize: 11, marginBottom: 15, marginTop: 3 },
  card: { borderRadius: 20, borderWidth: 1.5, marginBottom: 16, overflow: 'hidden', padding: 17 },
  badgeRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  aiBadge: { alignItems: 'center', borderRadius: 20, flexDirection: 'row', gap: 5, paddingHorizontal: 9, paddingVertical: 6 },
  aiBadgeText: { fontSize: 9, fontWeight: '900' },
  statusBadge: { alignItems: 'center', borderRadius: 20, flexDirection: 'row', gap: 4, paddingHorizontal: 9, paddingVertical: 6 },
  activeBadge: { backgroundColor: '#D1FAE5' },
  popularBadge: { backgroundColor: '#FEF3C7' },
  statusText: { fontSize: 8, fontWeight: '900' },
  tierLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 1.1, marginTop: 15 },
  planName: { color: '#0F172A', fontSize: 24, fontWeight: '900', marginTop: 3 },
  description: { color: '#475569', fontSize: 11, lineHeight: 17, marginTop: 5 },
  priceRow: { alignItems: 'flex-end', flexDirection: 'row', marginVertical: 15 },
  currency: { color: '#0F172A', fontSize: 18, fontWeight: '900', marginBottom: 5 },
  price: { color: '#0F172A', fontSize: 34, fontWeight: '900' },
  period: { color: '#64748B', fontSize: 11, fontWeight: '700', marginBottom: 6, marginLeft: 3 },
  statsGrid: { flexDirection: 'row', gap: 6 },
  stat: { alignItems: 'center', backgroundColor: '#FFFFFFB8', borderColor: '#FFFFFF', borderRadius: 11, borderWidth: 1, flex: 1, minWidth: 0, paddingHorizontal: 3, paddingVertical: 10 },
  statValue: { color: '#0F172A', fontSize: 9, fontWeight: '900', marginTop: 4, textTransform: 'capitalize' },
  statLabel: { color: '#64748B', fontSize: 7, marginTop: 2, textAlign: 'center' },
  featureToggle: { alignItems: 'center', backgroundColor: '#FFFFFFB8', borderColor: '#E2E8F0', borderRadius: 12, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, padding: 12 },
  featureToggleCopy: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  featureToggleText: { color: '#1E293B', fontSize: 11, fontWeight: '900' },
  featureList: { backgroundColor: '#FFFFFFA6', borderRadius: 12, gap: 9, marginTop: 8, padding: 12 },
  featureRow: { alignItems: 'center', flexDirection: 'row' },
  featureIcon: { alignItems: 'center', backgroundColor: '#16A34A', borderRadius: 9, height: 19, justifyContent: 'center', width: 19 },
  featureText: { color: '#334155', flex: 1, fontSize: 10, fontWeight: '600', lineHeight: 15, marginLeft: 8 },
  noFeatures: { color: '#64748B', fontSize: 10, textAlign: 'center' },
  cta: { alignItems: 'center', backgroundColor: '#2563EB', borderRadius: 12, justifyContent: 'center', marginTop: 14, minHeight: 48 },
  ctaDisabled: { backgroundColor: '#E2E8F0' },
  ctaText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  ctaTextDisabled: { color: '#64748B' },
  footerBadge: { alignItems: 'center', flexDirection: 'row', gap: 6, justifyContent: 'center', marginTop: 11 },
  footerText: { fontSize: 9, fontWeight: '900' },
  skeletonHeader: { backgroundColor: '#E2E8F0', height: 101 },
  skeletonContent: { padding: 16 },
  skeletonBanner: { backgroundColor: '#E2E8F0', borderRadius: 18, height: 86, marginBottom: 16 },
  skeletonCard: { backgroundColor: '#E2E8F0', borderRadius: 20, height: 280, marginBottom: 16, padding: 18 },
  skeletonLineWide: { backgroundColor: '#CBD5E1', borderRadius: 7, height: 24, width: '62%' },
  skeletonLine: { backgroundColor: '#CBD5E1', borderRadius: 5, height: 12, marginTop: 12, width: '88%' },
  skeletonBlocks: { flexDirection: 'row', gap: 6, marginTop: 80 },
  skeletonBlock: { backgroundColor: '#CBD5E1', borderRadius: 10, flex: 1, height: 62 },
});
