import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { getServiceByKey } from '../../api/services';

type Profile = { key: string; eyebrow: string; accent: string; tint: string; heroIcon: string; eligibility: string[]; coverage: string[] };

function ServiceProductPage({ profile }: { profile: Profile }) {
  const navigation = useNavigation<any>();
  const service = getServiceByKey(profile.key)!;
  return <View style={s.screen}>
    <View style={s.header}><Pressable onPress={() => navigation.goBack()} style={s.iconButton}><Icon name="arrow-left" size={22} color="#111827" /></Pressable><Text style={s.headerTitle}>{service.title}</Text><Pressable onPress={() => navigation.navigate('Tracking', { mode: 'list' })} style={s.iconButton}><Icon name="map-marker-path" size={21} color={profile.accent} /></Pressable></View>
    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={[s.hero, { backgroundColor: profile.tint }]}><View style={[s.heroIcon, { backgroundColor: profile.accent }]}><Icon name={profile.heroIcon} size={28} color="#fff" /></View><Text style={[s.eyebrow, { color: profile.accent }]}>{profile.eyebrow}</Text><Text style={s.title}>{service.title}</Text><Text style={s.summary}>{service.description}</Text><View style={s.heroMeta}><Meta icon="clock-outline" text={service.duration} /><Meta icon="earth" text={service.availability} /></View></View>
      <InfoSection title="Why use this service" icon="star-four-points-outline" items={service.benefits} accent={profile.accent} />
      <InfoSection title="Eligibility" icon="account-check-outline" items={profile.eligibility} accent={profile.accent} />
      <InfoSection title="Required documents" icon="file-document-multiple-outline" items={service.documents} accent={profile.accent} />
      <InfoSection title="Service coverage" icon="map-marker-radius-outline" items={profile.coverage} accent={profile.accent} />
      <View style={s.card}><Text style={s.sectionTitle}>How it works</Text>{(service.workflowSteps ?? service.features).map((item, index) => <View key={item} style={s.step}><View style={[s.stepNumber, { backgroundColor: profile.tint }]}><Text style={[s.stepNumberText, { color: profile.accent }]}>{index + 1}</Text></View><Text style={s.itemText}>{item}</Text></View>)}</View>
      <View style={s.card}><Text style={s.sectionTitle}>Pricing</Text><Text style={s.price}>Server-calculated quote</Text><Text style={s.muted}>Your final service price and estimated taxes are shown before Razorpay opens.</Text></View>
      <View style={s.card}><Text style={s.sectionTitle}>Frequently asked questions</Text>{service.faqs.map(item => <View key={item.question} style={s.faq}><Text style={s.faqQ}>{item.question}</Text><Text style={s.muted}>{item.answer}</Text></View>)}</View>
    </ScrollView>
    <View style={s.footer}><Pressable onPress={() => navigation.navigate('Tracking', { mode: 'list' })} style={s.secondary}><Icon name="briefcase-clock-outline" size={19} color={profile.accent} /><Text style={[s.secondaryText, { color: profile.accent }]}>My bookings</Text></Pressable><Pressable onPress={() => navigation.navigate('ServiceBooking', { serviceKey: profile.key })} style={[s.primary, { backgroundColor: profile.accent }]}><Text style={s.primaryText}>Get quote & book</Text><Icon name="arrow-right" size={18} color="#fff" /></Pressable></View>
  </View>;
}

function Meta({ icon, text }: { icon: string; text: string }) { return <View style={s.meta}><Icon name={icon} size={14} color="#475569" /><Text style={s.metaText}>{text}</Text></View>; }
function InfoSection({ title, icon, items, accent }: { title: string; icon: string; items: string[]; accent: string }) { return <View style={s.card}><View style={s.sectionHead}><Icon name={icon} size={19} color={accent} /><Text style={s.sectionTitle}>{title}</Text></View>{items.map(item => <View key={item} style={s.item}><Icon name="check-circle" size={16} color={accent} /><Text style={s.itemText}>{item}</Text></View>)}</View>; }

