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
import {
  acceptQuotation,
  fetchQuotationDetails,
  patchQuotation,
  respondToQuotation,
} from '../api/marketplace';
import { useAuth } from '../auth/AuthContext';
import { ErrorState, LoadingState } from '../components/StateViews';

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
  submitted: { bg: '#EFF6FF', color: '#2563EB', icon: 'send', label: 'Submitted' },
  pending: { bg: '#FFFBEB', color: '#D97706', icon: 'clock-outline', label: 'Pending' },
  accepted: { bg: '#ECFDF5', color: '#059669', icon: 'check-circle', label: 'Accepted' },
  rejected: { bg: '#FEF2F2', color: '#DC2626', icon: 'close-circle', label: 'Rejected' },
  revision_requested: { bg: '#F5F3FF', color: '#7C3AED', icon: 'pencil', label: 'Revision Requested' },
  counter_offered: { bg: '#FFF7ED', color: '#EA580C', icon: 'cash-refund', label: 'Counter Offered' },
  negotiating: { bg: '#F5F3FF', color: '#7C3AED', icon: 'handshake', label: 'Negotiating' },
  converted: { bg: '#ECFDF5', color: '#059669', icon: 'check-decagram', label: 'Converted' },
  lost: { bg: '#FEF2F2', color: '#DC2626', icon: 'close-circle', label: 'Lost' },
};

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] ?? {
    bg: '#F1F5F9', color: '#64748B', icon: 'information',
    label: (status || 'sent').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
  };
}

// ─── Types ──────────────────────────────────────────────────────────────────

type ActionType = 'counter_offer' | 'request_revision' | 'reject' | null;

// ─── Component ──────────────────────────────────────────────────────────────

function QuotationDetailsScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { activeRole } = useAuth();
  const { quotationId } = route.params as { quotationId: string };
  const [actionOpen, setActionOpen] = useState<ActionType>(null);
  const [actionText, setActionText] = useState('');

  const quotation = useQuery({
    queryKey: ['quotation-details', quotationId],
    queryFn: () => fetchQuotationDetails(quotationId),
    enabled: Boolean(quotationId),
    staleTime: 30_000,
  });

  // ── Accept ────────────────────────────────────────────────────────────

  const accept = useMutation({
    mutationFn: () => acceptQuotation(quotationId),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['quotation-details', quotationId] });
      const orderId =
        result?.tradeOrder?._id ?? result?.tradeOrder?.id ?? result?.orderId;
      Alert.alert('✓ Accepted', orderId ? 'Order created.' : 'Status updated.', [
        orderId
          ? { text: 'View Order', onPress: () => navigation.navigate('OrderDetails', { orderId }) }
          : { text: 'OK' },
      ]);
    },
    onError: (error: unknown) =>
      Alert.alert('Failed', error instanceof Error ? error.message : 'Unable to accept.'),
  });

  // ── Revise / Counter / Reject ─────────────────────────────────────────

  const revise = useMutation({
    mutationFn: async (action: 'request_revision' | 'counter_offer' | 'reject') => {
      if (action === 'reject') {
        // Use respondToQuotation for reject
        return respondToQuotation(quotationId, 'reject', {
          reason: actionText || 'Buyer rejected this quotation.',
        });
      }
      // Use patchQuotation for revise/counter
      const body: Record<string, unknown> = {
        action,
        reason: actionText || 'Buyer requested an update.',
      };
      return patchQuotation(quotationId, body);
    },
    onSuccess: () => {
      setActionOpen(null);
      setActionText('');
      queryClient.invalidateQueries({ queryKey: ['quotation-details', quotationId] });
      Alert.alert('✓ Sent', 'Quotation updated.');
    },
    onError: (error: unknown) =>
      Alert.alert('Failed', error instanceof Error ? error.message : 'Unable to update.'),
  });

  if (quotation.isLoading) return <LoadingState label="Loading..." />;
  if (quotation.isError || !quotation.data)
    return (
      <ErrorState
        message={(quotation.error as Error)?.message ?? 'Not found'}
        onRetry={() => quotation.refetch()}
      />
    );

  const item = quotation.data as any;
  const buyerView = activeRole !== 'seller';
  const seller = typeof item.sellerId === 'object' ? item.sellerId : undefined;
  const product = typeof item.productId === 'object' ? item.productId : undefined;
  const rfq = typeof item.rfqId === 'object' ? item.rfqId : undefined;
  const title = item.title ?? product?.name ?? rfq?.title ?? 'Quotation';
  const chatId = typeof item.chatId === 'string' ? item.chatId : item.chatId?._id;
  const nextProductId = typeof item.productId === 'string' ? item.productId : item.productId?._id;
  const canAccept = Boolean(nextProductId);
  const statusCfg = getStatusConfig(item.status ?? 'submitted');

  const actionLabels: Record<string, string> = {
    counter_offer: 'Counter Offer',
    request_revision: 'Request Revision',
    reject: 'Reject Quotation',
  };

  const actionPlaceholders: Record<string, string> = {
    counter_offer: 'Describe your counter offer...',
    request_revision: 'What needs revision?',
    reject: 'Reason for rejection?',
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={P.surface} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="arrow-left" size={22} color={P.text} />
        </Pressable>
        <Text numberOfLines={1} style={styles.headerTitle}>Quotation</Text>
        <Pressable onPress={() => quotation.refetch()} style={styles.backBtn}>
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
        <Text style={styles.title}>{title}</Text>
        {seller?.companyName && <Text style={styles.supplierName}>{seller.companyName}</Text>}

        {/* Price */}
        {item.totalPrice || item.unitPrice ? (
          <View style={styles.priceCard}>
            <Text style={styles.priceLabel}>Total Value</Text>
            <Text style={styles.priceValue}>
              {item.currency ?? '₹'} {Number(item.totalPrice ?? item.unitPrice).toLocaleString('en-IN')}
            </Text>
            {item.unitPrice && item.quantity ? (
              <Text style={styles.priceSub}>
                {item.currency ?? '₹'} {Number(item.unitPrice).toLocaleString('en-IN')} / unit · Qty: {item.quantity}
              </Text>
            ) : null}
          </View>
        ) : (
          <Text style={styles.pricePending}>Price on request</Text>
        )}

        {/* Buyer Actions */}
        {buyerView && (
          <View style={styles.actionSection}>
            <Pressable
              disabled={accept.isPending || !canAccept}
              onPress={() => accept.mutate()}
              style={[styles.acceptBtn, (!canAccept || accept.isPending) && styles.btnDisabled]}>
              {accept.isPending ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Icon name="check-circle" size={18} color="#FFF" />
                  <Text style={styles.acceptBtnText}>Accept Quotation</Text>
                </>
              )}
            </Pressable>

            <View style={styles.secondaryRow}>
              <Pressable onPress={() => setActionOpen('request_revision')} style={styles.outlineBtn}>
                <Icon name="pencil" size={14} color={P.violet} />
                <Text style={[styles.outlineBtnText, { color: P.violet }]}>Revise</Text>
              </Pressable>
              <Pressable onPress={() => setActionOpen('counter_offer')} style={styles.outlineBtn}>
                <Icon name="cash-refund" size={14} color={P.warning} />
                <Text style={[styles.outlineBtnText, { color: P.warning }]}>Counter</Text>
              </Pressable>
              <Pressable onPress={() => setActionOpen('reject')} style={styles.outlineBtn}>
                <Icon name="close-circle" size={14} color={P.danger} />
                <Text style={[styles.outlineBtnText, { color: P.danger }]}>Reject</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Seller Info */}
        {!buyerView && (
          <View style={styles.infoBanner}>
            <Icon name="information" size={16} color={P.accent} />
            <Text style={styles.infoBannerText}>Manage from your seller dashboard or chat.</Text>
          </View>
        )}

        {/* No product warning */}
        {buyerView && !canAccept && (
          <View style={styles.warningBanner}>
            <Icon name="alert-circle" size={16} color={P.danger} />
            <Text style={styles.warningBannerText}>No product linked — cannot create order.</Text>
          </View>
        )}

        {/* Quick Links */}
        <View style={styles.quickLinks}>
          {chatId && (
            <Pressable onPress={() => navigation.navigate('ChatDetails', { chatId, title })} style={styles.quickLink}>
              <Icon name="message-text" size={18} color={P.accent} />
              <Text style={styles.quickLinkText}>Chat</Text>
            </Pressable>
          )}
          {nextProductId && (
            <Pressable
              onPress={() => navigation.navigate('OrderCheckout', { mode: 'trade', quotationId, productId: nextProductId })}
              style={styles.quickLink}>
              <Icon name="cart-arrow-right" size={18} color={P.accent} />
              <Text style={styles.quickLinkText}>Create Order</Text>
            </Pressable>
          )}
        </View>

        {/* Details */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Quotation Details</Text>
          <DetailRow icon="cash" label="Unit Price" value={item.unitPrice ? `${item.currency ?? '₹'} ${Number(item.unitPrice).toLocaleString('en-IN')}` : undefined} />
          <DetailRow icon="cube-outline" label="Quantity" value={item.quantity ? `${item.quantity} ${item.unit ?? 'units'}` : undefined} />
          <DetailRow icon="clock-outline" label="Lead Time" value={item.leadTime} />
          <DetailRow icon="credit-card" label="Payment Terms" value={item.paymentTerms} />
          <DetailRow icon="truck-delivery" label="Incoterms" value={item.incoterms} />
          <DetailRow icon="cash-marker" label="Shipping" value={item.shippingCost ? `${item.currency ?? '₹'} ${Number(item.shippingCost).toLocaleString('en-IN')}` : undefined} />
          {item.sellerMessage && <DetailRow icon="message-text" label="Seller Message" value={item.sellerMessage} multiline />}
          <DetailRow icon="calendar" label="Created" value={item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : undefined} />
          <DetailRow icon="calendar-check" label="Valid Until" value={item.validUntil ? new Date(item.validUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : item.validity ?? undefined} />
        </View>

        {/* Linked RFQ */}
        {rfq && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Linked RFQ</Text>
            <DetailRow icon="clipboard-list" label="Title" value={rfq.title ?? rfq.productName} />
            <DetailRow icon="cube-outline" label="Quantity" value={rfq.quantity ? `${rfq.quantity} ${rfq.unit ?? ''}` : undefined} />
            <DetailRow icon="map-marker" label="Destination" value={rfq.destinationCountry ?? rfq.deliveryCountry} />
          </View>
        )}

        {/* Linked Product */}
        {product && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Linked Product</Text>
            <DetailRow icon="package-variant" label="Product" value={product.name} />
            <DetailRow icon="cash" label="Price" value={product.price ? `${product.currency ?? '₹'} ${Number(product.price).toLocaleString('en-IN')}` : undefined} />
            <DetailRow icon="cube-outline" label="MOQ" value={product.minimumOrderQuantity ? `${product.minimumOrderQuantity} ${product.unit ?? 'units'}` : undefined} />
          </View>
        )}

        {/* Supplier */}
        {seller && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Supplier</Text>
            <DetailRow icon="domain" label="Company" value={seller.companyName ?? seller.businessName} />
            <DetailRow icon="map-marker" label="Country" value={seller.country} />
            <DetailRow icon="shield-check" label="Verification" value={seller.isVerified ? 'Verified' : seller.verificationStatus ?? 'Pending'} />
            {seller.rating && <DetailRow icon="star" label="Rating" value={`${seller.rating}/5`} />}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Action Modal */}
      <Modal transparent visible={actionOpen !== null} animationType="slide" onRequestClose={() => setActionOpen(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{actionOpen ? actionLabels[actionOpen] : ''}</Text>
              <Pressable onPress={() => setActionOpen(null)} style={styles.sheetClose}>
                <Icon name="close" size={20} color={P.textSecondary} />
              </Pressable>
            </View>
            <TextInput
              value={actionText}
              onChangeText={setActionText}
              multiline
              placeholder={actionOpen ? actionPlaceholders[actionOpen] : 'Enter details...'}
              placeholderTextColor={P.muted}
              style={styles.sheetInput}
            />
            <Pressable
              disabled={!actionOpen || revise.isPending}
              onPress={() => actionOpen && revise.mutate(actionOpen as 'request_revision' | 'counter_offer' | 'reject')}
              style={[styles.sheetSubmit, revise.isPending && styles.btnDisabled]}>
              {revise.isPending ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.sheetSubmitText}>Send</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Detail Row ─────────────────────────────────────────────────────────────

function DetailRow({ icon, label, value, multiline }: { icon: string; label: string; value?: string; multiline?: boolean }) {
  if (!value) return null;
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}><Icon name={icon} size={16} color={P.muted} /></View>
      <View style={styles.detailContent}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue} numberOfLines={multiline ? undefined : 2}>{value}</Text>
      </View>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: P.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 56, paddingHorizontal: 14, paddingBottom: 10, backgroundColor: P.surface, borderBottomWidth: 1, borderBottomColor: P.border },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: P.inputBg, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: P.text },
  content: { padding: 14 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 10 },
  statusBadgeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { fontSize: 20, fontWeight: '700', color: P.text, marginBottom: 4 },
  supplierName: { fontSize: 13, color: P.textSecondary, marginBottom: 14 },
  priceCard: { backgroundColor: P.accentLight, borderRadius: 14, padding: 16, marginBottom: 16 },
  priceLabel: { fontSize: 10, fontWeight: '700', color: P.accent, textTransform: 'uppercase', letterSpacing: 0.5 },
  priceValue: { fontSize: 28, fontWeight: '800', color: P.text, marginTop: 4 },
  priceSub: { fontSize: 12, color: P.textSecondary, marginTop: 4 },
  pricePending: { fontSize: 14, color: P.muted, fontStyle: 'italic', marginBottom: 16 },
  actionSection: { gap: 10, marginBottom: 16 },
  acceptBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: P.success, borderRadius: 14, height: 50 },
  acceptBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  secondaryRow: { flexDirection: 'row', gap: 8 },
  outlineBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: P.surface, borderRadius: 12, height: 42, borderWidth: 1, borderColor: P.border },
  outlineBtnText: { fontSize: 12, fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },
  infoBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: P.accentLight, borderRadius: 10, padding: 12, marginBottom: 12 },
  infoBannerText: { flex: 1, fontSize: 11, color: P.textSecondary },
  warningBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: P.dangerLight, borderRadius: 10, padding: 12, marginBottom: 12 },
  warningBannerText: { flex: 1, fontSize: 11, color: P.danger },
  quickLinks: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  quickLink: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: P.surface, borderRadius: 12, paddingVertical: 14, borderWidth: 1, borderColor: P.border },
  quickLinkText: { fontSize: 12, fontWeight: '600', color: P.accent },
  card: { backgroundColor: P.surface, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: P.border },
  cardTitle: { fontSize: 14, fontWeight: '700', color: P.text, marginBottom: 10 },
  detailRow: { flexDirection: 'row', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: P.border },
  detailIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: P.inputBg, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  detailContent: { flex: 1 },
  detailLabel: { fontSize: 10, fontWeight: '600', color: P.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  detailValue: { fontSize: 13, fontWeight: '500', color: P.text, marginTop: 2, lineHeight: 18 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: P.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  sheetHandle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: P.border, marginTop: 12 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingBottom: 8 },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: P.text },
  sheetClose: { width: 32, height: 32, borderRadius: 8, backgroundColor: P.inputBg, alignItems: 'center', justifyContent: 'center' },
  sheetInput: { backgroundColor: P.inputBg, borderRadius: 12, marginHorizontal: 16, minHeight: 110, padding: 14, fontSize: 14, color: P.text, textAlignVertical: 'top', borderWidth: 1, borderColor: P.border },
  sheetSubmit: { backgroundColor: P.primary, borderRadius: 14, alignItems: 'center', justifyContent: 'center', margin: 16, height: 48 },
  sheetSubmitText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
});

export default QuotationDetailsScreen;