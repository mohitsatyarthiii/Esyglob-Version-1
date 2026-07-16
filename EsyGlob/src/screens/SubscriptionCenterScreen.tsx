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

// ─── Helpers ──────────────────────────────────────────────
const AI_TIER_MAP: Record<string, { name: string; icon: string; color: string; bg: string }> = {
  esyai_lite: { name: 'EsyAI Lite', icon: 'cpu-32-bit', color: '#64748B', bg: '#F1F5F9' },
  esyai_pro: { name: 'EsyAI Pro', icon: 'cpu-64-bit', color: '#2563EB', bg: '#EFF6FF' },
  esyai_advanced: { name: 'EsyAI Advanced', icon: 'memory', color: '#7C3AED', bg: '#F5F3FF' },
  esyai_enterprise: { name: 'EsyAI Enterprise', icon: 'server', color: '#DB2777', bg: '#FDF2F8' },
};

// Fallback based on plan key if aiTier/aiProvider missing
function getAiTierFromPlanKey(key: string): string {
  if (key.includes('free')) return 'esyai_lite';
  if (key.includes('pro') || key.includes('verified')) return 'esyai_pro';
  if (key.includes('business') || key.includes('gold')) return 'esyai_advanced';
  if (key.includes('enterprise')) return 'esyai_enterprise';
  return 'esyai_lite';
}

function getAiTierInfo(plan: SubscriptionPlan | null) {
  if (!plan) return AI_TIER_MAP.esyai_lite;
  // Priority: aiTier > aiProvider mapping > plan key fallback
  const tier = plan.aiTier ||
    (plan as any).aiProvider || // backward compat
    getAiTierFromPlanKey(plan.key);
  
  // If aiProvider is old string like "deepseek", "openai", "claude", "ollama"
  const oldMapping: Record<string, string> = {
    ollama: 'esyai_lite',
    deepseek: 'esyai_pro',
    openai: 'esyai_advanced',
    chatgpt: 'esyai_advanced',
    claude: 'esyai_enterprise',
  };
  const mapped = oldMapping[(tier || '').toLowerCase()] || tier;
  return AI_TIER_MAP[mapped] || AI_TIER_MAP.esyai_lite;
}

function getAiModelName(plan: SubscriptionPlan | null): string {
  if (!plan) return 'EsyAI Lite';
  if (plan.aiModel) return plan.aiModel;
  // Derive from aiTier
  const aiTier = plan.aiTier || getAiTierFromPlanKey(plan.key);
  const names: Record<string, string> = {
    esyai_lite: 'EsyAI Lite',
    esyai_pro: 'EsyAI Pro',
    esyai_advanced: 'EsyAI Advanced',
    esyai_enterprise: 'EsyAI Enterprise',
  };
  return names[aiTier] || 'EsyAI Lite';
}

const FEATURE_SECTIONS = [
  { title: 'AI Features', icon: 'robot-outline', words: ['ai ', 'esyai', 'suggestion', 'forecast', 'predict'] },
  { title: 'Marketplace', icon: 'storefront-outline', words: ['marketplace', 'search', 'product', 'seller', 'listing', 'wishlist', 'browse', 'filter', 'catalog'] },
  { title: 'RFQ & Quotations', icon: 'file-document-edit-outline', words: ['rfq', 'quotation', 'negotiation'] },
  { title: 'Trade Intelligence', icon: 'shield-check-outline', words: ['trade', 'escrow', 'shipment', 'customs', 'export', 'import', 'compliance', 'tariff', 'hs code'] },
  { title: 'Analytics & Insights', icon: 'chart-box-outline', words: ['analytic', 'insight', 'report', 'trend', 'dashboard', 'forecast'] },
  { title: 'Verification & Trust', icon: 'badge-account-outline', words: ['verification', 'verified', 'kyc', 'badge', 'trust', 'gst', 'pan', 'aadhaar', 'license', 'score'] },
  { title: 'Business & Support', icon: 'briefcase-outline', words: ['support', 'team', 'api', 'erp', 'workspace', 'manager', 'integration', 'sla', 'account manager'] },
];

function groupFeatures(features: string[]): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  features.forEach(feature => {
    const normalized = feature.toLowerCase();
    const section = FEATURE_SECTIONS.find(item =>
      item.words.some(word => normalized.includes(word))
    )?.title || 'More Features';
    (grouped[section] ||= []).push(feature);
  });
  return grouped;
}

const COMPARISON_ROWS = [
  ['AI Engine', ['ai ', 'esyai', 'model']],
  ['Marketplace', ['marketplace', 'search', 'browse', 'filter']],
  ['RFQs', ['rfq']],
  ['Quotations', ['quotation']],
  ['Messaging', ['messag', 'smart repl']],
  ['Market Insights', ['insight', 'market intelligence', 'trend']],
  ['Trade Assurance', ['trade assurance']],
  ['Escrow', ['escrow']],
  ['Analytics', ['analytic', 'dashboard']],
  ['Support Level', ['support', 'manager', 'dedicated']],
  ['Verification', ['verification', 'verified', 'kyc']],
  ['Business Tools', ['business', 'calculator', 'team', 'workspace']],
  ['API Access', ['api access', 'integration']],
] as const;

