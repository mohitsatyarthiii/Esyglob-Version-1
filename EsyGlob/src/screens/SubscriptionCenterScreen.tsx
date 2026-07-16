import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
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
  const [cycle, setCycle] = useState<BillingCycle>('yearly');
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);

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
      if (!plan.prices[cycle]) throw new Error('This billing cycle is unavailable.');
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
      Alert.alert('Subscription Activated', 'Your plan, credits and limits are now active.');
    },
    onError: (e: Error) => Alert.alert('Payment Not Completed', e.message),
  });

  const renew = useMutation({
    mutationFn: (value: boolean) => setSubscriptionAutoRenew(value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscription'] }),
  });

  if (overview.isLoading || plansQuery.isLoading)
    return <LoadingState label="Loading subscription center" />;
  if (overview.isError || plansQuery.isError)
    return (
      <ErrorState
        message="Subscription details could not be loaded."
        onRetry={() => {
          overview.refetch();
          plansQuery.refetch();
        }}
      />
    );

  const data = overview.data!;
  const sub = data.subscription;
  const current = data.plan;
  const remaining = Number(data.usage.aiCreditsRemaining || 0);
  const plans = plansQuery.data!;

  // Sort plans so free comes last (bottom), premium on top
  const sortedPlans = [...plans].sort((a, b) => {
    const order = ['free', 'pro', 'business', 'enterprise'];
    return order.indexOf(b.key) - order.indexOf(a.key);
  });

  const getPlanTier = (planKey: string): string => {
    const tiers: Record<string, string> = {
      free: 'Starter',
      pro: 'Pro',
      business: 'Business',
      enterprise: 'Enterprise',
    };
    return tiers[planKey] || planKey;
  };

  return (
    <View style={s.screen}>
      {/* Premium Header */}
      <View style={s.header}>
        <View style={s.headerGlow} />
        <Pressable onPress={() => nav.goBack()} style={s.headerIcon}>
          <Icon name="arrow-left" size={22} color="#FFFFFF" />
        </Pressable>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>
            {role === 'seller' ? 'Seller Plans' : 'Buyer Plans'}
          </Text>
          <Text style={s.headerSubtitle}>Unlock your business potential</Text>
        </View>
        <Pressable
          onPress={() => nav.navigate('InvoiceDetails', {})}
          style={s.headerIcon}>
          <Icon name="receipt-text-outline" size={22} color="#FFFFFF" />
        </Pressable>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}>
        
        {/* Current Plan Card - Premium Badge */}
        <View style={s.currentPlanCard}>
          <View style={s.currentPlanGlow} />
          <View style={s.currentPlanHeader}>
            <View style={s.currentBadgeRow}>
              <View style={s.activeBadge}>
                <View style={s.activeDot} />
                <Text style={s.activeBadgeText}>ACTIVE PLAN</Text>
              </View>
              {sub.autoRenew && (
                <View style={s.autoRenewBadge}>
                  <Icon name="autorenew" size={12} color="#10B981" />
                  <Text style={s.autoRenewText}>Auto-renew</Text>
                </View>
              )}
            </View>
            <Pressable
              onPress={() => renew.mutate(!sub.autoRenew)}
              style={s.autoRenewToggle}>
              <Text style={s.autoRenewLabel}>
                {sub.autoRenew ? 'ON' : 'OFF'}
              </Text>
              <View
                style={[
                  s.toggleTrack,
                  sub.autoRenew && s.toggleTrackActive,
                ]}>
                <View
                  style={[
                    s.toggleThumb,
                    sub.autoRenew && s.toggleThumbActive,
                  ]}
                />
              </View>
            </Pressable>
          </View>

          <View style={s.planIdentity}>
            <View style={s.planIconContainer}>
              <Icon
                name={
                  role === 'seller' ? 'storefront-outline' : 'briefcase-outline'
                }
                size={28}
                color="#FFFFFF"
              />
            </View>
            <View style={s.planNameBlock}>
              <Text style={s.currentPlanName}>{current.name}</Text>
              <Text style={s.currentPlanTier}>
                EsyGlob {getPlanTier(current.key)}
              </Text>
            </View>
            <Icon name="shield-check" size={24} color="#10B981" />
          </View>

          {/* Metrics Grid */}
          <View style={s.metricsGrid}>
            <View style={s.metricBox}>
              <Icon name="brain" size={16} color="#818CF8" />
              <Text style={s.metricValue}>
                {remaining}/{sub.aiCreditsAllocated || current.aiCredits}
              </Text>
              <Text style={s.metricLabel}>AI Credits</Text>
            </View>
            <View style={s.metricDivider} />
            <View style={s.metricBox}>
              <Icon name="database-outline" size={16} color="#34D399" />
              <Text style={s.metricValue}>{current.storageLimitMb} MB</Text>
              <Text style={s.metricLabel}>Storage</Text>
            </View>
            <View style={s.metricDivider} />
            <View style={s.metricBox}>
              <Icon name="calendar-outline" size={16} color="#F472B6" />
              <Text style={s.metricValue}>
                {sub.expiryDate
                  ? new Date(sub.expiryDate).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                    })
                  : 'Free'}
              </Text>
              <Text style={s.metricLabel}>Expires</Text>
            </View>
          </View>

          {role === 'seller' && (
            <View style={s.verificationRow}>
              <Icon name="star" size={14} color="#F59E0B" />
              <Text style={s.verificationText}>
                {current.verificationLevel} Verification · Trust Score +{current.trustScoreBoost}
              </Text>
            </View>
          )}
        </View>

        {/* Billing Cycle Selector */}
        <View style={s.cycleContainer}>
          <Text style={s.cycleLabel}>Billing Cycle</Text>
          <View style={s.cycleRow}>
            {(['monthly', 'quarterly', 'yearly'] as BillingCycle[]).map(
              (item) => {
                const isActive = cycle === item;
                const savings =
                  item === 'yearly'
                    ? 'Save 25%'
                    : item === 'quarterly'
                      ? 'Save 12%'
                      : null;
                return (
                  <Pressable
                    key={item}
                    onPress={() => setCycle(item)}
                    style={[s.cycleChip, isActive && s.cycleChipActive]}>
                    <Text
                      style={[
                        s.cycleChipText,
                        isActive && s.cycleChipTextActive,
                      ]}>
                      {item}
                    </Text>
                    {savings && (
                      <Text
                        style={[
                          s.cycleSavings,
                          isActive && s.cycleSavingsActive,
                        ]}>
                        {savings}
                      </Text>
                    )}
                  </Pressable>
                );
              },
            )}
          </View>
        </View>

        {/* Available Plans */}
        <Text style={s.sectionTitle}>Available Plans</Text>
        <Text style={s.sectionSubtitle}>
          Every plan includes EsyAI Business Copilot
        </Text>

        {sortedPlans.map((plan, index) => {
          const isCurrent = current.key === plan.key;
          const isPopular = plan.key === 'pro' || plan.key === 'gold';
          return (
            <PlanCardPremium
              key={plan.key}
              plan={plan}
              cycle={cycle}
              isCurrent={isCurrent}
              isPopular={isPopular}
              isPending={buy.isPending}
              onSelect={() => setSelectedPlan(plan)}
              tier={getPlanTier(plan.key)}
              role={role}
              previousPlanName={
                index < sortedPlans.length - 1
                  ? sortedPlans[index + 1].name
                  : undefined
              }
            />
          );
        })}

        {/* Billing History Link */}
        <Pressable
          onPress={() => nav.navigate('InvoiceDetails', {})}
          style={s.billingLink}>
          <View style={s.billingLinkLeft}>
            <Icon name="file-document-outline" size={20} color="#6366F1" />
            <Text style={s.billingLinkText}>Billing History & Invoices</Text>
          </View>
          <Icon name="chevron-right" size={20} color="#94A3B8" />
        </Pressable>

        <View style={s.bottomSpacer} />
      </ScrollView>

      {/* Upgrade Modal */}
      <Modal
        transparent
        animationType="slide"
        visible={Boolean(selectedPlan)}
        onRequestClose={() => setSelectedPlan(null)}>
        <Pressable
          style={s.modalBackdrop}
          onPress={() => setSelectedPlan(null)}>
          <Pressable style={s.modalSheet} onPress={() => undefined}>
            <View style={s.modalHandle} />
            {selectedPlan && (
              <>
                <ScrollView showsVerticalScrollIndicator={false}>
                  <View style={s.modalHero}>
                    <View style={s.modalHeroGlow} />
                    <View style={s.modalIconBox}>
                      <Icon name="crown" size={32} color="#F59E0B" />
                    </View>
                    <Text style={s.modalPlanName}>{selectedPlan.name}</Text>
                    <Text style={s.modalTier}>
                      EsyGlob {getPlanTier(selectedPlan.key)}
                    </Text>
                    <View style={s.modalPriceRow}>
                      <Text style={s.modalPrice}>
                        ₹
                        {Number(
                          selectedPlan.prices[cycle] || 0,
                        ).toLocaleString('en-IN')}
                      </Text>
                      <Text style={s.modalPeriod}>/{cycle}</Text>
                    </View>
                  </View>

                  <View style={s.modalSection}>
                    <Text style={s.modalSectionTitle}>What's Included</Text>
                    {selectedPlan.features.map((feature, i) => (
                      <View key={i} style={s.modalFeature}>
                        <Icon name="check-circle" size={18} color="#10B981" />
                        <Text style={s.modalFeatureText}>{feature}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={s.modalSection}>
                    <Text style={s.modalSectionTitle}>AI Capabilities</Text>
                    <View style={s.aiModelBadge}>
                      <Icon name="cpu-64-bit" size={16} color="#6366F1" />
                      <Text style={s.aiModelText}>
                        {selectedPlan.key === 'free'
                          ? 'EsyAI Lite'
                          : selectedPlan.key === 'pro' || selectedPlan.key === 'verified'
                            ? 'EsyAI Pro'
                            : selectedPlan.key === 'business' || selectedPlan.key === 'gold'
                              ? 'EsyAI Advanced'
                              : 'EsyAI Enterprise'}
                      </Text>
                    </View>
                  </View>

                  <View style={s.modalPayment}>
                    <Text style={s.modalPaymentTitle}>Secure Payment</Text>
                    <View style={s.paymentMethods}>
                      {['UPI', 'Cards', 'Net Banking', 'Wallet'].map((m) => (
                        <View key={m} style={s.paymentPill}>
                          <Icon
                            name={
                              m === 'UPI'
                                ? 'qrcode'
                                : m === 'Cards'
                                  ? 'credit-card'
                                  : m === 'Net Banking'
                                    ? 'bank'
                                    : 'wallet'
                            }
                            size={14}
                            color="#6366F1"
                          />
                          <Text style={s.paymentPillText}>{m}</Text>
                        </View>
                      ))}
                    </View>
                    <Text style={s.gatewayNote}>
                      Secured by Razorpay · Instant activation
                    </Text>
                  </View>
                </ScrollView>

                <Pressable
                  disabled={
                    buy.isPending || !selectedPlan.prices[cycle] || isCurrentAndSameCycle()
                  }
                  onPress={() => {
                    const plan = selectedPlan;
                    setSelectedPlan(null);
                    buy.mutate(plan);
                  }}
                  style={[
                    s.modalButton,
                    (!selectedPlan.prices[cycle] || buy.isPending) &&
                      s.modalButtonDisabled,
                  ]}>
                  {buy.isPending ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={s.modalButtonText}>
                      {current.key === selectedPlan.key
                        ? 'Renew Plan'
                        : selectedPlan.prices[cycle]
                          ? `Upgrade to ${getPlanTier(selectedPlan.key)}`
                          : 'Current Plan'}
                    </Text>
                  )}
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );

  function isCurrentAndSameCycle(): boolean {
    return current.key === selectedPlan?.key;
  }
}

// Premium Plan Card Component
function PlanCardPremium({
  plan,
  cycle,
  isCurrent,
  isPopular,
  isPending,
  onSelect,
  tier,
  role,
  previousPlanName,
}: {
  plan: SubscriptionPlan;
  cycle: BillingCycle;
  isCurrent: boolean;
  isPopular: boolean;
  isPending: boolean;
  onSelect: () => void;
  tier: string;
  role: string;
  previousPlanName?: string;
}) {
  const price = plan.prices[cycle];
  const isFree = plan.key === 'free';

  const aiModels: Record<string, { name: string; icon: string; color: string }> = {
    free: { name: 'EsyAI Lite', icon: 'cpu-32-bit', color: '#94A3B8' },
    pro: { name: 'EsyAI Pro', icon: 'cpu-64-bit', color: '#6366F1' },
    business: { name: 'EsyAI Advanced', icon: 'memory', color: '#8B5CF6' },
    enterprise: { name: 'EsyAI Enterprise', icon: 'server', color: '#EC4899' },
    verified: { name: 'EsyAI Pro', icon: 'cpu-64-bit', color: '#6366F1' },
    gold: { name: 'EsyAI Advanced', icon: 'memory', color: '#8B5CF6' },
  };

  const aiModel = aiModels[plan.key] || aiModels.free;

  return (
    <View style={[s.planCard, isCurrent && s.planCardCurrent, isPopular && !isCurrent && s.planCardPopular]}>
      {/* Popular Badge */}
      {isPopular && !isCurrent && (
        <View style={s.popularBadge}>
          <Icon name="star" size={12} color="#FFFFFF" />
          <Text style={s.popularBadgeText}>MOST POPULAR</Text>
        </View>
      )}

      {/* Current Plan Banner */}
      {isCurrent && (
        <View style={s.currentBanner}>
          <Icon name="check-circle" size={14} color="#FFFFFF" />
          <Text style={s.currentBannerText}>YOUR CURRENT PLAN</Text>
        </View>
      )}

      <View style={s.planCardContent}>
        {/* Plan Header */}
        <View style={s.planCardHeader}>
          <View>
            <Text style={s.planCardTier}>EsyGlob {tier}</Text>
            <Text style={s.planCardName}>{plan.name}</Text>
          </View>
          {!isFree && (
            <View style={s.priceBlock}>
              <Text style={s.priceAmount}>
                ₹{Number(price || 0).toLocaleString('en-IN')}
              </Text>
              <Text style={s.pricePeriod}>/{cycle}</Text>
            </View>
          )}
        </View>

        {/* AI Model Indicator */}
        <View style={[s.aiModelStrip, { backgroundColor: aiModel.color + '15' }]}>
          <Icon name={aiModel.icon} size={18} color={aiModel.color} />
          <Text style={[s.aiModelStripText, { color: aiModel.color }]}>
            {aiModel.name}
          </Text>
          {previousPlanName && (
            <Text style={s.aiUpgradeText}>↑ from {previousPlanName}</Text>
          )}
        </View>

        {/* Description */}
        <Text style={s.planCardDesc}>{plan.description}</Text>

        {/* Key Features Preview */}
        <View style={s.featuresPreview}>
          {plan.features.slice(0, 4).map((feature, i) => (
            <View key={i} style={s.featureRow}>
              <Icon name="check" size={14} color="#10B981" />
              <Text style={s.featureRowText}>{feature}</Text>
            </View>
          ))}
          {plan.features.length > 4 && (
            <Text style={s.moreFeatures}>
              +{plan.features.length - 4} more features
            </Text>
          )}
        </View>

        {/* CTA Button */}
        <Pressable
          disabled={isPending || (!price && !isFree)}
          onPress={onSelect}
          style={[
            s.planCta,
            isCurrent && s.planCtaCurrent,
            isFree && s.planCtaFree,
            (!price && !isFree) && s.planCtaDisabled,
          ]}>
          <Text
            style={[
              s.planCtaText,
              isCurrent && s.planCtaTextCurrent,
              isFree && s.planCtaTextFree,
            ]}>
            {isPending
              ? 'Processing...'
              : isFree
                ? 'Current Plan'
                : isCurrent
                  ? 'Manage Plan'
                  : `Upgrade to ${tier}`}
          </Text>
          {!isCurrent && !isFree && (
            <Icon name="arrow-right" size={16} color="#FFFFFF" />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },

  // Header
  header: {
    paddingTop: 56,
    paddingBottom: 24,
    paddingHorizontal: 20,
    backgroundColor: '#1E293B',
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    position: 'relative',
    overflow: 'hidden',
  },
  headerGlow: {
    position: 'absolute',
    top: -60,
    right: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#6366F1',
    opacity: 0.15,
    blurRadius: 60,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
    fontWeight: '500',
  },

  // Current Plan Card
  currentPlanCard: {
    marginHorizontal: 16,
    marginTop: -20,
    backgroundColor: '#1E293B',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 10,
  },
  currentPlanGlow: {
    position: 'absolute',
    top: -40,
    left: -40,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#6366F1',
    opacity: 0.08,
  },
  currentPlanHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  currentBadgeRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#10B98115',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#10B98130',
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  activeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#10B981',
    letterSpacing: 0.5,
  },
  autoRenewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#10B98110',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  autoRenewText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#10B981',
  },
  autoRenewToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  autoRenewLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
  },
  toggleTrack: {
    width: 36,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#334155',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleTrackActive: {
    backgroundColor: '#10B98130',
  },
  toggleThumb: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#64748B',
  },
  toggleThumbActive: {
    backgroundColor: '#10B981',
    alignSelf: 'flex-end',
  },
  planIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 18,
  },
  planIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planNameBlock: {
    flex: 1,
  },
  currentPlanName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  currentPlanTier: {
    fontSize: 12,
    color: '#818CF8',
    fontWeight: '600',
    marginTop: 2,
  },
  metricsGrid: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 4,
  },
  metricBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    gap: 4,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 4,
  },
  metricLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '500',
  },
  metricDivider: {
    width: 1,
    backgroundColor: '#1E293B',
    marginVertical: 8,
  },
  verificationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    backgroundColor: '#F59E0B10',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  verificationText: {
    fontSize: 11,
    color: '#F59E0B',
    fontWeight: '600',
  },

  // Cycle Selector
  cycleContainer: {
    marginHorizontal: 16,
    marginTop: 24,
  },
  cycleLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  cycleRow: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 4,
    gap: 4,
  },
  cycleChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 13,
    backgroundColor: 'transparent',
  },
  cycleChipActive: {
    backgroundColor: '#6366F1',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  cycleChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'capitalize',
  },
  cycleChipTextActive: {
    color: '#FFFFFF',
  },
  cycleSavings: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  cycleSavingsActive: {
    color: '#C7D2FE',
  },

  // Section Title
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 28,
    marginBottom: 4,
    paddingHorizontal: 16,
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 16,
    paddingHorizontal: 16,
    fontWeight: '500',
  },

  // Plan Card
  planCard: {
    marginHorizontal: 16,
    marginBottom: 14,
    backgroundColor: '#1E293B',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
    position: 'relative',
  },
  planCardCurrent: {
    borderColor: '#6366F1',
    borderWidth: 2,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  planCardPopular: {
    borderColor: '#F59E0B',
    borderWidth: 1.5,
  },
  popularBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#F59E0B',
    paddingVertical: 6,
  },
  popularBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  currentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#6366F1',
    paddingVertical: 6,
  },
  currentBannerText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  planCardContent: {
    padding: 18,
  },
  planCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  planCardTier: {
    fontSize: 11,
    fontWeight: '700',
    color: '#818CF8',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  planCardName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
    letterSpacing: -0.3,
  },
  priceBlock: {
    alignItems: 'flex-end',
  },
  priceAmount: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  pricePeriod: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  aiModelStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 12,
  },
  aiModelStripText: {
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  aiUpgradeText: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '500',
  },
  planCardDesc: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 18,
    marginBottom: 14,
  },
  featuresPreview: {
    gap: 8,
    marginBottom: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureRowText: {
    fontSize: 12,
    color: '#CBD5E1',
    fontWeight: '500',
  },
  moreFeatures: {
    fontSize: 11,
    color: '#6366F1',
    fontWeight: '600',
    marginTop: 2,
  },
  planCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#6366F1',
    paddingVertical: 14,
    borderRadius: 14,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  planCtaCurrent: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#6366F1',
    shadowOpacity: 0,
    elevation: 0,
  },
  planCtaFree: {
    backgroundColor: '#334155',
    shadowOpacity: 0,
    elevation: 0,
  },
  planCtaDisabled: {
    backgroundColor: '#334155',
    opacity: 0.5,
    shadowOpacity: 0,
    elevation: 0,
  },
  planCtaText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  planCtaTextCurrent: {
    color: '#818CF8',
  },
  planCtaTextFree: {
    color: '#94A3B8',
  },

  // Billing Link
  billingLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 20,
    backgroundColor: '#1E293B',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  billingLinkLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  billingLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#CBD5E1',
  },
  bottomSpacer: {
    height: 40,
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: '#00000099',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '88%',
    paddingBottom: 30,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#475569',
    marginTop: 12,
    marginBottom: 8,
  },
  modalHero: {
    alignItems: 'center',
    paddingVertical: 24,
    position: 'relative',
    overflow: 'hidden',
  },
  modalHeroGlow: {
    position: 'absolute',
    top: -40,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#6366F1',
    opacity: 0.1,
  },
  modalIconBox: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#F59E0B15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F59E0B30',
  },
  modalPlanName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  modalTier: {
    fontSize: 13,
    color: '#818CF8',
    fontWeight: '600',
    marginTop: 4,
  },
  modalPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 8,
    gap: 2,
  },
  modalPrice: {
    fontSize: 36,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -1,
  },
  modalPeriod: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  modalSection: {
    paddingHorizontal: 24,
    marginTop: 20,
  },
  modalSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modalFeature: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  modalFeatureText: {
    fontSize: 13,
    color: '#CBD5E1',
    fontWeight: '500',
    flex: 1,
    lineHeight: 18,
  },
  aiModelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#6366F115',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#6366F130',
  },
  aiModelText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#818CF8',
  },
  modalPayment: {
    paddingHorizontal: 24,
    marginTop: 20,
  },
  modalPaymentTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  paymentMethods: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  paymentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#0F172A',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  paymentPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#CBD5E1',
  },
  gatewayNote: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 10,
    textAlign: 'center',
  },
  modalButton: {
    marginHorizontal: 24,
    marginTop: 20,
    backgroundColor: '#6366F1',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  modalButtonDisabled: {
    backgroundColor: '#334155',
    shadowOpacity: 0,
    elevation: 0,
  },
  modalButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
});