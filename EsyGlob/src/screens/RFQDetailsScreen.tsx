import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { createQuotation, fetchRFQDetails, startProductChat } from '../api/marketplace';
import { Quotation, RFQ } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { getId } from '../utils/format';
import { useCurrency } from '../currency/CurrencyContext';

// ─── Palette ────────────────────────────────────────────────────────────────

const P = {
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  primary: '#0F172A',
  accent: '#2563EB',
  accentLight: '#EFF6FF',
  text: '#0F172A',
  textSecondary: '#475569',
  muted: '#94A3B8',
  border: '#E2E8F0',
  inputBg: '#F1F5F9',
  success: '#059669',
  successLight: '#ECFDF5',
  warning: '#D97706',
  warningLight: '#FFFBEB',
  danger: '#DC2626',
  dangerLight: '#FEF2F2',
  violet: '#7C3AED',
  violetLight: '#F5F3FF',
};

// ─── Status Config ──────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { bg: string; color: string; icon: string; label: string }> = {
  active: { bg: '#ECFDF5', color: '#059669', icon: 'pulse', label: 'Active' },
  draft: { bg: '#F1F5F9', color: '#64748B', icon: 'pencil', label: 'Draft' },
  quoted: { bg: '#FFF7ED', color: '#EA580C', icon: 'cash-multiple', label: 'Quoted' },
  negotiating: { bg: '#F5F3FF', color: '#7C3AED', icon: 'handshake', label: 'Negotiating' },
  converted: { bg: '#EFF6FF', color: '#2563EB', icon: 'check-decagram', label: 'Converted' },
  closed: { bg: '#FEF2F2', color: '#DC2626', icon: 'close-circle', label: 'Closed' },
  submitted: { bg: '#EFF6FF', color: '#2563EB', icon: 'send', label: 'Submitted' },
  pending: { bg: '#FFFBEB', color: '#D97706', icon: 'clock-outline', label: 'Pending' },
  accepted: { bg: '#ECFDF5', color: '#059669', icon: 'check-circle', label: 'Accepted' },
  rejected: { bg: '#FEF2F2', color: '#DC2626', icon: 'close-circle', label: 'Rejected' },
};

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] ?? {
    bg: '#F1F5F9', color: '#64748B', icon: 'information',
    label: (status || 'sent').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function resolveSellerUserId(item: any): string | undefined {
  if (!item) return undefined;
  // Try sellerId populated
  if (typeof item.sellerId === 'object' && item.sellerId) {
    if (typeof item.sellerId.userId === 'string') return item.sellerId.userId;
    if (item.sellerId.userId?._id) return String(item.sellerId.userId._id);
    return String(item.sellerId._id ?? '');
  }
  // Try sellerUserId directly
  if (typeof item.sellerUserId === 'string') return item.sellerUserId;
  if (item.sellerUserId?._id) return String(item.sellerUserId._id);
  return undefined;
}

function resolveBuyerUserId(item: any): string | undefined {
  if (!item) return undefined;
  if (typeof item.userId === 'string') return item.userId;
  if (item.userId?._id) return String(item.userId._id);
  if (typeof item.buyerId === 'string') return item.buyerId;
  if (item.buyerId?._id) return String(item.buyerId._id);
  return undefined;
}

// ─── Component ──────────────────────────────────────────────────────────────

function RFQDetailsScreen() {
  const { formatPrice, selectedCurrency } = useCurrency();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { activeRole } = useAuth();
  const { rfqId } = route.params as { rfqId: string };
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quoteForm, setQuoteForm] = useState({
    suppliedQuantity: '',
    unitPrice: '',
    currency: 'INR',
    leadTime: '15 days',
    paymentTerms: '30% advance, balance before dispatch',
    incoterms: 'FOB',
    shippingCost: '',
    sellerMessage: '',
  });

  const rfq = useQuery({
    queryKey: ['rfq-details', rfqId],
    queryFn: () => fetchRFQDetails(rfqId),
    enabled: Boolean(rfqId),
    staleTime: 30_000,
  });

  // ── Submit Quote ──────────────────────────────────────────────────────

  const submitQuote = useMutation({
    mutationFn: async () => {
      const item = rfq.data?.rfq;
      if (!item) throw new Error('RFQ details unavailable.');

      const productId = typeof item.productId === 'string'
        ? item.productId
        : (item.productId as any)?._id;

      return createQuotation({
        rfqId: getId(item) ?? '',
        productId: productId ?? '',
        title: item.title ?? (item as any).productName ?? 'Quotation',
        suppliedQuantity: Number(quoteForm.suppliedQuantity) || Number(item.quantity ?? 1) || 1,
        unitPrice: Number(quoteForm.unitPrice) || 0,
        currency: quoteForm.currency || (item as any).currency || 'INR',
        leadTime: quoteForm.leadTime,
        paymentTerms: quoteForm.paymentTerms,
        incoterms: quoteForm.incoterms,
        shippingCost: Number(quoteForm.shippingCost) || 0,
        sellerMessage: quoteForm.sellerMessage || 'Quotation submitted from mobile.',
      });
    },
    onSuccess: async (result: any) => {
      setQuoteOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['rfq-details', rfqId] });
      const quotationId = getId(result);
      if (quotationId) {
        navigation.navigate('QuotationDetails', { quotationId });
      } else {
        Alert.alert('✓ Sent', 'Quotation submitted successfully.');
      }
    },
    onError: (error: unknown) =>
      Alert.alert('Failed', error instanceof Error ? error.message : 'Unable to submit.'),
  });

  // ── Open Chat ─────────────────────────────────────────────────────────

  const openChat = useMutation({
    mutationFn: async () => {
      const item = rfq.data?.rfq as any;
      if (!item) throw new Error('RFQ not loaded.');

      const sellerView = activeRole === 'seller';
      // Check if chat already exists
      const chats: any[] = (rfq.data as any)?.chats ?? [];
      if (chats.length > 0) {
        const existingChat = chats[0];
        return { chat: existingChat, created: false };
      }

      // Create new chat
      const otherUserId = sellerView
        ? resolveBuyerUserId(item)
        : resolveSellerUserId(item);

      if (!otherUserId) throw new Error('Cannot find the other user.');

      return startProductChat({
        otherUserId,
        productId: typeof item.productId === 'string' ? item.productId : (item.productId as any)?._id ?? '',
        role: activeRole === 'seller' ? 'seller' : 'buyer',
        enquiry: false,
      });
    },
    onSuccess: (result: any) => {
      const chatId = getId(result.chat);
      if (chatId) {
        navigation.navigate('ChatDetails', {
          chatId,
          title: (rfq.data?.rfq as any)?.title ?? 'RFQ Chat',
        });
      }
    },
    onError: (error: unknown) =>
      Alert.alert('Failed', error instanceof Error ? error.message : 'Unable to open chat.'),
  });

  if (rfq.isLoading) return <LoadingState label="Loading RFQ..." />;
  if (rfq.isError || !rfq.data?.rfq)
    return (
      <ErrorState
        message={(rfq.error as Error)?.message ?? 'RFQ not found'}
        onRetry={() => rfq.refetch()}
      />
    );

  const item = rfq.data.rfq as RFQ & any;
  const sellerView = activeRole === 'seller';
  const title = item.title ?? item.productName ?? 'RFQ';
  const destination = item.destinationCountry ?? item.deliveryCountry;
  const productId = typeof item.productId === 'string' ? item.productId : item.productId?._id;
  const statusCfg = getStatusConfig(item.status ?? 'active');
  const quotations: Quotation[] = (rfq.data as any)?.quotations ?? [];
  const chats: any[] = (rfq.data as any)?.chats ?? [];
  const timeline = item.deliveryTimeline ?? item.deadline;
  const hasExistingChat = chats.length > 0;

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={P.surface} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="arrow-left" size={22} color={P.text} />
        </Pressable>
        <Text numberOfLines={1} style={styles.headerTitle}>
          {sellerView ? 'RFQ Workspace' : 'RFQ Details'}
        </Text>
        <Pressable onPress={() => rfq.refetch()} style={styles.backBtn}>
          <Icon name="refresh" size={20} color={P.textSecondary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Status */}
        <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}>
          <Icon name={statusCfg.icon} size={14} color={statusCfg.color} />
          <Text style={[styles.statusBadgeText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
        </View>

        {/* Title */}
        <Text style={styles.rfqTitle}>{title}</Text>
        {item.description && <Text style={styles.rfqDesc}>{item.description}</Text>}

        {/* Specs */}
        <View style={styles.specsGrid}>
          <SpecBadge icon="cube-outline" label="Quantity" value={`${item.quantity ?? '—'} ${item.unit ?? ''}`} />
          <SpecBadge icon="shape-outline" label="Category" value={item.category ?? 'General'} />
          {item.targetPrice && <SpecBadge icon="currency-inr" label="Target Price" value={formatPrice(Number(item.targetPrice), item.currency ?? 'INR')} />}
          {destination && <SpecBadge icon="map-marker" label="Destination" value={destination} />}
          {timeline && <SpecBadge icon="clock-outline" label="Timeline" value={String(timeline)} />}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          {/* Message Button — opens or creates chat */}
          <Pressable
            onPress={() => openChat.mutate()}
            disabled={openChat.isPending}
            style={styles.actionBtn}>
            {openChat.isPending ? (
              <ActivityIndicator size="small" color={P.accent} />
            ) : (
              <>
                <Icon name="message-text" size={18} color={P.accent} />
                <Text style={styles.actionBtnText}>
                  {hasExistingChat ? 'Open Chat' : 'Message'}
                </Text>
              </>
            )}
          </Pressable>

          {productId && (
            <Pressable
              onPress={() => navigation.navigate('ProductDetails', { productId })}
              style={styles.actionBtn}>
              <Icon name="package-variant" size={18} color={P.accent} />
              <Text style={styles.actionBtnText}>Product</Text>
            </Pressable>
          )}

          {sellerView && (
            <Pressable onPress={() => setQuoteOpen(true)} style={styles.quoteBtn}>
              <Icon name="cash-multiple" size={18} color="#FFF" />
              <Text style={styles.quoteBtnText}>Submit Quote</Text>
            </Pressable>
          )}
        </View>

        {/* Requirements */}
        {item.customSpecifications || item.customizationRequirements || item.packagingRequirements || item.deliveryRequirements || item.additionalNotes ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Requirements</Text>
            {item.customSpecifications && <ReqRow icon="tune" label="Specifications" value={item.customSpecifications} />}
            {item.customizationRequirements && <ReqRow icon="brush" label="Customization" value={item.customizationRequirements} />}
            {item.packagingRequirements && <ReqRow icon="package-variant" label="Packaging" value={item.packagingRequirements} />}
            {item.deliveryRequirements && <ReqRow icon="truck-fast" label="Delivery" value={item.deliveryRequirements} />}
            {item.additionalNotes && <ReqRow icon="note-text" label="Notes" value={item.additionalNotes} />}
          </View>
        ) : null}

        {/* Quotations */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Quotations</Text>
            {quotations.length > 0 && (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{quotations.length}</Text>
              </View>
            )}
          </View>
          {quotations.length > 0 ? (
            quotations.map((q: Quotation) => (
              <Pressable
                key={getId(q)}
                onPress={() => navigation.navigate('QuotationDetails', { quotationId: getId(q) })}
                style={styles.quoteRow}>
                <View style={styles.quoteIcon}>
                  <Icon name="cash-multiple" size={18} color={P.success} />
                </View>
                <View style={styles.quoteInfo}>
                  <Text style={styles.quoteTitle} numberOfLines={1}>
                    {q.title ?? (q.sellerId as any)?.companyName ?? 'Quotation'}
                  </Text>
                  <View style={styles.quoteMeta}>
                    <View style={[styles.quoteStatus, { backgroundColor: getStatusConfig((q as any).status ?? 'submitted').bg }]}>
                      <Text style={[styles.quoteStatusText, { color: getStatusConfig((q as any).status ?? 'submitted').color }]}>
                        {getStatusConfig((q as any).status ?? 'submitted').label}
                      </Text>
                    </View>
                    {q.totalPrice && (
                      <Text style={styles.quotePrice}>
                        {formatPrice(Number(q.totalPrice), q.currency ?? 'INR')}
                      </Text>
                    )}
                  </View>
                </View>
                <Icon name="chevron-right" size={18} color={P.muted} />
              </Pressable>
            ))
          ) : (
            <EmptyState title="No quotations yet" detail={sellerView ? 'Submit a quote to respond.' : 'Waiting for seller responses.'} />
          )}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Quote Modal */}
      <Modal visible={quoteOpen} animationType="slide" transparent onRequestClose={() => setQuoteOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Submit Quotation</Text>
              <Pressable onPress={() => setQuoteOpen(false)} style={styles.sheetClose}>
                <Icon name="close" size={20} color={P.textSecondary} />
              </Pressable>
            </View>
            <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.formRow}>
                <FormField label="Quantity" value={quoteForm.suppliedQuantity || String(item.quantity ?? '')} onChangeText={v => setQuoteForm({ ...quoteForm, suppliedQuantity: v })} keyboardType="numeric" compact />
                <FormField label={`Unit Price (${selectedCurrency})`} value={quoteForm.unitPrice} onChangeText={v => setQuoteForm({ ...quoteForm, unitPrice: v })} keyboardType="numeric" compact />
              </View>
              <View style={styles.formRow}>
                <FormField label="Currency" value={quoteForm.currency} onChangeText={v => setQuoteForm({ ...quoteForm, currency: v })} compact />
                <FormField label="Shipping" value={quoteForm.shippingCost} onChangeText={v => setQuoteForm({ ...quoteForm, shippingCost: v })} keyboardType="numeric" compact />
              </View>
              <FormField label="Lead Time" value={quoteForm.leadTime} onChangeText={v => setQuoteForm({ ...quoteForm, leadTime: v })} />
              <FormField label="Payment Terms" value={quoteForm.paymentTerms} onChangeText={v => setQuoteForm({ ...quoteForm, paymentTerms: v })} />
              <FormField label="Incoterms" value={quoteForm.incoterms} onChangeText={v => setQuoteForm({ ...quoteForm, incoterms: v })} />
              <FormField label="Message to Buyer" value={quoteForm.sellerMessage} onChangeText={v => setQuoteForm({ ...quoteForm, sellerMessage: v })} multiline />

              {quoteForm.unitPrice && quoteForm.suppliedQuantity && (
                <View style={styles.pricePreview}>
                  <Text style={styles.pricePreviewLabel}>Total Value</Text>
                  <Text style={styles.pricePreviewValue}>
                    {formatPrice(Number(quoteForm.unitPrice) * (Number(quoteForm.suppliedQuantity) || Number(item.quantity ?? 1)), quoteForm.currency)}
                  </Text>
                </View>
              )}

              <Pressable
                disabled={submitQuote.isPending}
                onPress={() => submitQuote.mutate()}
                style={[styles.submitSheetBtn, submitQuote.isPending && styles.btnDisabled]}>
                {submitQuote.isPending ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.submitSheetBtnText}>Send Quotation</Text>
                )}
              </Pressable>
              <View style={styles.modalSpacer} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Sub-Components ─────────────────────────────────────────────────────────

