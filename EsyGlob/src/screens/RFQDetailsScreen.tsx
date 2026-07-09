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
import { createQuotation, fetchRFQDetails, patchQuotation } from '../api/marketplace';
import { Quotation, RFQ } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { radii, shadow, spacing } from '../theme';
import { getId } from '../utils/format';

// ──────────────────────────────────────
// Utility helpers
// ──────────────────────────────────────
function safeDate(value: unknown): string {
  if (!value) return '';
  const date = new Date(value as string);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

function safeString(value: unknown, fallback: string = ''): string {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  if (typeof value === 'number') return String(value);
  return fallback;
}

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

const contactPattern =
  /(\+?\d[\d\s().-]{7,}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|https?:\/\/|www\.)/i;

// ──────────────────────────────────────
// Status config
// ──────────────────────────────────────
const STATUS_CONFIG: Record<
  string,
  { bg: string; color: string; icon: string; label: string }
> = {
  active: { bg: '#E8F8EE', color: '#00B578', icon: 'pulse', label: 'Active' },
  draft: {
    bg: '#F5F5F5',
    color: '#8C8C8C',
    icon: 'pencil-outline',
    label: 'Draft',
  },
  quoted: {
    bg: '#FFF3E8',
    color: '#FF6A00',
    icon: 'cash-multiple',
    label: 'Quoted',
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
  closed: {
    bg: '#FFF0F0',
    color: '#FF3B30',
    icon: 'close-circle-outline',
    label: 'Closed',
  },
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
};

function getStatusConfig(status: string) {
  return (
    STATUS_CONFIG[status] ?? {
      bg: '#F5F5F5',
      color: '#8C8C8C',
      icon: 'information-outline',
      label: status.replace(/_/g, ' '),
    }
  );
}

// ──────────────────────────────────────
// Main Component
// ──────────────────────────────────────
function RFQDetailsScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { activeRole } = useAuth();
  const { rfqId } = route.params as { rfqId: string };
  const [quoteOpen, setQuoteOpen] = React.useState(false);
  const [quoteForm, setQuoteForm] = React.useState({
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

  const submitQuote = useMutation({
    mutationFn: () => {
      const item = rfq.data?.rfq;
      if (!item) {
        throw new Error('RFQ details are unavailable.');
      }

      return createQuotation({
        rfqId: getId(item),
        productId:
          typeof item.productId === 'string'
            ? item.productId
            : (item.productId as any)?._id,
        title: item.title ?? (item as any).productName ?? 'Quotation',
        suppliedQuantity:
          Number(quoteForm.suppliedQuantity) ||
          Number(item.quantity ?? 1) ||
          1,
        unitPrice: Number(quoteForm.unitPrice) || 0,
        currency: quoteForm.currency || (item as any).currency || 'INR',
        leadTime: quoteForm.leadTime,
        paymentTerms: quoteForm.paymentTerms,
        incoterms: quoteForm.incoterms,
        shippingCost: Number(quoteForm.shippingCost) || 0,
        sellerMessage:
          quoteForm.sellerMessage || 'Quotation submitted from mobile.',
      });
    },
    onSuccess: async quotation => {
      setQuoteOpen(false);
      await queryClient.invalidateQueries({
        queryKey: ['rfq-details', rfqId],
      });
      navigation.navigate('QuotationDetails', {
        quotationId: getId(quotation),
      });
    },
    onError: error =>
      Alert.alert(
        'Quotation failed',
        error instanceof Error ? error.message : 'Unable to submit quotation.',
      ),
  });

  // ── Loading ──
  if (rfq.isLoading) {
    return <LoadingState label="Loading RFQ workspace" />;
  }

  // ── Error ──
  if (rfq.isError || !rfq.data?.rfq) {
    return (
      <ErrorState
        message={
          (rfq.error as Error)?.message ?? 'RFQ was not returned.'
        }
        onRetry={() => rfq.refetch()}
      />
    );
  }

  const item = rfq.data.rfq as RFQ & {
    productName?: string;
    deliveryCountry?: string;
    deliveryTimeline?: string;
    deadline?: string;
    visibility?: string;
    currency?: string;
    customSpecifications?: string;
    customizationRequirements?: string;
    packagingRequirements?: string;
    deliveryRequirements?: string;
    additionalNotes?: string;
    attachments?: string[];
  };
  const sellerView = activeRole === 'seller';
  const title =
    item.title ?? item.productName ?? (item as any).productName ?? 'RFQ';
  const destination =
    (item as any).destinationCountry ??
    (item as any).deliveryCountry ??
    undefined;
  const productId =
    typeof item.productId === 'string'
      ? item.productId
      : (item.productId as any)?._id;
  const statusCfg = getStatusConfig((item as any).status ?? 'active');
  const quotations = (rfq.data as any).quotations ?? [];
  const chats = (rfq.data as any).chats ?? [];
  const timeline = (item as any).deliveryTimeline ?? (item as any).deadline;

  const validateAndQuote = () => {
    const moderated = [
      quoteForm.sellerMessage,
      quoteForm.paymentTerms,
      quoteForm.leadTime,
      quoteForm.incoterms,
    ];
    if (moderated.some(value => contactPattern.test(value))) {
      Alert.alert(
        'Contact information blocked',
        'Do not include direct phone numbers, emails, websites, or links in quotations.',
      );
      return;
    }
    submitQuote.mutate();
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
          {sellerView ? 'RFQ Workspace' : 'RFQ Details'}
        </Text>
        <Pressable
          onPress={() => rfq.refetch()}
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
          {/* Status + icon row */}
          <View style={styles.heroTop}>
            <View style={styles.heroIconWrap}>
              <Icon
                name="clipboard-list-outline"
                size={24}
                color={PALETTE.primary}
              />
            </View>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: statusCfg.bg },
              ]}>
              <Icon name={statusCfg.icon} size={12} color={statusCfg.color} />
              <Text
                style={[
                  styles.statusBadgeText,
                  { color: statusCfg.color },
                ]}>
                {statusCfg.label}
              </Text>
            </View>
          </View>

          {/* Title */}
          <Text style={styles.rfqTitle}>{title}</Text>

          {/* Description — only if it exists */}
          {item.description ? (
            <Text style={styles.rfqDescription} numberOfLines={4}>
              {item.description}
            </Text>
          ) : null}

          {/* Specs grid */}
          <View style={styles.specsGrid}>
            <SpecBadge
              icon="cube-outline"
              label="Quantity"
              value={`${item.quantity ?? '—'} ${(item as any).unit ?? ''}`}
            />
            <SpecBadge
              icon="shape-outline"
              label="Category"
              value={safeString((item as any).category, 'General')}
            />
            {item.targetPrice ? (
              <SpecBadge
                icon="currency-inr"
                label="Target Price"
                value={`${(item as any).currency ?? '₹'} ${Number(item.targetPrice).toLocaleString('en-IN')}`}
              />
            ) : null}
            {destination ? (
              <SpecBadge
                icon="map-marker-outline"
                label="Destination"
                value={destination}
              />
            ) : null}
            {timeline ? (
              <SpecBadge
                icon="clock-outline"
                label="Timeline"
                value={safeString(timeline)}
              />
            ) : null}
          </View>
        </View>

        {/* ── Action Buttons ── */}
        <View style={styles.actionRow}>
          <Pressable
            onPress={() => navigation.navigate('Messages')}
            style={styles.actionBtn}>
            <Icon
              name="message-text-outline"
              size={18}
              color={PALETTE.primary}
            />
            <Text style={styles.actionBtnText}>Messages</Text>
          </Pressable>

          {productId ? (
            <Pressable
              onPress={() =>
                navigation.navigate('ProductDetails', { productId })
              }
              style={styles.actionBtn}>
              <Icon
                name="package-variant-closed"
                size={18}
                color={PALETTE.primary}
              />
              <Text style={styles.actionBtnText}>View Product</Text>
            </Pressable>
          ) : null}

          {sellerView ? (
            <Pressable
              onPress={() => setQuoteOpen(true)}
              style={styles.submitQuoteBtn}>
              <Icon name="cash-multiple" size={18} color="#fff" />
              <Text style={styles.submitQuoteBtnText}>Submit Quote</Text>
            </Pressable>
          ) : null}
        </View>

        {/* ── Requirements Section ── */}
        {item.customSpecifications ||
        item.customizationRequirements ||
        item.packagingRequirements ||
        item.deliveryRequirements ||
        item.additionalNotes ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Requirements</Text>
            {item.customSpecifications ? (
              <RequirementRow
                icon="tune"
                label="Specifications"
                value={item.customSpecifications}
              />
            ) : null}
            {item.customizationRequirements ? (
              <RequirementRow
                icon="brush"
                label="Customization"
                value={item.customizationRequirements}
              />
            ) : null}
            {item.packagingRequirements ? (
              <RequirementRow
                icon="package-variant-closed"
                label="Packaging"
                value={item.packagingRequirements}
              />
            ) : null}
            {item.deliveryRequirements ? (
              <RequirementRow
                icon="truck-fast-outline"
                label="Delivery"
                value={item.deliveryRequirements}
              />
            ) : null}
            {item.additionalNotes ? (
              <RequirementRow
                icon="note-text-outline"
                label="Notes"
                value={item.additionalNotes}
              />
            ) : null}
          </View>
        ) : null}

        {/* ── Attachments ── */}
        {item.attachments?.length ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Attachments</Text>
            {item.attachments.map((uri, index) => (
              <View key={uri} style={styles.attachmentRow}>
                <Icon name="paperclip" size={16} color={PALETTE.sky} />
                <Text style={styles.attachmentText} numberOfLines={1}>
                  Attachment {index + 1}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* ── Quotations Section ── */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>
              {sellerView ? 'Your Quotations' : 'Seller Responses'}
            </Text>
            {quotations.length > 0 ? (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>
                  {quotations.length}
                </Text>
              </View>
            ) : null}
          </View>

          {quotations.length > 0 ? (
            quotations.map((quotation: Quotation) => (
              <QuotationRow
                key={getId(quotation)}
                quotation={quotation}
                rfqId={rfqId}
              />
            ))
          ) : (
            <EmptyState
              title="No quotations yet"
              detail={
                sellerView
                  ? 'Submit a quotation to respond to this RFQ.'
                  : 'Supplier responses will appear here.'
              }
            />
          )}
        </View>

        {/* ── Linked Chats ── */}
        {chats.length > 0 ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Conversations</Text>
            {chats.map((chat: any) => (
              <Pressable
                key={getId(chat)}
                onPress={() =>
                  navigation.navigate('ChatDetails', {
                    chatId: getId(chat),
                    title,
                  })
                }
                style={styles.chatRow}>
                <View style={styles.chatIconWrap}>
                  <Icon
                    name="message-text-outline"
                    size={18}
                    color={PALETTE.primary}
                  />
                </View>
                <View style={styles.chatInfo}>
                  <Text style={styles.chatTitle} numberOfLines={1}>
                    {chat.lastMessage ??
                      chat.chatType ??
                      'Conversation'}
                  </Text>
                  <Text style={styles.chatMeta}>
                    {safeDate(chat.updatedAt ?? chat.createdAt)}
                  </Text>
                </View>
                <Icon
                  name="chevron-right"
                  size={20}
                  color={PALETTE.muted}
                />
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* Bottom spacer */}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* ── Quotation Modal ── */}
      <Modal
        visible={quoteOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setQuoteOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.sheet}>
            {/* Sheet handle */}
            <View style={styles.sheetHandle} />

            {/* Sheet header */}
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Submit Quotation</Text>
              <Pressable
                onPress={() => setQuoteOpen(false)}
                style={styles.sheetCloseBtn}
                hitSlop={8}>
                <Icon name="close" size={22} color={PALETTE.ink} />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              style={styles.sheetScroll}>
              {/* Quantity + Unit Price row */}
              <View style={styles.formRow}>
                <FormField
                  compact
                  label="Quantity"
                  value={
                    quoteForm.suppliedQuantity ||
                    String(item.quantity ?? '')
                  }
                  onChangeText={suppliedQuantity =>
                    setQuoteForm({ ...quoteForm, suppliedQuantity })
                  }
                  keyboardType="numeric"
                  placeholder={String(item.quantity ?? '1')}
                />
                <FormField
                  compact
                  label="Unit Price (₹)"
                  value={quoteForm.unitPrice}
                  onChangeText={unitPrice =>
                    setQuoteForm({ ...quoteForm, unitPrice })
                  }
                  keyboardType="numeric"
                  placeholder="0"
                />
              </View>

              {/* Currency + Shipping row */}
              <View style={styles.formRow}>
                <FormField
                  compact
                  label="Currency"
                  value={quoteForm.currency}
                  onChangeText={currency =>
                    setQuoteForm({ ...quoteForm, currency })
                  }
                  placeholder="INR"
                />
                <FormField
                  compact
                  label="Shipping Cost"
                  value={quoteForm.shippingCost}
                  onChangeText={shippingCost =>
                    setQuoteForm({ ...quoteForm, shippingCost })
                  }
                  keyboardType="numeric"
                  placeholder="0"
                />
              </View>

              <FormField
                label="Lead Time"
                value={quoteForm.leadTime}
                onChangeText={leadTime =>
                  setQuoteForm({ ...quoteForm, leadTime })
                }
                placeholder="e.g. 15 days"
              />
              <FormField
                label="Payment Terms"
                value={quoteForm.paymentTerms}
                onChangeText={paymentTerms =>
                  setQuoteForm({ ...quoteForm, paymentTerms })
                }
                placeholder="e.g. 30% advance"
              />
              <FormField
                label="Incoterms"
                value={quoteForm.incoterms}
                onChangeText={incoterms =>
                  setQuoteForm({ ...quoteForm, incoterms })
                }
                placeholder="e.g. FOB"
              />
              <FormField
                label="Message to Buyer"
                value={quoteForm.sellerMessage}
                onChangeText={sellerMessage =>
                  setQuoteForm({ ...quoteForm, sellerMessage })
                }
                multiline
                placeholder="Introduce your offer, highlight quality, MOQ, certifications..."
              />

              {/* Price preview */}
              {quoteForm.unitPrice && quoteForm.suppliedQuantity ? (
                <View style={styles.pricePreview}>
                  <Text style={styles.pricePreviewLabel}>
                    Total Value
                  </Text>
                  <Text style={styles.pricePreviewValue}>
                    {quoteForm.currency}{' '}
                    {(
                      Number(quoteForm.unitPrice) *
                      (Number(quoteForm.suppliedQuantity) ||
                        Number(item.quantity ?? 1))
                    ).toLocaleString('en-IN')}
                  </Text>
                </View>
              ) : null}

              <Pressable
                disabled={submitQuote.isPending}
                onPress={validateAndQuote}
                style={[
                  styles.submitSheetBtn,
                  submitQuote.isPending && styles.submitSheetBtnDisabled,
                ]}>
                {submitQuote.isPending ? (
                  <Text style={styles.submitSheetBtnText}>
                    Submitting...
                  </Text>
                ) : (
                  <Text style={styles.submitSheetBtnText}>
                    Send Quotation
                  </Text>
                )}
              </Pressable>

              <View style={styles.sheetBottomSpacer} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ──────────────────────────────────────
// Quotation Row
// ──────────────────────────────────────
function QuotationRow({
  quotation,
  rfqId,
}: {
  quotation: Quotation;
  rfqId: string;
}) {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const seller =
    typeof quotation.sellerId === 'object'
      ? (quotation.sellerId as any)
      : undefined;
  const title =
    quotation.title ??
    seller?.companyName ??
    seller?.businessName ??
    'Quotation';
  const statusCfg = getStatusConfig((quotation as any).status ?? 'submitted');

  const requestRevision = useMutation({
    mutationFn: () =>
      patchQuotation(getId(quotation), {
        action: 'request_revision',
        reason: 'Buyer requested revision from RFQ workspace.',
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['rfq-details', rfqId],
      }),
  });

  return (
    <Pressable
      onPress={() =>
        navigation.navigate('QuotationDetails', {
          quotationId: getId(quotation),
        })
      }
      style={styles.quotationRow}>
      {/* Seller avatar placeholder */}
      <View style={styles.quotationAvatar}>
        <Icon name="cash-multiple" size={20} color={PALETTE.emerald} />
      </View>

      <View style={styles.quotationInfo}>
        <Text style={styles.quotationTitle} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.quotationMetaRow}>
          <View
            style={[
              styles.quotationStatus,
              { backgroundColor: statusCfg.bg },
            ]}>
            <Text
              style={[
                styles.quotationStatusText,
                { color: statusCfg.color },
              ]}>
              {statusCfg.label}
            </Text>
          </View>
          {(quotation as any).totalPrice ? (
            <Text style={styles.quotationPrice}>
              {(quotation as any).currency ?? '₹'}{' '}
              {Number((quotation as any).totalPrice).toLocaleString(
                'en-IN',
              )}
            </Text>
          ) : null}
        </View>
      </View>

      <Pressable
        onPress={() => requestRevision.mutate()}
        style={styles.reviseBtn}
        hitSlop={8}>
        <Text style={styles.reviseBtnText}>Revise</Text>
      </Pressable>

      <Icon name="chevron-right" size={20} color={PALETTE.muted} />
    </Pressable>
  );
}

// ──────────────────────────────────────
// Spec Badge
// ──────────────────────────────────────
function SpecBadge({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.specBadge}>
      <Icon name={icon} size={14} color={PALETTE.muted} />
      <View style={styles.specBadgeContent}>
        <Text style={styles.specBadgeLabel}>{label}</Text>
        <Text style={styles.specBadgeValue} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  );
}

// ──────────────────────────────────────
// Requirement Row
// ──────────────────────────────────────
function RequirementRow({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const isLong = value.length > 80;

  return (
    <Pressable
      onPress={() => isLong && setExpanded(!expanded)}
      style={styles.requirementRow}>
      <View style={styles.requirementIcon}>
        <Icon name={icon} size={16} color={PALETTE.primary} />
      </View>
      <View style={styles.requirementContent}>
        <Text style={styles.requirementLabel}>{label}</Text>
        <Text
          style={styles.requirementValue}
          numberOfLines={expanded ? undefined : 2}>
          {value}
        </Text>
        {isLong ? (
          <Text style={styles.expandText}>
            {expanded ? 'Show less' : 'Show more'}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

// ──────────────────────────────────────
// Form Field
// ──────────────────────────────────────
function FormField({
  label,
  value,
  onChangeText,
  multiline,
  keyboardType,
  compact,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
  keyboardType?: 'default' | 'numeric';
  compact?: boolean;
  placeholder?: string;
}) {
  return (
    <View style={[styles.formField, compact && styles.formFieldCompact]}>
      <Text style={styles.formLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        multiline={multiline}
        placeholder={placeholder}
        placeholderTextColor={PALETTE.muted}
        style={[styles.formInput, multiline && styles.formTextarea]}
      />
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
    paddingBottom: 40,
  },

  // ── Hero Card ──
  heroCard: {
    backgroundColor: PALETTE.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    ...shadow,
  },
  heroTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  heroIconWrap: {
    alignItems: 'center',
    backgroundColor: PALETTE.primaryLight,
    borderRadius: radii.md,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  statusBadge: {
    alignItems: 'center',
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  rfqTitle: {
    color: PALETTE.ink,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.3,
    lineHeight: 28,
  },
  rfqDescription: {
    color: PALETTE.text,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 21,
    marginTop: spacing.sm,
  },

  // ── Specs Grid ──
  specsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  specBadge: {
    alignItems: 'center',
    backgroundColor: PALETTE.cardMuted,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    width: '47%',
  },
  specBadgeContent: {
    flex: 1,
  },
  specBadgeLabel: {
    color: PALETTE.muted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  specBadgeValue: {
    color: PALETTE.ink,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
  },

  // ── Action Row ──
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  actionBtn: {
    alignItems: 'center',
    backgroundColor: PALETTE.surface,
    borderRadius: radii.lg,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...shadow,
  },
  actionBtnText: {
    color: PALETTE.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  submitQuoteBtn: {
    alignItems: 'center',
    backgroundColor: PALETTE.primary,
    borderRadius: radii.lg,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    paddingVertical: spacing.md,
    shadowColor: PALETTE.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  submitQuoteBtnText: {
    color: '#fff',
    fontSize: 13,
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
  sectionHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: PALETTE.ink,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  countBadge: {
    alignItems: 'center',
    backgroundColor: PALETTE.primaryLight,
    borderRadius: radii.pill,
    justifyContent: 'center',
    minWidth: 24,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  countBadgeText: {
    color: PALETTE.primary,
    fontSize: 12,
    fontWeight: '800',
  },

  // ── Requirements ──
  requirementRow: {
    borderTopColor: PALETTE.faint,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  requirementIcon: {
    alignItems: 'center',
    backgroundColor: PALETTE.primaryLight,
    borderRadius: radii.sm,
    height: 32,
    justifyContent: 'center',
    marginTop: 2,
    width: 32,
  },
  requirementContent: {
    flex: 1,
  },
  requirementLabel: {
    color: PALETTE.muted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  requirementValue: {
    color: PALETTE.text,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
    marginTop: 2,
  },
  expandText: {
    color: PALETTE.primary,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
  },

  // ── Attachments ──
  attachmentRow: {
    alignItems: 'center',
    backgroundColor: PALETTE.cardMuted,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    padding: spacing.md,
  },
  attachmentText: {
    color: PALETTE.sky,
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Quotations ──
  quotationRow: {
    alignItems: 'center',
    borderTopColor: PALETTE.faint,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  quotationAvatar: {
    alignItems: 'center',
    backgroundColor: '#E8F8EE',
    borderRadius: radii.md,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  quotationInfo: {
    flex: 1,
  },
  quotationTitle: {
    color: PALETTE.ink,
    fontSize: 14,
    fontWeight: '800',
  },
  quotationMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: 4,
  },
  quotationStatus: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  quotationStatusText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  quotationPrice: {
    color: PALETTE.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  reviseBtn: {
    backgroundColor: PALETTE.primaryLight,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  reviseBtnText: {
    color: PALETTE.primary,
    fontSize: 11,
    fontWeight: '800',
  },

  // ── Chats ──
  chatRow: {
    alignItems: 'center',
    borderTopColor: PALETTE.faint,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  chatIconWrap: {
    alignItems: 'center',
    backgroundColor: PALETTE.primaryLight,
    borderRadius: radii.md,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  chatInfo: {
    flex: 1,
  },
  chatTitle: {
    color: PALETTE.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  chatMeta: {
    color: PALETTE.muted,
    fontSize: 11,
    fontWeight: '600',
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
    maxHeight: '85%',
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
    fontSize: 20,
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
  sheetScroll: {
    paddingHorizontal: spacing.lg,
  },

  // ── Form ──
  formRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  formField: {
    marginBottom: spacing.md,
  },
  formFieldCompact: {
    flex: 1,
  },
  formLabel: {
    color: PALETTE.muted,
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  formInput: {
    backgroundColor: PALETTE.cardMuted,
    borderRadius: radii.md,
    color: PALETTE.ink,
    fontSize: 15,
    fontWeight: '700',
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  formTextarea: {
    minHeight: 100,
    paddingTop: spacing.md,
    textAlignVertical: 'top',
  },

  // ── Price Preview ──
  pricePreview: {
    backgroundColor: PALETTE.primaryLight,
    borderRadius: radii.md,
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  pricePreviewLabel: {
    color: PALETTE.primary,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  pricePreviewValue: {
    color: PALETTE.primaryDark,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 2,
  },

  // ── Submit Sheet Button ──
  submitSheetBtn: {
    alignItems: 'center',
    backgroundColor: PALETTE.primary,
    borderRadius: radii.lg,
    justifyContent: 'center',
    minHeight: 52,
    shadowColor: PALETTE.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  submitSheetBtnDisabled: {
    opacity: 0.5,
  },
  submitSheetBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },

  sheetBottomSpacer: {
    height: 40,
  },

  bottomSpacer: {
    height: 40,
  },
});

export default RFQDetailsScreen;