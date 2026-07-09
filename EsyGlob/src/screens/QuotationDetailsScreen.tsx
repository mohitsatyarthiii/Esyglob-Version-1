import React from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
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
} from '../api/marketplace';
import { useAuth } from '../auth/AuthContext';
import { ErrorState, LoadingState } from '../components/StateViews';
import { radii, shadow, spacing } from '../theme';

// ──────────────────────────────────────
// Alibaba-inspired palette
// ──────────────────────────────────────
const PALETTE = {
  primary: '#FF6A00',
  primaryLight: '#FFF3E8',
  primaryDark: '#E05500',
  emerald: '#00B578',
  sky: '#3B9CFF',
  violet: '#7B61FF',
  rose: '#FF3B6E',
  amber: '#FF9500',
  ink: '#1A1A1A',
  text: '#333333',
  muted: '#8C8C8C',
  faint: '#E8E8E8',
  surface: '#FFFFFF',
  background: '#F5F5F5',
  cardMuted: '#F8F9FB',
} as const;

// ──────────────────────────────────────
// Status config
// ──────────────────────────────────────
const STATUS_CONFIG: Record<
  string,
  { bg: string; color: string; icon: string; label: string }
> = {
  submitted: {
    bg: '#E8F4FF',
    color: '#3B9CFF',
    icon: 'send-outline',
    label: 'Submitted',
  },
  pending: {
    bg: '#FFF8E8',
    color: '#FF9500',
    icon: 'clock-outline',
    label: 'Pending',
  },
  accepted: {
    bg: '#E8F8EE',
    color: '#00B578',
    icon: 'check-circle-outline',
    label: 'Accepted',
  },
  rejected: {
    bg: '#FFF0F0',
    color: '#FF3B30',
    icon: 'close-circle-outline',
    label: 'Rejected',
  },
  revision_requested: {
    bg: '#EEF0FF',
    color: '#7B61FF',
    icon: 'pencil-outline',
    label: 'Revision Requested',
  },
  counter_offered: {
    bg: '#FFF3E8',
    color: '#FF6A00',
    icon: 'cash-refund',
    label: 'Counter Offered',
  },
  negotiating: {
    bg: '#EEF0FF',
    color: '#7B61FF',
    icon: 'handshake',
    label: 'Negotiating',
  },
  converted: {
    bg: '#E8F4FF',
    color: '#3B9CFF',
    icon: 'check-decagram',
    label: 'Converted',
  },
  lost: {
    bg: '#FFF0F0',
    color: '#FF3B30',
    icon: 'close-circle-outline',
    label: 'Lost',
  },
};

function getStatusConfig(status: string) {
  return (
    STATUS_CONFIG[status] ?? {
      bg: '#F5F5F5',
      color: '#8C8C8C',
      icon: 'information-outline',
      label: (status || 'sent').replace(/_/g, ' '),
    }
  );
}