function SpecBadge({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.specBadge}>
      <Icon name={icon} size={14} color={P.muted} />
      <View style={styles.specContent}>
        <Text style={styles.specLabel}>{label}</Text>
        <Text style={styles.specValue} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
}

function ReqRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = value.length > 80;
  return (
    <Pressable onPress={() => isLong && setExpanded(!expanded)} style={styles.reqRow}>
      <View style={styles.reqIcon}>
        <Icon name={icon} size={16} color={P.accent} />
      </View>
      <View style={styles.reqContent}>
        <Text style={styles.reqLabel}>{label}</Text>
        <Text style={styles.reqValue} numberOfLines={expanded ? undefined : 2}>{value}</Text>
        {isLong && <Text style={styles.expandText}>{expanded ? 'Show less' : 'Show more'}</Text>}
      </View>
    </Pressable>
  );
}

function FormField({ label, value, onChangeText, multiline, keyboardType, compact }: {
  label: string; value: string; onChangeText: (v: string) => void; multiline?: boolean; keyboardType?: 'default' | 'numeric'; compact?: boolean;
}) {
  return (
    <View style={[styles.formField, compact && styles.formFieldCompact]}>
      <Text style={styles.formLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        multiline={multiline}
        placeholderTextColor={P.muted}
        style={[styles.formInput, multiline && styles.formTextarea]}
      />
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  bottomSpacer: { height: 40 },
  modalSpacer: { height: 30 },
  screen: { flex: 1, backgroundColor: P.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingHorizontal: 14, paddingBottom: 10,
    backgroundColor: P.surface, borderBottomWidth: 1, borderBottomColor: P.border,
  },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: P.inputBg, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: P.text },
  content: { padding: 14 },

  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 10 },
  statusBadgeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  rfqTitle: { fontSize: 20, fontWeight: '700', color: P.text, marginBottom: 6 },
  rfqDesc: { fontSize: 13, color: P.textSecondary, lineHeight: 20, marginBottom: 14 },

  specsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  specBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: P.surface, borderRadius: 12, padding: 12, width: '47%', borderWidth: 1, borderColor: P.border },
  specContent: { flex: 1 },
  specLabel: { fontSize: 9, fontWeight: '600', color: P.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  specValue: { fontSize: 13, fontWeight: '700', color: P.text, marginTop: 2 },

  actionRow: { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: P.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: P.border },
  actionBtnText: { fontSize: 12, fontWeight: '600', color: P.accent },
  quoteBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: P.primary, borderRadius: 12, paddingVertical: 12 },
  quoteBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },

  card: { backgroundColor: P.surface, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: P.border },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: P.text },
  countBadge: { backgroundColor: P.accentLight, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  countBadgeText: { fontSize: 11, fontWeight: '700', color: P.accent },

  reqRow: { flexDirection: 'row', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: P.border },
  reqIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: P.accentLight, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  reqContent: { flex: 1 },
  reqLabel: { fontSize: 10, fontWeight: '600', color: P.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  reqValue: { fontSize: 13, color: P.textSecondary, marginTop: 2, lineHeight: 18 },
  expandText: { fontSize: 11, color: P.accent, fontWeight: '600', marginTop: 4 },

  quoteRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: P.border },
  quoteIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: P.successLight, alignItems: 'center', justifyContent: 'center' },
  quoteInfo: { flex: 1 },
  quoteTitle: { fontSize: 13, fontWeight: '600', color: P.text },
  quoteMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  quoteStatus: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  quoteStatusText: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase' },
  quotePrice: { fontSize: 11, fontWeight: '600', color: P.textSecondary },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: P.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' },
  sheetHandle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: P.border, marginTop: 12 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingBottom: 8 },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: P.text },
  sheetClose: { width: 32, height: 32, borderRadius: 8, backgroundColor: P.inputBg, alignItems: 'center', justifyContent: 'center' },
  sheetScroll: { paddingHorizontal: 16 },

  formRow: { flexDirection: 'row', gap: 10 },
  formField: { marginBottom: 12 },
  formFieldCompact: { flex: 1 },
  formLabel: { fontSize: 10, fontWeight: '600', color: P.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  formInput: { backgroundColor: P.inputBg, borderRadius: 10, paddingHorizontal: 12, height: 44, fontSize: 14, color: P.text, borderWidth: 1, borderColor: P.border },
  formTextarea: { height: 90, paddingTop: 12, textAlignVertical: 'top' },

  pricePreview: { backgroundColor: P.accentLight, borderRadius: 12, padding: 14, marginBottom: 14 },
  pricePreviewLabel: { fontSize: 10, fontWeight: '700', color: P.accent, textTransform: 'uppercase' },
  pricePreviewValue: { fontSize: 24, fontWeight: '800', color: P.text, marginTop: 4 },

  submitSheetBtn: { backgroundColor: P.primary, borderRadius: 14, alignItems: 'center', justifyContent: 'center', height: 50 },
  submitSheetBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },
});

export default RFQDetailsScreen;