const common = { eligibility: ['Registered buyer or seller account', 'Accurate booking and contact information'], coverage: ['India and supported international trade corridors', 'Coverage confirmed during quotation'] };
const profiles: Record<string, Profile> = {
  shipping: { key: 'shipping', eyebrow: 'LOGISTICS CONTROL TOWER', accent: '#2563EB', tint: '#EFF6FF', heroIcon: 'truck-fast-outline', ...common },
  customs: { key: 'customs-brokerage', eyebrow: 'BORDER COMPLIANCE', accent: '#7C3AED', tint: '#F5F3FF', heroIcon: 'passport-biometric', ...common },
  warehouse: { key: 'warehousing', eyebrow: 'FULFILMENT NETWORK', accent: '#0891B2', tint: '#ECFEFF', heroIcon: 'warehouse', ...common },
  documentation: { key: 'documentation-support', eyebrow: 'TRADE DOCUMENT DESK', accent: '#4F46E5', tint: '#EEF2FF', heroIcon: 'file-sign', ...common },
  insurance: { key: 'insurance', eyebrow: 'CARGO RISK PROTECTION', accent: '#0284C7', tint: '#F0F9FF', heroIcon: 'shield-check-outline', ...common },
  consulting: { key: 'consulting', eyebrow: 'ADVISORY SERVICES', accent: '#0F766E', tint: '#F0FDFA', heroIcon: 'account-tie-outline', ...common },
  escrow: { key: 'escrow', eyebrow: 'SECURE SETTLEMENT', accent: '#16A34A', tint: '#F0FDF4', heroIcon: 'shield-lock-outline', ...common },
  finance: { key: 'trade-financing', eyebrow: 'WORKING CAPITAL', accent: '#0369A1', tint: '#F0F9FF', heroIcon: 'bank-transfer', ...common },
  inspection: { key: 'quality-inspection', eyebrow: 'QUALITY OPERATIONS', accent: '#D97706', tint: '#FFFBEB', heroIcon: 'clipboard-check-outline', ...common },
  dispute: { key: 'dispute-resolution', eyebrow: 'RESOLUTION CENTRE', accent: '#DC2626', tint: '#FEF2F2', heroIcon: 'scale-balance', ...common },
  supplier: { key: 'supplier-verification', eyebrow: 'TRUST & VERIFICATION', accent: '#9333EA', tint: '#FAF5FF', heroIcon: 'badge-account-horizontal-outline', ...common },
  business: { key: 'seller-verification', eyebrow: 'BUSINESS TRUST', accent: '#1D4ED8', tint: '#EFF6FF', heroIcon: 'check-decagram-outline', ...common },
};
export const ShippingServiceScreen = () => <ServiceProductPage profile={profiles.shipping} />;
export const CustomsServiceScreen = () => <ServiceProductPage profile={profiles.customs} />;
export const WarehousingServiceScreen = () => <ServiceProductPage profile={profiles.warehouse} />;
export const DocumentationServiceScreen = () => <ServiceProductPage profile={profiles.documentation} />;
export const InsuranceServiceScreen = () => <ServiceProductPage profile={profiles.insurance} />;
export const ConsultingServiceScreen = () => <ServiceProductPage profile={profiles.consulting} />;
export const EscrowServiceScreen = () => <ServiceProductPage profile={profiles.escrow} />;
export const TradeFinanceServiceScreen = () => <ServiceProductPage profile={profiles.finance} />;
export const InspectionServiceScreen = () => <ServiceProductPage profile={profiles.inspection} />;
export const DisputeServiceScreen = () => <ServiceProductPage profile={profiles.dispute} />;
export const SupplierVerificationServiceScreen = () => <ServiceProductPage profile={profiles.supplier} />;
export const BusinessVerificationServiceScreen = () => <ServiceProductPage profile={profiles.business} />;

const s = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#F8FAFC' }, header: { alignItems: 'center', backgroundColor: '#fff', borderBottomColor: '#E2E8F0', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', paddingBottom: 10, paddingHorizontal: 12, paddingTop: 48 }, iconButton: { alignItems: 'center', height: 40, justifyContent: 'center', width: 40 }, headerTitle: { color: '#111827', flex: 1, fontSize: 16, fontWeight: '800', textAlign: 'center' }, content: { padding: 16, paddingBottom: 130 }, hero: { borderRadius: 20, padding: 20 }, heroIcon: { alignItems: 'center', borderRadius: 14, height: 52, justifyContent: 'center', marginBottom: 16, width: 52 }, eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.3 }, title: { color: '#0F172A', fontSize: 25, fontWeight: '900', marginTop: 5 }, summary: { color: '#475569', fontSize: 13, lineHeight: 20, marginTop: 9 }, heroMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 }, meta: { alignItems: 'center', backgroundColor: '#FFFFFFCC', borderRadius: 20, flexDirection: 'row', gap: 5, paddingHorizontal: 10, paddingVertical: 7 }, metaText: { color: '#475569', fontSize: 11, fontWeight: '700' }, card: { backgroundColor: '#fff', borderColor: '#E2E8F0', borderRadius: 16, borderWidth: 1, marginTop: 14, padding: 17 }, sectionHead: { alignItems: 'center', flexDirection: 'row', gap: 8, marginBottom: 10 }, sectionTitle: { color: '#0F172A', fontSize: 15, fontWeight: '900' }, item: { alignItems: 'flex-start', flexDirection: 'row', gap: 9, marginTop: 9 }, itemText: { color: '#334155', flex: 1, fontSize: 12, lineHeight: 18 }, step: { alignItems: 'center', flexDirection: 'row', gap: 10, marginTop: 11 }, stepNumber: { alignItems: 'center', borderRadius: 16, height: 28, justifyContent: 'center', width: 28 }, stepNumberText: { fontSize: 11, fontWeight: '900' }, price: { color: '#0F172A', fontSize: 18, fontWeight: '900', marginBottom: 5 }, muted: { color: '#64748B', fontSize: 12, lineHeight: 18 }, faq: { borderTopColor: '#E2E8F0', borderTopWidth: StyleSheet.hairlineWidth, marginTop: 11, paddingTop: 11 }, faqQ: { color: '#1E293B', fontSize: 12, fontWeight: '800', marginBottom: 4 }, footer: { backgroundColor: '#fff', borderTopColor: '#E2E8F0', borderTopWidth: 1, bottom: 0, flexDirection: 'row', gap: 10, left: 0, padding: 14, position: 'absolute', right: 0 }, secondary: { alignItems: 'center', borderColor: '#CBD5E1', borderRadius: 13, borderWidth: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', minHeight: 48, paddingHorizontal: 13 }, secondaryText: { fontSize: 12, fontWeight: '800' }, primary: { alignItems: 'center', borderRadius: 13, flex: 1, flexDirection: 'row', gap: 7, justifyContent: 'center', minHeight: 48 }, primaryText: { color: '#fff', fontSize: 13, fontWeight: '900' } });
