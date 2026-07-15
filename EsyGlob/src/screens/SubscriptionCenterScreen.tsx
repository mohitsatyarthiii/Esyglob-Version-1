import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import RazorpayCheckout from 'react-native-razorpay';
import {
  BillingCycle,
  createSubscriptionOrder,
  fetchSubscription,
  fetchSubscriptionPlans,
  setSubscriptionAutoRenew,
  SubscriptionPlan,
  verifySubscriptionPayment,
} from '../api/subscription';
import { useAuth } from '../auth/AuthContext';
import { ErrorState, LoadingState } from '../components/StateViews';

export default function SubscriptionCenterScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const qc = useQueryClient();
  const { activeRole } = useAuth();
  const role =
    route.params?.role === 'seller' || route.params?.role === 'buyer'
      ? route.params.role
      : activeRole === 'seller'
        ? 'seller'
        : 'buyer';
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const overview = useQuery({
    queryKey: ['subscription', role],
    queryFn: () => fetchSubscription(role),
  });
  const plans = useQuery({
    queryKey: ['subscription-plans', role],
    queryFn: () => fetchSubscriptionPlans(role),
  });
  const buy = useMutation({ 
    mutationFn: async (plan: SubscriptionPlan) => {
      if (!plan.prices[cycle])
        throw new Error('This billing cycle is unavailable.');
      const order = await createSubscriptionOrder(plan.key, cycle);
      const gateway = await RazorpayCheckout.open({
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
        razorpayPaymentId: gateway.razorpay_payment_id,
        razorpayOrderId: gateway.razorpay_order_id,
        razorpaySignature: gateway.razorpay_signature,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['subscription'] });
      await qc.invalidateQueries({ queryKey: ['invoices'] });
      Alert.alert(
        'Subscription activated',
        'Your plan, credits and limits are now active.',
      );
    },
    onError: (e: Error) => Alert.alert('Payment not completed', e.message),
  });
  const renew = useMutation({
    mutationFn: (value: boolean) => setSubscriptionAutoRenew(value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscription'] }),
  });
  if (overview.isLoading || plans.isLoading)
    return <LoadingState label="Loading subscription center" />;
  if (overview.isError || plans.isError)
    return (
      <ErrorState
        message="Subscription details could not be loaded."
        onRetry={() => {
          overview.refetch();
          plans.refetch();
        }}
      />
    );
  const data = overview.data!;
  const sub = data.subscription;
  const current = data.plan;
  const remaining = Number(data.usage.aiCreditsRemaining || 0);
  return (
    <View style={s.screen}>
      <View style={s.header}>
        <Pressable onPress={() => nav.goBack()} style={s.icon}>
          <Icon name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={s.headerTitle}>
          {role === 'seller'
            ? 'Seller Subscription Center'
            : 'Subscription & Billing'}
        </Text>
        <View style={s.icon} />
      </View>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.current}>
          <Text style={s.eyebrow}>CURRENT PLAN</Text>
          <View style={s.currentTop}>
            <View>
              <Text style={s.currentName}>{current.name}</Text>
              <Text style={s.status}>
                {String(sub.status || 'active').replace(/_/g, ' ')}
              </Text>
            </View>
            <Icon
              name={role === 'seller' ? 'store-check-outline' : 'crown-outline'}
              size={35}
              color="#2563EB"
            />
          </View>
          <Text style={s.desc}>{current.description}</Text>
          <View style={s.metrics}>
            <Metric
              label="AI credits"
              value={`${remaining}/${
                sub.aiCreditsAllocated || current.aiCredits
              }`}
            />
            <Metric label="Storage" value={`${current.storageLimitMb} MB`} />
            <Metric
              label="Renews"
              value={
                sub.expiryDate
                  ? new Date(sub.expiryDate).toLocaleDateString()
                  : 'Free plan'
              }
            />
          </View>
          <Pressable
            onPress={() => renew.mutate(!sub.autoRenew)}
            style={s.auto}
          >
            <Icon
              name={
                sub.autoRenew ? 'toggle-switch' : 'toggle-switch-off-outline'
              }
              size={27}
              color={sub.autoRenew ? '#2563EB' : '#94A3B8'}
            />
            <Text style={s.autoText}>
              Auto renewal {sub.autoRenew ? 'enabled' : 'disabled'}
            </Text>
          </Pressable>
          {role === 'seller' ? (
            <Text style={s.verification}>
              Verification: {current.verificationLevel} · Trust boost +
              {current.trustScoreBoost}
            </Text>
          ) : null}
        </View>
        <View style={s.cycle}>
          {(['monthly', 'quarterly', 'yearly'] as BillingCycle[]).map(item => (
            <Pressable
              key={item}
              onPress={() => setCycle(item)}
              style={[s.cycleItem, cycle === item && s.cycleActive]}
            >
              <Text style={[s.cycleText, cycle === item && s.cycleTextActive]}>
                {item}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={s.sectionTitle}>Choose your plan</Text>
        {plans.data!.map(plan => (
          <PlanCard
            key={plan.key}
            plan={plan}
            cycle={cycle}
            current={current.key === plan.key}
            pending={buy.isPending}
            onSelect={() => buy.mutate(plan)}
          />
        ))}
        <View style={s.usage}>
          <Text style={s.sectionTitle}>Usage & limits</Text>
          {Object.entries(current.limits || {}).map(([key, limit]) => (
            <View key={key} style={s.usageRow}>
              <Text style={s.usageLabel}>{key.replace(/([A-Z])/g, ' $1')}</Text>
              <Text style={s.usageValue}>
                {Number(data.usage[key] || 0)} /{' '}
                {Number(limit) < 0 ? 'Unlimited' : String(limit)}
              </Text>
            </View>
          ))}
        </View>
        <Pressable
          onPress={() => nav.navigate('InvoiceDetails', {})}
          style={s.billing}
        >
          <Icon name="receipt-text-outline" size={20} color="#2563EB" />
          <Text style={s.billingText}>Billing history and invoices</Text>
          <Icon name="chevron-right" size={20} color="#94A3B8" />
        </Pressable>
      </ScrollView>
    </View>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.metric}>
      <Text style={s.metricValue}>{value}</Text>
      <Text style={s.metricLabel}>{label}</Text>
    </View>
  );
}
function PlanCard({
  plan,
  cycle,
  current,
  pending,
  onSelect,
}: {
  plan: SubscriptionPlan;
  cycle: BillingCycle;
  current: boolean;
  pending: boolean;
  onSelect: () => void;
}) {
  return (
    <View style={[s.plan, current && s.planCurrent]}>
      <View style={s.planTop}>
        <View>
          <Text style={s.planName}>{plan.name}</Text>
          <Text style={s.planPrice}>
            ₹{Number(plan.prices[cycle] || 0).toLocaleString('en-IN')}{' '}
            <Text style={s.planPeriod}>/ {cycle}</Text>
          </Text>
        </View>
        {current ? <Text style={s.currentBadge}>CURRENT</Text> : null}
      </View>
      <Text style={s.desc}>{plan.description}</Text>
      {plan.features.map(item => (
        <View key={item} style={s.feature}>
          <Icon name="check-circle" size={15} color="#2563EB" />
          <Text style={s.featureText}>{item}</Text>
        </View>
      ))}
      <Text style={s.creditLine}>
        {plan.aiCredits} AI credits · {plan.supportLevel} support
      </Text>
      <Pressable
        disabled={current || pending || !plan.prices[cycle]}
        onPress={onSelect}
        style={[s.select, current && s.disabled]}
      >
        {pending && !current ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={s.selectText}>
            {current
              ? 'Active plan'
              : plan.prices[cycle]
              ? 'Upgrade / Select'
              : 'Included free'}
          </Text>
        )}
      </Pressable>
    </View>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderBottomColor: '#E2E8F0',
    borderBottomWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 48,
    paddingBottom: 10,
  },
  icon: {
    height: 40,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '900',
    flex: 1,
    textAlign: 'center',
  },
  content: { padding: 16, paddingBottom: 80 },
  current: { backgroundColor: '#EFF6FF', borderRadius: 18, padding: 18 },
  eyebrow: {
    color: '#2563EB',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  currentTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 7,
  },
  currentName: { color: '#0F172A', fontSize: 25, fontWeight: '900' },
  status: {
    color: '#16A34A',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'capitalize',
  },
  desc: { color: '#64748B', fontSize: 12, lineHeight: 18, marginTop: 8 },
  metrics: { flexDirection: 'row', gap: 8, marginTop: 16 },
  metric: {
    backgroundColor: '#FFFFFFCC',
    borderRadius: 11,
    flex: 1,
    padding: 10,
  },
  metricValue: { color: '#0F172A', fontSize: 12, fontWeight: '900' },
  metricLabel: { color: '#64748B', fontSize: 9, marginTop: 3 },
  auto: { alignItems: 'center', flexDirection: 'row', gap: 7, marginTop: 13 },
  autoText: { color: '#334155', fontSize: 11, fontWeight: '800' },
  verification: {
    color: '#1D4ED8',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 8,
  },
  cycle: {
    backgroundColor: '#E2E8F0',
    borderRadius: 12,
    flexDirection: 'row',
    marginVertical: 16,
    padding: 3,
  },
  cycleItem: { alignItems: 'center', borderRadius: 10, flex: 1, padding: 9 },
  cycleActive: { backgroundColor: '#fff' },
  cycleText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  cycleTextActive: { color: '#0F172A' },
  sectionTitle: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 10,
  },
  plan: {
    backgroundColor: '#fff',
    borderColor: '#E2E8F0',
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    padding: 16,
  },
  planCurrent: { borderColor: '#2563EB', borderWidth: 2 },
  planTop: { flexDirection: 'row', justifyContent: 'space-between' },
  planName: { color: '#0F172A', fontSize: 17, fontWeight: '900' },
  planPrice: {
    color: '#2563EB',
    fontSize: 20,
    fontWeight: '900',
    marginTop: 4,
  },
  planPeriod: { color: '#64748B', fontSize: 10 },
  currentBadge: {
    backgroundColor: '#DBEAFE',
    borderRadius: 12,
    color: '#1D4ED8',
    fontSize: 9,
    fontWeight: '900',
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  feature: { alignItems: 'center', flexDirection: 'row', gap: 7, marginTop: 8 },
  featureText: { color: '#334155', fontSize: 11 },
  creditLine: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '800',
    marginTop: 12,
  },
  select: {
    alignItems: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 11,
    justifyContent: 'center',
    marginTop: 14,
    minHeight: 44,
  },
  disabled: { backgroundColor: '#94A3B8' },
  selectText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  usage: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginTop: 4,
    padding: 16,
  },
  usageRow: {
    borderBottomColor: '#F1F5F9',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 9,
  },
  usageLabel: { color: '#64748B', fontSize: 11, textTransform: 'capitalize' },
  usageValue: { color: '#0F172A', fontSize: 11, fontWeight: '900' },
  billing: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 9,
    marginTop: 12,
    padding: 15,
  },
  billingText: { color: '#0F172A', flex: 1, fontSize: 12, fontWeight: '900' },
});