// ─── Main Component ───────────────────────────────────────
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
      setUpgradingPlanKey(null);
      await qc.invalidateQueries({ queryKey: ['subscription'] });
      await qc.invalidateQueries({ queryKey: ['invoices'] });
      Alert.alert('🎉 Subscription Activated', 'Your plan is now active. Enjoy premium features!');
    },
    onError: (e: Error) => {
      setUpgradingPlanKey(null);
      Alert.alert('Payment Failed', e.message);
    },
  });

  const renew = useMutation({
    mutationFn: (value: boolean) => setSubscriptionAutoRenew(value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscription'] }),
  });

  if (overview.isLoading || plansQuery.isLoading)
    return <LoadingState label="Loading subscription center..." />;
  if (overview.isError || plansQuery.isError)
    return (
      <ErrorState
        message="Could not load subscription details."
        onRetry={() => {
          overview.refetch();
          plansQuery.refetch();
        }}
      />
    );

  const data = overview.data!;
  const sub = data.subscription;
  const current = data.plan;
  const remaining = Number(data.usage?.aiCreditsRemaining ?? 0);
  const plans = plansQuery.data!;

  const sortedPlans = [...plans].sort((a, b) => a.priorityRanking - b.priorityRanking);
  const currentAiInfo = getAiTierInfo(current);

  const handleUpgrade = (plan: SubscriptionPlan) => {
    setUpgradingPlanKey(plan.key);
    buy.mutate(plan);
  };

  return (
    <View style={s.screen}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => nav.goBack()} style={s.headerBtn}>
          <Icon name="arrow-left" size={22} color="#1E293B" />
        </Pressable>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>
            {role === 'seller' ? 'Seller Plans' : 'Buyer Plans'}
          </Text>
          <Text style={s.headerSub}>Choose your growth plan</Text>
        </View>
        <Pressable onPress={() => nav.navigate('InvoiceDetails', {})} style={s.headerBtn}>
          <Icon name="receipt-text-outline" size={22} color="#1E293B" />
        </Pressable>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Current Plan Card */}
        <View style={s.currentCard}>
          <View style={s.currentCardTop}>
            <View style={s.currentBadgeRow}>
              <View style={s.activeBadge}>
                <View style={s.activeDot} />
                <Text style={s.activeBadgeText}>ACTIVE PLAN</Text>
              </View>
              {sub.autoRenew && (
                <View style={s.autoBadge}>
                  <Icon name="autorenew" size={12} color="#059669" />
                  <Text style={s.autoBadgeText}>Auto-renew</Text>
                </View>
              )}
            </View>
            <Pressable
              onPress={() => renew.mutate(!sub.autoRenew)}
              style={s.toggleRow}>
              <Text style={s.toggleLabel}>{sub.autoRenew ? 'ON' : 'OFF'}</Text>
              <View style={[s.toggleTrack, sub.autoRenew && s.toggleTrackOn]}>
                <View style={[s.toggleThumb, sub.autoRenew && s.toggleThumbOn]} />
              </View>
            </Pressable>
          </View>

          {/* Current Plan Identity */}
          <View style={s.currentIdentity}>
            <View style={[s.currentIconBox, { backgroundColor: currentAiInfo.bg }]}>
              <Icon
                name={role === 'seller' ? 'storefront-outline' : 'briefcase-outline'}
                size={26}
                color={currentAiInfo.color}
              />
            </View>
            <View style={s.currentNameBlock}>
              <Text style={s.currentPlanName}>{current.name || 'Free'}</Text>
              <View style={[s.aiTierBadge, { backgroundColor: currentAiInfo.bg }]}>
                <Icon name={currentAiInfo.icon} size={12} color={currentAiInfo.color} />
                <Text style={[s.aiTierText, { color: currentAiInfo.color }]}>
                  {getAiModelName(current)}
                </Text>
              </View>
            </View>
            <Icon name="shield-check" size={24} color="#059669" />
          </View>

          {/* Metrics */}
          <View style={s.metricsGrid}>
            <View style={s.metricItem}>
              <Icon name="brain" size={16} color="#7C3AED" />
              <Text style={s.metricValue}>
                {remaining}/{sub.aiCreditsAllocated || current.aiCredits || 0}
              </Text>
              <Text style={s.metricLabel}>AI Credits</Text>
            </View>
            <View style={s.metricDivider} />
            <View style={s.metricItem}>
              <Icon name="database-outline" size={16} color="#2563EB" />
              <Text style={s.metricValue}>{current.storageLimitMb || 100} MB</Text>
              <Text style={s.metricLabel}>Storage</Text>
            </View>
            <View style={s.metricDivider} />
            <View style={s.metricItem}>
              <Icon name="calendar-outline" size={16} color="#F59E0B" />
              <Text style={s.metricValue}>
                {sub.expiryDate
                  ? new Date(sub.expiryDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                  : 'Free'}
              </Text>
              <Text style={s.metricLabel}>Expires</Text>
            </View>
          </View>

          {/* Dashboard Details Row */}
          <View style={s.dashboardDetails}>
            <DashboardDetail 
              icon="calendar-sync" 
              label="Billing" 
              value={String(sub.billingCycle || sub.duration || cycle)} 
            />
            <DashboardDetail 
              icon="robot-outline" 
              label="AI Model" 
              value={getAiModelName(current)} 
            />
            <DashboardDetail 
              icon="trending-up" 
              label="Growth Score" 
              value={`${current.businessGrowthScore || getDefaultGrowthScore(current.key)}/100`} 
            />
          </View>

          {role === 'seller' && (
            <View style={s.trustRow}>
              <Icon name="star" size={14} color="#F59E0B" />
              <Text style={s.trustText}>
                {current.verificationLevel || 'Basic'} Verification · Trust Score +{current.trustScoreBoost || 0}
              </Text>
            </View>
          )}
          
          <View style={s.manageRow}>
            <Pressable onPress={() => setSelectedPlan(current)} style={s.manageButton}>
              <Icon name="cog-outline" size={16} color="#2563EB" />
              <Text style={s.manageButtonText}>Manage Plan</Text>
            </Pressable>
            <Pressable onPress={() => nav.navigate('InvoiceDetails', {})} style={s.manageButton}>
              <Icon name="download-outline" size={16} color="#2563EB" />
              <Text style={s.manageButtonText}>Invoices</Text>
            </Pressable>
          </View>
        </View>

        {/* Billing Cycle */}
        <View style={s.cycleSection}>
          <Text style={s.cycleSectionTitle}>Billing Cycle</Text>
          <View style={s.cycleRow}>
            {(['monthly', 'quarterly', 'yearly'] as BillingCycle[]).map((item) => {
              const isActive = cycle === item;
              const savings = item === 'yearly' ? '25%' : item === 'quarterly' ? '12%' : null;
              return (
                <Pressable
                  key={item}
                  onPress={() => setCycle(item)}
                  style={[s.cycleBtn, isActive && s.cycleBtnActive]}>
                  <Text style={[s.cycleBtnText, isActive && s.cycleBtnTextActive]}>
                    {item}
                  </Text>
                  {savings && (
                    <Text style={[s.cycleSave, isActive && s.cycleSaveActive]}>
                      Save {savings}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Plans List */}
        <Text style={s.sectionTitle}>Available Plans</Text>
        <Text style={s.sectionSub}>Every plan includes EsyAI Business Copilot</Text>

        {sortedPlans.map((plan, index) => {
          const isCurrent = current.key === plan.key;
          const isPopular = Boolean((plan as any).popular);
          const isLoadingThis = upgradingPlanKey === plan.key && buy.isPending;
          const aiInfo = getAiTierInfo(plan);
          const prevPlan = index > 0 ? sortedPlans[index - 1] : null;

          return (
            <PlanCard
              key={plan.key}
              plan={plan}
              cycle={cycle}
              isCurrent={isCurrent}
              isPopular={isPopular}
              isLoading={isLoadingThis}
              onUpgrade={() => setSelectedPlan(plan)}
              onViewDetails={() => setSelectedPlan(plan)}
              aiInfo={aiInfo}
              prevPlanName={prevPlan?.name}
            />
          );
        })}

        <PlanComparison plans={sortedPlans} />

        {/* Billing History */}
        <Pressable
          onPress={() => nav.navigate('InvoiceDetails', {})}
          style={s.billingLink}>
          <View style={s.billingLinkLeft}>
            <View style={s.billingIconBox}>
              <Icon name="file-document-outline" size={18} color="#2563EB" />
            </View>
            <Text style={s.billingText}>Billing History & Invoices</Text>
          </View>
          <Icon name="chevron-right" size={20} color="#94A3B8" />
        </Pressable>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Detail Modal */}
      <Modal
        transparent
        animationType="slide"
        visible={Boolean(selectedPlan)}
        onRequestClose={() => setSelectedPlan(null)}>
        <Pressable style={s.modalOverlay} onPress={() => setSelectedPlan(null)}>
          <Pressable style={s.modalSheet} onPress={() => undefined}>
            <View style={s.modalHandle} />
            {selectedPlan && (
              <>
                <ScrollView showsVerticalScrollIndicator={false} style={s.modalScroll}>
                  {/* Hero */}
                  <View style={s.modalHero}>
                    <View style={s.modalIconCircle}>
                      <Icon name="crown" size={30} color="#F59E0B" />
                    </View>
                    <Text style={s.modalPlanName}>{selectedPlan.name}</Text>
                    <View style={[s.modalAiBadge, { backgroundColor: getAiTierInfo(selectedPlan).bg }]}>
                      <Icon name={getAiTierInfo(selectedPlan).icon} size={14} color={getAiTierInfo(selectedPlan).color} />
                      <Text style={[s.modalAiText, { color: getAiTierInfo(selectedPlan).color }]}>
                        {getAiModelName(selectedPlan)}
                      </Text>
                    </View>
                    <View style={s.modalPriceRow}>
                      <Text style={s.modalPrice}>
                        ₹{Number(selectedPlan.prices[cycle] || 0).toLocaleString('en-IN')}
                      </Text>
                      <Text style={s.modalPeriod}>/{cycle}</Text>
                    </View>
                    {cycle !== 'monthly' && (selectedPlan.prices.monthly || 0) > 0 ? (
                      <Text style={s.savingsText}>
                        You save ₹{Math.max(0, (selectedPlan.prices.monthly || 0) * (cycle === 'quarterly' ? 3 : 12) - Number(selectedPlan.prices[cycle] || 0)).toLocaleString('en-IN')} with this billing cycle
                      </Text>
                    ) : null}
                    <Text style={s.modalModel}>
                      {getAiModelName(selectedPlan)} · Growth Score {selectedPlan.businessGrowthScore || getDefaultGrowthScore(selectedPlan.key)}/100
                    </Text>
                  </View>

                  {/* Grouped Features */}
                  <View style={s.modalSection}>
                    <Text style={s.modalSectionTitle}>Plan Capabilities</Text>
                    {Object.entries(groupFeatures(selectedPlan.features || [])).map(([section, features]) => (
                      <FeatureSection
                        key={section}
                        title={section}
                        features={features}
                      />
                    ))}
                  </View>

                  <View style={s.modalSection}>
                    <Text style={s.modalSectionTitle}>Usage Limits</Text>
                    <View style={s.limitGrid}>
                      {Object.entries(selectedPlan.limits || {}).map(([label, value]) => (
                        <View key={label} style={s.limitItem}><Icon name={limitIcon(label)} size={17} color="#2563EB" /><Text style={s.limitLabel}>{label.replace(/([A-Z])/g, ' $1')}</Text><Text style={s.limitValue}>{Number(value) < 0 ? 'Unlimited' : String(value)}</Text></View>
                      ))}
                    </View>
                  </View>

                  {/* Quick Stats */}
                  <View style={s.modalStats}>
                    <View style={s.modalStat}>
                      <Icon name="brain" size={16} color="#7C3AED" />
                      <Text style={s.modalStatValue}>{selectedPlan.aiCredits || 0}</Text>
                      <Text style={s.modalStatLabel}>AI Credits</Text>
                    </View>
                    <View style={s.modalStat}>
                      <Icon name="database" size={16} color="#2563EB" />
                      <Text style={s.modalStatValue}>{selectedPlan.storageLimitMb || 0} MB</Text>
                      <Text style={s.modalStatLabel}>Storage</Text>
                    </View>
                    <View style={s.modalStat}>
                      <Icon name="headset" size={16} color="#059669" />
                      <Text style={s.modalStatValue}>{selectedPlan.supportLevel || 'Standard'}</Text>
                      <Text style={s.modalStatLabel}>Support</Text>
                    </View>
                  </View>

                  {/* Payment */}
                  <View style={s.modalSection}>
                    <Text style={s.modalSectionTitle}>🔒 Secure Payment</Text>
                    <View style={s.securityRow}>
                      <View style={s.securityBadge}><Icon name="shield-lock" size={14} color="#047857" /><Text style={s.securityText}>SSL Protected</Text></View>
                      <View style={s.securityBadge}><Icon name="flash" size={14} color="#047857" /><Text style={s.securityText}>Instant Activation</Text></View>
                    </View>
                    <View style={s.paymentPills}>
                      {[
                        { icon: 'qrcode', label: 'UPI' },
                        { icon: 'credit-card', label: 'Visa' },
                        { icon: 'credit-card', label: 'Mastercard' },
                        { icon: 'credit-card-chip', label: 'RuPay' },
                        { icon: 'bank', label: 'Net Banking' },
                        { icon: 'wallet', label: 'Wallet' },
                        { icon: 'shield-lock-outline', label: 'Razorpay' },
                      ].map((p) => (
                        <View key={p.label} style={s.paymentPill}>
                          <Icon name={p.icon} size={14} color="#2563EB" />
                          <Text style={s.paymentPillText}>{p.label}</Text>
                        </View>
                      ))}
                    </View>
                    <Text style={s.razorpayText}>Powered by Razorpay · Instant Activation</Text>
                  </View>
                </ScrollView>

                {/* CTA */}
                <Pressable
                  disabled={!selectedPlan.prices[cycle]}
                  onPress={() => {
                    const plan = selectedPlan;
                    setSelectedPlan(null);
                    handleUpgrade(plan);
                  }}
                  style={[
                    s.modalCta,
                    !selectedPlan.prices[cycle] && s.modalCtaDisabled,
                  ]}>
                  {upgradingPlanKey === selectedPlan.key && buy.isPending ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={s.modalCtaText}>
                      {current.key === selectedPlan.key
                        ? 'Renew Plan'
                        : selectedPlan.prices[cycle]
                          ? 'Upgrade Now'
                          : 'Free Plan'}
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
}

// ─── Helper Components ────────────────────────────────────
function DashboardDetail({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={s.dashboardDetail}>
      <Icon name={icon} size={15} color="#2563EB" />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.dashboardLabel}>{label}</Text>
        <Text numberOfLines={1} style={s.dashboardValue}>{value}</Text>
      </View>
    </View>
  );
}

function FeatureSection({ title, features }: { title: string; features: string[] }) {
  const sectionMeta = FEATURE_SECTIONS.find(item => item.title === title);
  const icon = sectionMeta?.icon || 'diamond-stone';
  return (
    <View style={s.featureSection}>
      <View style={s.featureSectionHeader}>
        <View style={s.featureSectionIcon}>
          <Icon name={icon} size={19} color="#2563EB" />
        </View>
        <View style={s.featureSectionHeading}>
          <Text style={s.featureSectionTitle}>{title}</Text>
          <Text style={s.featureSectionCount}>{features.length} capabilities</Text>
        </View>
      </View>
      <View style={s.featureCards}>
          {features.map(feature => (
            <View key={feature} style={s.featureCard}>
              <Icon name={featureIcon(feature)} size={18} color="#16A34A" />
              <View style={s.featureCardBody}>
                <Text style={s.featureCardTitle}>{feature}</Text>
                <Text style={s.featureCardDescription}>{featureDescription(feature)}</Text>
              </View>
              <Text style={s.includedBadge}>{featureStatus(feature)}</Text>
            </View>
          ))}
      </View>
    </View>
  );
}

function featureIcon(feature: string) { const text = feature.toLowerCase(); if (text.includes('ai')) return 'robot-outline'; if (text.includes('search')) return 'magnify'; if (text.includes('analytic') || text.includes('report')) return 'chart-box-outline'; if (text.includes('verif') || text.includes('badge')) return 'shield-check-outline'; if (text.includes('support') || text.includes('manager')) return 'headset'; if (text.includes('trade') || text.includes('rfq')) return 'handshake-outline'; return 'check-decagram'; }
function featureStatus(feature: string) { const text = feature.toLowerCase(); if (text.includes('unlimited')) return 'UNLIMITED'; if (text.includes('dedicated')) return 'DEDICATED'; if (text.includes('priority')) return 'PRIORITY'; if (text.includes('enterprise')) return 'ENTERPRISE'; if (text.includes('verified') || text.includes('verification')) return 'VERIFIED'; if (text.includes('ai')) return 'AI POWERED'; return 'INCLUDED'; }
function featureDescription(feature: string) { const text = feature.toLowerCase(); if (text.includes('ai')) return 'AI-powered capability designed to improve speed and decision quality.'; if (text.includes('analytic') || text.includes('insight')) return 'Actionable business intelligence included with this plan.'; if (text.includes('verif') || text.includes('badge')) return 'Builds marketplace trust and strengthens your business profile.'; if (text.includes('support')) return 'Professional assistance at this plan’s service level.'; return 'Available as an active benefit with this subscription.'; }
function limitIcon(label: string) { const text = label.toLowerCase(); if (text.includes('ai')) return 'robot-outline'; if (text.includes('message')) return 'message-outline'; if (text.includes('document')) return 'file-document-outline'; if (text.includes('image')) return 'image-outline'; if (text.includes('team')) return 'account-group-outline'; if (text.includes('rfq') || text.includes('quotation')) return 'file-sign'; return 'gauge'; }

function PlanComparison({ plans }: { plans: SubscriptionPlan[] }) {
  const has = (plan: SubscriptionPlan, words: readonly string[]) =>
    (plan.features || []).some(feature =>
      words.some(word => feature.toLowerCase().includes(word))
    );

  return (
    <View style={s.comparisonCard}>
      <Text style={s.comparisonTitle}>Compare Plans</Text>
      <Text style={s.comparisonSubtitle}>See how every tier expands your business capabilities.</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={s.compareRow}>
            <Text style={[s.compareCell, s.compareLabel]}>Capability</Text>
            {plans.map(plan => (
              <Text key={plan.key} numberOfLines={1} style={[s.compareCell, s.comparePlan]}>
                {plan.name}
              </Text>
            ))}
          </View>
          {COMPARISON_ROWS.map(([label, words]) => (
            <View key={label} style={s.compareRow}>
              <Text style={[s.compareCell, s.compareLabel]}>{label}</Text>
              {plans.map(plan => (
                <View key={plan.key} style={s.compareIconCell}>
                  <Icon
                    name={has(plan, words) ? 'check-circle' : 'minus-circle-outline'}
                    size={18}
                    color={has(plan, words) ? '#16A34A' : '#CBD5E1'}
                  />
                </View>
              ))}
            </View>
          ))}
          <View style={s.compareRow}>
            <Text style={[s.compareCell, s.compareLabel]}>AI Model</Text>
            {plans.map(plan => (
              <Text key={plan.key} numberOfLines={2} style={[s.compareCell, s.compareValue]}>
                {getAiModelName(plan)}
              </Text>
            ))}
          </View>
          <View style={s.compareRow}>
            <Text style={[s.compareCell, s.compareLabel]}>Storage</Text>
            {plans.map(plan => (
              <Text key={plan.key} style={[s.compareCell, s.compareValue]}>
                {plan.storageLimitMb || 0} MB
              </Text>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function PlanMetric({ icon, label, value }: { icon: string; label: string; value: string }) {
  return <View style={s.planMetric}><Icon name={icon} size={15} color="#2563EB" /><View style={s.planMetricBody}><Text style={s.planMetricLabel}>{label}</Text><Text numberOfLines={1} style={s.planMetricValue}>{value}</Text></View></View>;
}

function PlanCard({
  plan,
  cycle,
  isCurrent,
  isPopular,
  isLoading,
  onUpgrade,
  onViewDetails,
  aiInfo,
  prevPlanName,
}: {
  plan: SubscriptionPlan;
  cycle: BillingCycle;
  isCurrent: boolean;
  isPopular: boolean;
  isLoading: boolean;
  onUpgrade: () => void;
  onViewDetails: () => void;
  aiInfo: { name: string; icon: string; color: string; bg: string };
  prevPlanName?: string;
}) {
  const price = plan.prices[cycle];
  const isFree = plan.key.includes('free');

  return (
    <Pressable onPress={onViewDetails} style={[s.planCard, plan.priorityRanking >= 2 && s.planCardPremium, plan.priorityRanking >= 3 && s.planCardEnterprise, isCurrent && s.planCardCurrent]}>
      {isPopular && !isCurrent && (
        <View style={s.popularStrip}>
          <Icon name="star" size={12} color="#FFFFFF" />
          <Text style={s.popularStripText}>MOST POPULAR</Text>
        </View>
      )}
      {isCurrent && (
        <View style={s.currentStrip}>
          <Icon name="check-circle" size={12} color="#FFFFFF" />
          <Text style={s.currentStripText}>YOUR PLAN</Text>
        </View>
      )}

      <View style={s.planCardBody}>
        {/* Badges */}
        <View style={s.planBadges}>
          {plan.premiumBadge ? (
            <Text style={s.premiumBadge}>{plan.premiumBadge}</Text>
          ) : null}
          {plan.recommended ? (
            <Text style={s.recommendedBadge}>RECOMMENDED</Text>
          ) : null}
        </View>

        {/* Header */}
        <View style={s.planCardHeader}>
          <View style={s.planCardLeft}>
            <View style={[s.planIconMini, { backgroundColor: aiInfo.bg }]}>
              <Icon name={aiInfo.icon} size={20} color={aiInfo.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.planCardName}>{plan.name}</Text>
              {prevPlanName && (
                <Text style={s.planUpgradeHint}>Everything in {prevPlanName} +</Text>
              )}
            </View>
          </View>
          {!isFree && (
            <View style={s.planPriceBlock}>
              <Text style={s.planPrice}>₹{Number(price || 0).toLocaleString('en-IN')}</Text>
              <Text style={s.planPricePeriod}>/{cycle}</Text>
            </View>
          )}
        </View>

        {/* AI Tier */}
        <View style={[s.aiStrip, { backgroundColor: aiInfo.bg }]}>
          <Icon name={aiInfo.icon} size={14} color={aiInfo.color} />
          <Text style={[s.aiStripText, { color: aiInfo.color }]}>{aiInfo.name}</Text>
          <Text style={[s.aiModelName, { color: aiInfo.color }]}>
            {getAiModelName(plan)}
          </Text>
        </View>

        {/* Growth Score */}
        <View style={s.growthRow}>
          <Icon name="trending-up" size={15} color="#2563EB" />
          <Text style={s.growthLabel}>Business Growth Score</Text>
          <Text style={s.growthValue}>
            {plan.businessGrowthScore || getDefaultGrowthScore(plan.key)}/100
          </Text>
        </View>

        {/* Description */}
        <Text style={s.planDesc}>{plan.description || ''}</Text>

        <View style={s.planMetrics}>
          <PlanMetric icon="brain" label="AI credits" value={String(plan.aiCredits || 0)} />
          <PlanMetric icon="database-outline" label="Storage" value={`${plan.storageLimitMb || 0} MB`} />
          <PlanMetric icon="headset" label="Support" value={plan.supportLevel || 'Standard'} />
          <PlanMetric icon="shield-check-outline" label="Verification" value={plan.verificationLevel || 'Basic'} />
          <PlanMetric icon="format-list-checks" label="Features" value={String((plan.features || []).length)} />
          <PlanMetric icon="priority-high" label="Priority" value={String(plan.priorityRanking ?? 0)} />
        </View>

        {/* Features Preview */}
        <View style={s.featuresList}>
          {(plan.features || []).slice(0, Math.min(10, 6 + Number(plan.priorityRanking || 0))).map((feature, i) => (
            <View key={i} style={s.featureItem}>
              <Icon name="star-four-points" size={6} color="#F59E0B" />
              <Text style={s.featureItemText} numberOfLines={1}>{feature}</Text>
            </View>
          ))}
          {(plan.features || []).length > Math.min(10, 6 + Number(plan.priorityRanking || 0)) && (
            <Pressable onPress={onViewDetails}>
              <Text style={s.viewMoreText}>View all {(plan.features || []).length} features</Text>
            </Pressable>
          )}
        </View>

        {/* Buttons */}
        <View style={s.planActions}>
          <Pressable
            onPress={onUpgrade}
            disabled={isLoading || isCurrent}
            style={[
              s.upgradeBtn,
              isCurrent && s.upgradeBtnDisabled,
              isFree && s.upgradeBtnFree,
            ]}>
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={[s.upgradeBtnText, isCurrent && s.upgradeBtnTextDisabled]}>
                {isFree ? 'Free' : isCurrent ? 'Active' : 'Upgrade'}
              </Text>
            )}
          </Pressable>
          <Pressable onPress={onViewDetails} style={s.detailsBtn}>
            <Text style={s.detailsBtnText}>Details</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

// ─── Fallback Helpers ─────────────────────────────────────
function getDefaultGrowthScore(key: string): number {
  if (key.includes('free')) return 15;
  if (key.includes('pro') || key.includes('verified')) return 45;
  if (key.includes('business') || key.includes('gold')) return 75;
  if (key.includes('enterprise')) return 100;
  return 15;
}

// ─── Styles ───────────────────────────────────────────────
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    paddingTop: 50, paddingBottom: 16, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  headerBtn: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: '#F8FAFC',
    alignItems: 'center', justifyContent: 'center',
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3 },
  headerSub: { fontSize: 11, color: '#64748B', fontWeight: '500', marginTop: 2 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },

  // Current Plan
  currentCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: '#E2E8F0',
    shadowColor: '#2563EB', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 12, elevation: 3, marginBottom: 20,
  },
  currentCardTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
  },
  currentBadgeRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  activeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#ECFDF5', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#059669' },
  activeBadgeText: { fontSize: 10, fontWeight: '700', color: '#059669', letterSpacing: 0.5 },
  autoBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#F0FDF4', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12,
  },
  autoBadgeText: { fontSize: 10, fontWeight: '600', color: '#059669' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  toggleLabel: { fontSize: 10, fontWeight: '700', color: '#94A3B8' },
  toggleTrack: {
    width: 36, height: 20, borderRadius: 10, backgroundColor: '#E2E8F0',
    justifyContent: 'center', paddingHorizontal: 2,
  },
  toggleTrackOn: { backgroundColor: '#05966920' },
  toggleThumb: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#94A3B8' },
  toggleThumbOn: { backgroundColor: '#059669', alignSelf: 'flex-end' },
  currentIdentity: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  currentIconBox: {
    width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
  },
  currentNameBlock: { flex: 1 },
  currentPlanName: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  aiTierBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  aiTierText: { fontSize: 11, fontWeight: '600' },
  metricsGrid: { flexDirection: 'row', backgroundColor: '#F8FAFC', borderRadius: 14, padding: 4 },
  metricItem: { flex: 1, alignItems: 'center', paddingVertical: 12, gap: 4 },
  metricValue: { fontSize: 13, fontWeight: '700', color: '#0F172A', marginTop: 2 },
  metricLabel: { fontSize: 10, color: '#94A3B8', fontWeight: '500' },
  metricDivider: { width: 1, backgroundColor: '#E2E8F0', marginVertical: 6 },
  dashboardDetails: { flexDirection: 'row', gap: 7, marginTop: 12 },
  dashboardDetail: {
    alignItems: 'center', backgroundColor: '#EFF6FF', borderRadius: 10,
    flex: 1, flexDirection: 'row', gap: 6, minWidth: 0, padding: 8,
  },
  dashboardLabel: { color: '#64748B', fontSize: 8, fontWeight: '700', textTransform: 'uppercase' },
  dashboardValue: { color: '#0F172A', fontSize: 10, fontWeight: '800', textTransform: 'capitalize' },
  trustRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12,
    backgroundColor: '#FFFBEB', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
  },
  trustText: { fontSize: 11, color: '#B45309', fontWeight: '600' },
  manageRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  manageButton: {
    alignItems: 'center', borderColor: '#BFDBFE', borderRadius: 10, borderWidth: 1,
    flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', paddingVertical: 9,
  },
  manageButtonText: { color: '#1D4ED8', fontSize: 10, fontWeight: '800' },

  // Cycle
  cycleSection: { marginBottom: 24 },
  cycleSectionTitle: {
    fontSize: 12, fontWeight: '700', color: '#64748B', marginBottom: 8,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  cycleRow: {
    flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 14, padding: 4, gap: 4,
  },
  cycleBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12 },
  cycleBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  cycleBtnText: { fontSize: 12, fontWeight: '600', color: '#64748B', textTransform: 'capitalize' },
  cycleBtnTextActive: { color: '#0F172A', fontWeight: '700' },
  cycleSave: { fontSize: 9, fontWeight: '600', color: '#94A3B8', marginTop: 2 },
  cycleSaveActive: { color: '#2563EB' },

  // Section
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A', marginBottom: 4, letterSpacing: -0.3 },
  sectionSub: { fontSize: 12, color: '#64748B', marginBottom: 16, fontWeight: '500' },

  // Plan Card
  planCard: {
    backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1,
    borderColor: '#E2E8F0', marginBottom: 14, overflow: 'hidden',
  },
  planCardPremium: { borderColor: '#93C5FD', shadowColor: '#2563EB', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 3 },
  planCardEnterprise: { borderColor: '#7C3AED', borderWidth: 2, shadowColor: '#7C3AED', shadowOpacity: 0.16, elevation: 5 },
  planCardCurrent: {
    borderColor: '#2563EB', borderWidth: 2,
    shadowColor: '#2563EB', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  popularStrip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#F59E0B', paddingVertical: 7,
  },
  popularStripText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF', letterSpacing: 1 },
  currentStrip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#2563EB', paddingVertical: 7,
  },
  currentStripText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5 },
  planCardBody: { padding: 16 },
  planBadges: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  premiumBadge: {
    backgroundColor: '#EEF2FF', borderRadius: 7, color: '#4338CA', fontSize: 8,
    fontWeight: '900', letterSpacing: 0.4, overflow: 'hidden',
    paddingHorizontal: 8, paddingVertical: 5, textTransform: 'uppercase',
  },
  recommendedBadge: {
    backgroundColor: '#ECFDF5', borderRadius: 7, color: '#047857', fontSize: 8,
    fontWeight: '900', letterSpacing: 0.4, overflow: 'hidden',
    paddingHorizontal: 8, paddingVertical: 5,
  },
  planCardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12,
  },
  planCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  planIconMini: {
    width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
  },
  planCardName: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  planUpgradeHint: { fontSize: 10, color: '#64748B', fontWeight: '500', marginTop: 2 },
  planPriceBlock: { alignItems: 'flex-end' },
  planPrice: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  planPricePeriod: { fontSize: 10, color: '#94A3B8', textTransform: 'capitalize' },
  aiStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginBottom: 10,
  },
  aiStripText: { fontSize: 11, fontWeight: '600' },
  aiModelName: { flex: 1, fontSize: 10, fontWeight: '800', textAlign: 'right' },
  growthRow: {
    alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 9,
    flexDirection: 'row', gap: 6, marginBottom: 11, padding: 9,
  },
  growthLabel: { color: '#475569', flex: 1, fontSize: 10, fontWeight: '700' },
  growthValue: { color: '#1D4ED8', fontSize: 11, fontWeight: '900' },
  planDesc: { fontSize: 12, color: '#64748B', lineHeight: 17, marginBottom: 12 },
  planMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 13 },
  planMetric: { alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 9, flexDirection: 'row', gap: 6, padding: 8, width: '48%' },
  planMetricBody: { flex: 1, minWidth: 0 },
  planMetricLabel: { color: '#94A3B8', fontSize: 8, fontWeight: '700', textTransform: 'uppercase' },
  planMetricValue: { color: '#1E293B', fontSize: 10, fontWeight: '900', marginTop: 1, textTransform: 'capitalize' },
  featuresList: { gap: 5, marginBottom: 14 },
  featureItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  featureItemText: { fontSize: 12, color: '#334155', fontWeight: '500', flex: 1 },
  viewMoreText: { fontSize: 11, color: '#2563EB', fontWeight: '600', marginTop: 4 },
  planActions: { flexDirection: 'row', gap: 10 },
  upgradeBtn: {
    flex: 1, backgroundColor: '#2563EB', paddingVertical: 12, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', minHeight: 44,
  },
  upgradeBtnDisabled: { backgroundColor: '#E2E8F0' },
  upgradeBtnFree: { backgroundColor: '#94A3B8' },
  upgradeBtnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  upgradeBtnTextDisabled: { color: '#94A3B8' },
  detailsBtn: {
    paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12,
    borderWidth: 1.5, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center',
  },
  detailsBtnText: { fontSize: 12, fontWeight: '600', color: '#64748B' },

  // Comparison
  comparisonCard: {
    backgroundColor: '#FFFFFF', borderColor: '#E2E8F0', borderRadius: 18,
    borderWidth: 1, marginBottom: 14, marginTop: 10, padding: 16,
  },
  comparisonTitle: { color: '#0F172A', fontSize: 17, fontWeight: '900' },
  comparisonSubtitle: { color: '#64748B', fontSize: 11, marginBottom: 13, marginTop: 3 },
  compareRow: {
    borderBottomColor: '#F1F5F9', borderBottomWidth: 1, flexDirection: 'row', minHeight: 45,
  },
  compareCell: { paddingHorizontal: 8, paddingVertical: 11, width: 108 },
  compareLabel: { color: '#475569', fontSize: 10, fontWeight: '800', width: 120 },
  comparePlan: { color: '#1D4ED8', fontSize: 10, fontWeight: '900', textAlign: 'center' },
  compareValue: { color: '#334155', fontSize: 9, fontWeight: '700', textAlign: 'center' },
  compareIconCell: { alignItems: 'center', justifyContent: 'center', width: 108 },

  // Billing
  billingLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#FFFFFF', padding: 16, borderRadius: 16,
    borderWidth: 1, borderColor: '#E2E8F0', marginTop: 6,
  },
  billingLinkLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  billingIconBox: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: '#EFF6FF',
    alignItems: 'center', justifyContent: 'center',
  },
  billingText: { fontSize: 13, fontWeight: '600', color: '#0F172A' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: '#00000080', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '85%', paddingBottom: 24,
  },
  modalHandle: {
    alignSelf: 'center', width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#E2E8F0', marginTop: 12, marginBottom: 8,
  },
  modalScroll: { paddingHorizontal: 20 },
  modalHero: { alignItems: 'center', paddingVertical: 20 },
  modalIconCircle: {
    width: 60, height: 60, borderRadius: 20, backgroundColor: '#FFFBEB',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    borderWidth: 1, borderColor: '#FDE68A',
  },
  modalPlanName: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  modalAiBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, marginTop: 8,
  },
  modalAiText: { fontSize: 11, fontWeight: '600' },
  modalPriceRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 10 },
  modalPrice: { fontSize: 32, fontWeight: '800', color: '#0F172A' },
  modalPeriod: { fontSize: 13, color: '#94A3B8', textTransform: 'capitalize' },
  savingsText: {
    backgroundColor: '#ECFDF5', borderRadius: 8, color: '#047857', fontSize: 10,
    fontWeight: '800', marginTop: 8, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 6,
  },
  modalModel: { color: '#475569', fontSize: 10, fontWeight: '700', marginTop: 8 },
  modalSection: { marginTop: 16 },
  modalSectionTitle: { fontSize: 13, fontWeight: '700', color: '#0F172A', marginBottom: 10 },
  featureSection: {
    borderColor: '#E2E8F0', borderRadius: 13, borderWidth: 1,
    marginBottom: 8, overflow: 'hidden',
  },
  featureSectionHeader: { alignItems: 'center', flexDirection: 'row', padding: 11 },
  featureSectionIcon: {
    alignItems: 'center', backgroundColor: '#EFF6FF', borderRadius: 10,
    height: 36, justifyContent: 'center', width: 36,
  },
  featureSectionHeading: { flex: 1, marginLeft: 9 },
  featureSectionTitle: { color: '#0F172A', fontSize: 12, fontWeight: '900' },
  featureSectionCount: { color: '#94A3B8', fontSize: 9, marginTop: 2 },
  featureCards: { backgroundColor: '#F8FAFC', gap: 7, padding: 9 },
  featureCard: {
    alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 10,
    flexDirection: 'row', padding: 10,
  },
  featureCardBody: { flex: 1, marginLeft: 8 },
  featureCardTitle: { color: '#1E293B', fontSize: 10, fontWeight: '800' },
  featureCardDescription: { color: '#94A3B8', fontSize: 8, marginTop: 2 },
  includedBadge: { color: '#15803D', fontSize: 7, fontWeight: '900' },
  limitGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  limitItem: { alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 10, flexDirection: 'row', gap: 6, padding: 9, width: '48%' },
  limitLabel: { color: '#475569', flex: 1, fontSize: 9, textTransform: 'capitalize' },
  limitValue: { color: '#0F172A', fontSize: 9, fontWeight: '900' },
  modalStats: {
    flexDirection: 'row', backgroundColor: '#F8FAFC', borderRadius: 14,
    padding: 12, marginTop: 16, gap: 8,
  },
  modalStat: { flex: 1, alignItems: 'center', gap: 3 },
  modalStatValue: { fontSize: 14, fontWeight: '700', color: '#0F172A', textTransform: 'capitalize' },
  modalStatLabel: { fontSize: 10, color: '#94A3B8', fontWeight: '500' },
  paymentPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  securityRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  securityBadge: { alignItems: 'center', backgroundColor: '#ECFDF5', borderRadius: 9, flexDirection: 'row', gap: 5, paddingHorizontal: 10, paddingVertical: 7 },
  securityText: { color: '#047857', fontSize: 9, fontWeight: '800' },
  paymentPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#EFF6FF', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
  },
  paymentPillText: { fontSize: 11, fontWeight: '600', color: '#2563EB' },
  razorpayText: { fontSize: 10, color: '#94A3B8', marginTop: 10, textAlign: 'center' },
  modalCta: {
    marginHorizontal: 20, marginTop: 16, backgroundColor: '#2563EB',
    paddingVertical: 15, borderRadius: 14, alignItems: 'center',
    justifyContent: 'center', minHeight: 50,
  },
  modalCtaDisabled: { backgroundColor: '#E2E8F0' },
  modalCtaText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});