// ──────────────────────────────────────
// Main Component
// ──────────────────────────────────────
function QuotationDetailsScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { activeRole } = useAuth();
  const { quotationId } = route.params as { quotationId: string };
  const [actionOpen, setActionOpen] = React.useState<
    'counter_offer' | 'request_revision' | 'reject' | null
  >(null);
  const [actionText, setActionText] = React.useState('');

  const quotation = useQuery({
    queryKey: ['quotation-details', quotationId],
    queryFn: () => fetchQuotationDetails(quotationId),
    enabled: Boolean(quotationId),
    staleTime: 30_000,
  });

  const accept = useMutation({
    mutationFn: () => acceptQuotation(quotationId),
    onSuccess: result => {
      queryClient.invalidateQueries({
        queryKey: ['quotation-details', quotationId],
      });
      const orderId =
        typeof (result as any).orderId === 'string'
          ? (result as any).orderId
          : (result as any).orderId?._id;
      Alert.alert(
        'Quotation accepted',
        orderId
          ? 'The order has been created successfully.'
          : 'Quotation status was updated.',
      );
      if (orderId) {
        navigation.navigate('OrderDetails', { orderId });
      }
    },
    onError: error =>
      Alert.alert(
        'Accept failed',
        error instanceof Error
          ? error.message
          : 'Unable to accept quotation.',
      ),
  });

  const revise = useMutation({
    mutationFn: (
      action: 'request_revision' | 'counter_offer' | 'reject',
    ) =>
      action === 'reject'
        ? patchQuotation(quotationId, {
            status: 'rejected',
            rejectionReason:
              actionText || 'Buyer rejected quotation from mobile.',
          })
        : patchQuotation(quotationId, {
            action,
            reason:
              actionText ||
              (action === 'counter_offer'
                ? 'Buyer requested a counter offer from mobile.'
                : 'Buyer requested quotation revision from mobile.'),
          }),
    onSuccess: () => {
      setActionOpen(null);
      setActionText('');
      queryClient.invalidateQueries({
        queryKey: ['quotation-details', quotationId],
      });
      Alert.alert('Sent', 'The quotation negotiation was updated.');
    },
    onError: error =>
      Alert.alert(
        'Update failed',
        error instanceof Error
          ? error.message
          : 'Unable to update quotation.',
      ),
  });

  // ── Loading ──
  if (quotation.isLoading) {
    return <LoadingState label="Loading quotation" />;
  }

  // ── Error ──
  if (quotation.isError || !quotation.data) {
    return (
      <ErrorState
        message={
          (quotation.error as Error)?.message ??
          'Quotation was not returned.'
        }
        onRetry={() => quotation.refetch()}
      />
    );
  }

  const item = quotation.data as any;
  const buyerView = activeRole !== 'seller';
  const seller =
    typeof item.sellerId === 'object' ? item.sellerId : undefined;
  const product =
    typeof item.productId === 'object' ? item.productId : undefined;
  const rfq =
    typeof item.rfqId === 'object' ? item.rfqId : undefined;
  const title =
    item.title ?? product?.name ?? rfq?.title ?? 'Quotation';
  const chatId =
    typeof item.chatId === 'string' ? item.chatId : item.chatId?._id;
  const orderId =
    typeof item.orderId === 'string' ? item.orderId : item.orderId?._id;
  const nextProductId =
    typeof item.productId === 'string'
      ? item.productId
      : item.productId?._id;
  const canAccept = Boolean(nextProductId);
  const statusCfg = getStatusConfig(item.status ?? 'submitted');

  const actionLabels: Record<string, string> = {
    counter_offer: 'Counter Offer',
    request_revision: 'Request Revision',
    reject: 'Reject Quotation',
  };

  const actionPlaceholders: Record<string, string> = {
    counter_offer:
      'Describe your counter offer — target price, quantity, payment terms, or delivery expectations.',
    request_revision:
      'Explain what needs to be revised in the quotation.',
    reject:
      'Let the seller know why this quotation doesn\'t meet your requirements.',
  };

  return (
    <View style={styles.screen}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.headerBtn}
          hitSlop={8}>
          <Icon name="arrow-left" size={22} color={PALETTE.ink} />
        </Pressable>
        <Text numberOfLines={1} style={styles.headerTitle}>
          Quotation Details
        </Text>
        <Pressable
          onPress={() => quotation.refetch()}
          style={styles.headerBtn}
          hitSlop={8}>
          <Icon name="refresh" size={20} color={PALETTE.ink} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        {/* ── Hero Card ── */}
        <View style={styles.heroCard}>
          {/* Status badge */}
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: statusCfg.bg },
            ]}>
            <Icon name={statusCfg.icon} size={13} color={statusCfg.color} />
            <Text
              style={[
                styles.statusBadgeText,
                { color: statusCfg.color },
              ]}>
              {statusCfg.label}
            </Text>
          </View>

          {/* Title */}
          <Text style={styles.heroTitle}>{title}</Text>

          {/* Supplier name */}
          {seller ? (
            <Text style={styles.heroSupplier}>
              {seller.companyName ??
                seller.businessName ??
                seller.displayName ??
                'Supplier'}
            </Text>
          ) : null}

          {/* Price highlight */}
          {item.totalPrice || item.unitPrice ? (
            <View style={styles.priceBox}>
              <Text style={styles.priceLabel}>Total Value</Text>
              <Text style={styles.priceValue}>
                {item.currency ?? '₹'}{' '}
                {Number(
                  item.totalPrice ?? item.unitPrice,
                ).toLocaleString('en-IN')}
              </Text>
              {item.unitPrice && item.quantity ? (
                <Text style={styles.priceUnit}>
                  {item.currency ?? '₹'}{' '}
                  {Number(item.unitPrice).toLocaleString(
                    'en-IN',
                  )}{' '}
                  / unit · Qty: {item.quantity}
                </Text>
              ) : null}
            </View>
          ) : (
            <Text style={styles.pricePending}>
              Price on request
            </Text>
          )}
        </View>

        {/* ── Buyer Actions ── */}
        {buyerView ? (
          <View style={styles.actionRow}>
            <Pressable
              disabled={accept.isPending || !canAccept}
              onPress={() => accept.mutate()}
              style={[
                styles.acceptBtn,
                !canAccept && styles.btnDisabled,
              ]}>
              <Icon
                name="check-circle-outline"
                size={20}
                color="#fff"
              />
              <Text style={styles.acceptBtnText}>
                {accept.isPending ? 'Accepting...' : 'Accept Quote'}
              </Text>
            </Pressable>

            <View style={styles.secondaryActions}>
              <Pressable
                disabled={revise.isPending}
                onPress={() => setActionOpen('request_revision')}
                style={styles.secondaryBtn}>
                <Icon
                  name="pencil-outline"
                  size={16}
                  color={PALETTE.primary}
                />
                <Text style={styles.secondaryBtnText}>Revise</Text>
              </Pressable>
              <Pressable
                disabled={revise.isPending}
                onPress={() => setActionOpen('counter_offer')}
                style={styles.secondaryBtn}>
                <Icon
                  name="cash-refund"
                  size={16}
                  color={PALETTE.primary}
                />
                <Text style={styles.secondaryBtnText}>Counter</Text>
              </Pressable>
              <Pressable
                disabled={revise.isPending}
                onPress={() => setActionOpen('reject')}
                style={styles.dangerBtn}>
                <Icon
                  name="close-circle-outline"
                  size={16}
                  color={PALETTE.rose}
                />
                <Text style={styles.dangerBtnText}>Reject</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.infoBanner}>
            <Icon
              name="information-outline"
              size={18}
              color={PALETTE.primary}
            />
            <Text style={styles.infoBannerText}>
              Use the RFQ workspace or chat to revise and resubmit
              this quotation.
            </Text>
          </View>
        )}

        {/* ── No product warning ── */}
        {buyerView && !canAccept ? (
          <View style={styles.warningBanner}>
            <Icon
              name="alert-circle-outline"
              size={18}
              color={PALETTE.rose}
            />
            <Text style={styles.warningBannerText}>
              This quotation is not linked to a product, so it cannot
              be converted into a trade order yet.
            </Text>
          </View>
        ) : null}

        {/* ── Quick Links ── */}
        <View style={styles.quickLinks}>
          {chatId ? (
            <Pressable
              onPress={() =>
                navigation.navigate('ChatDetails', {
                  chatId,
                  title,
                })
              }
              style={styles.quickLink}>
              <View style={styles.quickLinkIcon}>
                <Icon
                  name="message-text-outline"
                  size={18}
                  color={PALETTE.primary}
                />
              </View>
              <Text style={styles.quickLinkText}>Chat</Text>
            </Pressable>
          ) : null}
          {orderId ? (
            <Pressable
              onPress={() =>
                navigation.navigate('OrderDetails', { orderId })
              }
              style={styles.quickLink}>
              <View style={styles.quickLinkIcon}>
                <Icon
                  name="clipboard-list-outline"
                  size={18}
                  color={PALETTE.primary}
                />
              </View>
              <Text style={styles.quickLinkText}>Order</Text>
            </Pressable>
          ) : null}
          {nextProductId ? (
            <Pressable
              onPress={() =>
                navigation.navigate('OrderCheckout', {
                  mode: 'trade',
                  quotationId,
                  productId: nextProductId,
                })
              }
              style={styles.quickLink}>
              <View style={styles.quickLinkIcon}>
                <Icon
                  name="cart-arrow-right"
                  size={18}
                  color={PALETTE.primary}
                />
              </View>
              <Text style={styles.quickLinkText}>Create Order</Text>
            </Pressable>
          ) : null}
        </View>

        {/* ── Details Section ── */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            Quotation Details
          </Text>

          <DetailRow
            icon="cash"
            label="Unit Price"
            value={
              item.unitPrice
                ? `${item.currency ?? '₹'} ${Number(item.unitPrice).toLocaleString('en-IN')}`
                : undefined
            }
          />
          <DetailRow
            icon="cube-outline"
            label="Quantity"
            value={
              item.quantity
                ? `${item.quantity} ${item.unit ?? 'units'}`
                : undefined
            }
          />
          <DetailRow
            icon="clock-outline"
            label="Lead Time"
            value={item.leadTime}
          />
          <DetailRow
            icon="credit-card-outline"
            label="Payment Terms"
            value={item.paymentTerms}
          />
          <DetailRow
            icon="truck-delivery-outline"
            label="Incoterms"
            value={item.incoterms}
          />
          <DetailRow
            icon="cash-marker"
            label="Shipping Cost"
            value={
              item.shippingCost
                ? `${item.currency ?? '₹'} ${Number(item.shippingCost).toLocaleString('en-IN')}`
                : undefined
            }
          />
          {item.sellerMessage ? (
            <DetailRow
              icon="message-text-outline"
              label="Seller Message"
              value={item.sellerMessage}
              multiline
            />
          ) : null}
          <DetailRow
            icon="calendar-outline"
            label="Created"
            value={
              item.createdAt
                ? new Date(
                    item.createdAt,
                  ).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })
                : undefined
            }
          />
          <DetailRow
            icon="calendar-check-outline"
            label="Valid Until"
            value={
              item.validUntil
                ? new Date(
                    item.validUntil,
                  ).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })
                : item.validity ?? undefined
            }
          />
        </View>

        {/* ── Linked RFQ ── */}
        {rfq ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Linked RFQ</Text>
            <DetailRow
              icon="clipboard-list-outline"
              label="Title"
              value={rfq.title ?? rfq.productName}
            />
            <DetailRow
              icon="cube-outline"
              label="Quantity"
              value={
                rfq.quantity
                  ? `${rfq.quantity} ${rfq.unit ?? ''}`
                  : undefined
              }
            />
            <DetailRow
              icon="map-marker-outline"
              label="Destination"
              value={
                rfq.destinationCountry ??
                rfq.deliveryCountry
              }
            />
          </View>
        ) : null}

        {/* ── Linked Product ── */}
        {product ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Linked Product</Text>
            <DetailRow
              icon="package-variant-closed"
              label="Product"
              value={product.name}
            />
            <DetailRow
              icon="cash"
              label="Price"
              value={
                product.price
                  ? `${product.currency ?? '₹'} ${Number(product.price).toLocaleString('en-IN')}`
                  : undefined
              }
            />
            <DetailRow
              icon="cube-outline"
              label="MOQ"
              value={
                product.minimumOrderQuantity
                  ? `${product.minimumOrderQuantity} ${product.unit ?? 'units'}`
                  : undefined
              }
            />
          </View>
        ) : null}

        {/* ── Supplier Info ── */}
        {seller ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Supplier</Text>
            <DetailRow
              icon="domain"
              label="Company"
              value={
                seller.companyName ??
                seller.businessName ??
                seller.displayName
              }
            />
            <DetailRow
              icon="map-marker-outline"
              label="Country"
              value={seller.country}
            />
            <DetailRow
              icon="shield-check-outline"
              label="Verification"
              value={
                seller.isVerified ||
                seller.verificationStatus === 'verified'
                  ? 'Verified'
                  : seller.verificationStatus ?? 'Pending'
              }
            />
            {seller.rating ? (
              <DetailRow
                icon="star-outline"
                label="Rating"
                value={`${seller.rating}/5`}
              />
            ) : null}
          </View>
        ) : null}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* ── Action Modal ── */}
      <Modal
        transparent
        visible={Boolean(actionOpen)}
        animationType="slide"
        onRequestClose={() => setActionOpen(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                {actionOpen ? actionLabels[actionOpen] : ''}
              </Text>
              <Pressable
                onPress={() => setActionOpen(null)}
                style={styles.sheetCloseBtn}
                hitSlop={8}>
                <Icon name="close" size={22} color={PALETTE.ink} />
              </Pressable>
            </View>

            <TextInput
              value={actionText}
              onChangeText={setActionText}
              multiline
              placeholder={
                actionOpen
                  ? actionPlaceholders[actionOpen]
                  : 'Add details...'
              }
              placeholderTextColor={PALETTE.muted}
              style={styles.sheetInput}
            />

            <Pressable
              disabled={!actionOpen || revise.isPending}
              onPress={() =>
                actionOpen && revise.mutate(actionOpen)
              }
              style={[
                styles.sheetSubmit,
                revise.isPending && styles.btnDisabled,
              ]}>
              <Text style={styles.sheetSubmitText}>
                {revise.isPending ? 'Sending...' : 'Send'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ──────────────────────────────────────
// Detail Row Component
// ──────────────────────────────────────
function DetailRow({
  icon,
  label,
  value,
  multiline,
}: {
  icon: string;
  label: string;
  value?: string;
  multiline?: boolean;
}) {
  if (!value) return null;

  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>
        <Icon name={icon} size={16} color={PALETTE.muted} />
      </View>
      <View style={styles.detailContent}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text
          style={styles.detailValue}
          numberOfLines={multiline ? undefined : 2}>
          {value}
        </Text>
      </View>
    </View>
  );
}

// ──────────────────────────────────────
// Styles
// ──────────────────────────────────────
const styles = StyleSheet.create({
  screen: {
    backgroundColor: PALETTE.background,
    flex: 1,
  },

  // ── Header ──
  header: {
    alignItems: 'center',
    backgroundColor: PALETTE.surface,
    flexDirection: 'row',
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xxl,
    ...shadow,
  },
  headerBtn: {
    alignItems: 'center',
    borderRadius: radii.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  headerTitle: {
    color: PALETTE.ink,
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },

  content: {
    padding: spacing.lg,
  },

  // ── Hero Card ──
  heroCard: {
    backgroundColor: PALETTE.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    ...shadow,
  },
  statusBadge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: 5,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: PALETTE.ink,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.3,
    lineHeight: 28,
  },
  heroSupplier: {
    color: PALETTE.muted,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6,
  },

  // ── Price Box ──
  priceBox: {
    backgroundColor: PALETTE.primaryLight,
    borderRadius: radii.md,
    marginTop: spacing.lg,
    padding: spacing.md,
  },
  priceLabel: {
    color: PALETTE.primary,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  priceValue: {
    color: PALETTE.primaryDark,
    fontSize: 26,
    fontWeight: '900',
    marginTop: 2,
  },
  priceUnit: {
    color: PALETTE.primary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  pricePending: {
    color: PALETTE.muted,
    fontSize: 15,
    fontWeight: '600',
    fontStyle: 'italic',
    marginTop: spacing.lg,
  },

  // ── Action Row ──
  actionRow: {
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  acceptBtn: {
    alignItems: 'center',
    backgroundColor: PALETTE.emerald,
    borderRadius: radii.lg,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingVertical: 16,
    shadowColor: PALETTE.emerald,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  acceptBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  secondaryBtn: {
    alignItems: 'center',
    backgroundColor: PALETTE.surface,
    borderRadius: radii.lg,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    paddingVertical: 14,
    ...shadow,
  },
  secondaryBtnText: {
    color: PALETTE.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  dangerBtn: {
    alignItems: 'center',
    backgroundColor: PALETTE.surface,
    borderRadius: radii.lg,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    paddingVertical: 14,
    ...shadow,
  },
  dangerBtnText: {
    color: PALETTE.rose,
    fontSize: 13,
    fontWeight: '800',
  },
  btnDisabled: {
    opacity: 0.45,
  },

  // ── Info / Warning Banners ──
  infoBanner: {
    alignItems: 'center',
    backgroundColor: PALETTE.primaryLight,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
    padding: spacing.md,
  },
  infoBannerText: {
    color: PALETTE.text,
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },
  warningBanner: {
    alignItems: 'center',
    backgroundColor: '#FFF0F0',
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  warningBannerText: {
    color: PALETTE.rose,
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },

  // ── Quick Links ──
  quickLinks: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  quickLink: {
    alignItems: 'center',
    backgroundColor: PALETTE.surface,
    borderRadius: radii.lg,
    flex: 1,
    gap: 8,
    paddingVertical: spacing.md,
    ...shadow,
  },
  quickLinkIcon: {
    alignItems: 'center',
    backgroundColor: PALETTE.primaryLight,
    borderRadius: radii.md,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  quickLinkText: {
    color: PALETTE.primary,
    fontSize: 11,
    fontWeight: '800',
  },

  // ── Section Card ──
  sectionCard: {
    backgroundColor: PALETTE.surface,
    borderRadius: radii.lg,
    marginTop: spacing.lg,
    padding: spacing.lg,
    ...shadow,
  },
  sectionTitle: {
    color: PALETTE.ink,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginBottom: spacing.md,
  },

  // ── Detail Row ──
  detailRow: {
    borderTopColor: PALETTE.faint,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  detailIcon: {
    alignItems: 'center',
    backgroundColor: PALETTE.cardMuted,
    borderRadius: radii.sm,
    height: 32,
    justifyContent: 'center',
    marginTop: 2,
    width: 32,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    color: PALETTE.muted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  detailValue: {
    color: PALETTE.text,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
    marginTop: 2,
  },

  // ── Modal Sheet ──
  modalBackdrop: {
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: PALETTE.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: PALETTE.faint,
    borderRadius: 2,
    height: 4,
    marginTop: spacing.md,
    width: 36,
  },
  sheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },
  sheetTitle: {
    color: PALETTE.ink,
    flex: 1,
    fontSize: 18,
    fontWeight: '900',
  },
  sheetCloseBtn: {
    alignItems: 'center',
    backgroundColor: PALETTE.cardMuted,
    borderRadius: radii.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  sheetInput: {
    backgroundColor: PALETTE.cardMuted,
    borderRadius: radii.md,
    color: PALETTE.ink,
    fontSize: 14,
    fontWeight: '600',
    marginHorizontal: spacing.lg,
    minHeight: 120,
    padding: spacing.md,
    textAlignVertical: 'top',
  },
  sheetSubmit: {
    alignItems: 'center',
    backgroundColor: PALETTE.primary,
    borderRadius: radii.lg,
    justifyContent: 'center',
    margin: spacing.lg,
    minHeight: 50,
    shadowColor: PALETTE.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  sheetSubmitText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },

  bottomSpacer: {
    height: 40,
  },
});

export default QuotationDetailsScreen;