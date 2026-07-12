import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQuery } from '@tanstack/react-query';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import RazorpayCheckout from 'react-native-razorpay';
import {
  calculateCheckoutQuote,
  createSampleOrder,
  createTradeOrder,
  fetchChatDetails,
  fetchProductDetails,
  fetchQuotationDetails,
  initiateOrderPayment,
  verifyOrderPayment,
} from '../api/marketplace';
import { Product } from '../api/types';
import { ErrorState, LoadingState } from '../components/StateViews';
import { colors, radii, spacing } from '../theme';
import { formatProductPrice, getId } from '../utils/format';

// ─── Types ──────────────────────────────────────────────────────────────────

type RouteParams = {
  mode: 'sample' | 'trade';
  productId?: string;
  chatId?: string;
  quotationId?: string;
};

type LogisticsOption = {
  key?: string;
  id?: string;
  code?: string;
  label?: string;
  name?: string;
  mode?: string;
  incoterm?: string;
  eta?: string;
  estimatedDelivery?: string;
  amount?: number;
  price?: number;
  buyerLabel?: string;
  available?: boolean;
  insuranceAmount?: number;
  warehousingCharges?: number;
  customsCharges?: number;
  handlingCharges?: number;
  documentationCharges?: number;
  variableCharges?: number;
  internalBreakdown?: Record<string, number>;
  providerLabel?: string;
};

type QuoteData = {
  currency?: string;
  quantity?: number;
  unitPrice?: number;
  productTotal?: number;
  logisticsOptions?: LogisticsOption[];
  selectedLogistics?: LogisticsOption | null;
  logisticsCharges?: number;
  platformFee?: number;
  platformFeeRate?: number;
  gstRate?: number;
  gstAmount?: number;
  discount?: number;
  grandTotal?: number;
  subtotal?: number;
  totalAmount?: number;
  automatedServices?: Array<{ key: string; label: string; status: string; amount: number }>;
};

// ─── Constants ──────────────────────────────────────────────────────────────

const CHARGE_LABELS: Record<string, string> = {
  logistics: 'Logistics',
  insurance: 'Insurance',
  warehousing: 'Warehousing',
  taxation: 'Taxes & Duties',
  handling: 'Safety & Handling',
  documentation: 'Documentation',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function resolveQuotationProductId(quotation: any): string | undefined {
  if (!quotation) return undefined;
  if (typeof quotation.productId === 'string') return quotation.productId;
  return quotation.productId?._id;
}

function resolveOrderEligibility(chat: any, productId?: string): boolean {
  if (!chat?.orderEligibility?.length) return true;
  return chat.orderEligibility.some((item: any) => {
    const itemProductId = typeof item.productId === 'string' ? item.productId : item.productId?._id;
    return item.isActive && itemProductId === productId;
  });
}

function formatINR(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

function getOptionKey(option: LogisticsOption, index: number): string {
  return String(option.key ?? option.id ?? option.code ?? `option-${index}`);
}

function getOptionLabel(option: LogisticsOption): string {
  return String(option.label ?? option.name ?? option.key ?? 'Standard Shipping');
}

// ─── Component ──────────────────────────────────────────────────────────────

function OrderCheckoutScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { mode, productId, chatId, quotationId } = route.params as RouteParams;
  const [quantity, setQuantity] = useState(mode === 'sample' ? '1' : '100');
  const [country, setCountry] = useState('India');
  const [fullName, setFullName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [notes, setNotes] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [logisticsOption, setLogisticsOption] = useState('esyglob_standard');
  const [paymentMethod, setPaymentMethod] = useState('credit_card');
  const [incoterm, setIncoterm] = useState('DAP');

  // ── Queries ────────────────────────────────────────────────────────────

  const quotation = useQuery({
    queryKey: ['checkout-quotation', quotationId],
    queryFn: () => fetchQuotationDetails(quotationId as string),
    enabled: Boolean(quotationId),
  });

  const resolvedProductId = productId ?? resolveQuotationProductId(quotation.data);

  const product = useQuery({
    queryKey: ['checkout-product', resolvedProductId],
    queryFn: () => fetchProductDetails(resolvedProductId as string),
    enabled: Boolean(resolvedProductId),
  });

  const chat = useQuery({
    queryKey: ['checkout-chat', chatId],
    queryFn: () => fetchChatDetails(chatId as string, { markRead: false }),
    enabled: Boolean(chatId),
  });

  // ── Quote Input ────────────────────────────────────────────────────────

  const quoteInput = useMemo(() => {
    if (!resolvedProductId) return null;
    return {
      productId: resolvedProductId,
      quantity: Number(quantity) || 1,
      orderType: mode === 'sample' ? 'sample' : 'bulk',
      orderSubType: mode === 'sample'
        ? 'sample_order'
        : chatId
        ? 'chat_order'
        : quotationId
        ? 'trade_order'
        : 'direct_order',
      logisticsOption,
      destination: { country, city, postalCode },
    };
  }, [resolvedProductId, quantity, mode, chatId, quotationId, logisticsOption, country, city, postalCode]);

  const quote = useQuery({
    queryKey: ['checkout-quote', quoteInput],
    queryFn: () => calculateCheckoutQuote(quoteInput as any),
    enabled: Boolean(quoteInput?.productId),
  });

  // ── Create Order ───────────────────────────────────────────────────────

  const createOrder = useMutation({
    mutationFn: async () => {
      if (!resolvedProductId) throw new Error('Product is required.');
      if (!termsAccepted) throw new Error('Please accept the terms.');
      if (!fullName.trim() || !email.trim() || !phone.trim() || !address.trim() || !city.trim() || !state.trim() || !postalCode.trim()) {
        throw new Error('Please complete all required delivery details.');
      }

      const shippingAddress = { fullName, name: fullName, company, email, phone, address, country, city, state, postalCode, zipCode: postalCode };

      const basePayload = {
        productId: resolvedProductId,
        quantity: Number(quantity) || 1,
        destination: { country, city, postalCode },
        shippingAddress,
        logisticsOption,
        paymentMethod,
        buyerCompany: company ? { companyName: company } : undefined,
        tradeInformation: { incoterms: incoterm, shippingOption: logisticsOption },
        notes: notes || undefined,
        termsAccepted,
      };

      if (mode === 'sample') {
        return createSampleOrder({ ...basePayload, orderType: 'sample', orderSubType: 'sample_order' });
      }

      return createTradeOrder({
        ...basePayload,
        quotationId: quotationId || undefined,
        chatId: chatId || undefined,
        orderType: 'bulk',
        orderSubType: chatId ? 'chat_order' : quotationId ? 'trade_order' : 'direct_order',
      });
    },
    onSuccess: async (order: any) => {
      const orderId = getId(order);
      try {
        const payment = await initiateOrderPayment(orderId);
        if (!payment.keyId || !payment.razorpayOrderId || !payment.amount || !payment.paymentId) {
          throw new Error('Payment gateway did not return a complete checkout session.');
        }
        const gateway = await RazorpayCheckout.open({
          key: payment.keyId,
          amount: payment.amount,
          currency: payment.currency ?? 'INR',
          name: 'EsyGlob',
          description: `Payment for ${payment.orderNumber ?? 'order'}`,
          order_id: payment.razorpayOrderId,
          theme: { color: '#2563EB' },
        });
        await verifyOrderPayment({
          paymentId: payment.paymentId,
          razorpayPaymentId: gateway.razorpay_payment_id,
          razorpayOrderId: gateway.razorpay_order_id,
          razorpaySignature: gateway.razorpay_signature,
        });
        Alert.alert('Order Confirmed!', 'Payment verified.', [
          { text: 'View Order', onPress: () => navigation.replace('OrderDetails', { orderId }) },
        ]);
      } catch {
        Alert.alert('Order Created', 'Payment pending.', [
          { text: 'View Order', onPress: () => navigation.replace('OrderDetails', { orderId }) },
        ]);
      }
    },
    onError: (error: any) =>
      Alert.alert('Order Failed', error instanceof Error ? error.message : 'Please try again.'),
  });

  // ── Loading / Error ────────────────────────────────────────────────────

  if ((quotationId && quotation.isLoading) || product.isLoading || (chatId && chat.isLoading)) {
    return <LoadingState label="Preparing checkout..." />;
  }

  if ((quotationId && quotation.isError) || product.isError || (chatId && chat.isError)) {
    const error = quotation.error ?? product.error ?? chat.error;
    return (
      <ErrorState
        message={(error as Error)?.message ?? 'Failed to load checkout.'}
        onRetry={() => { quotation.refetch(); product.refetch(); chat.refetch(); }}
      />
    );
  }

  // ── Derived Data ───────────────────────────────────────────────────────

  const productData = product.data as Product | undefined;
  const isEligible = chatId ? resolveOrderEligibility(chat.data?.chat, resolvedProductId) : true;
  const quoteData: QuoteData = quote.data?.quote ?? quote.data ?? {};
  const logisticsOptions: LogisticsOption[] = quoteData.logisticsOptions ?? [];

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <Icon name="arrow-left" size={20} color="#1F2937" />
        </Pressable>
        <Text style={styles.headerTitle}>{mode === 'sample' ? 'Sample Order' : 'Checkout'}</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Not Eligible */}
        {!isEligible && (
          <View style={styles.warning}>
            <Icon name="alert-circle-outline" size={16} color="#EF4444" />
            <Text style={styles.warningText}>Order not available for this product.</Text>
          </View>
        )}

        {/* Product Card */}
        <View style={styles.productCard}>
          <View style={styles.productHeader}>
            {productData?.image && (
              <Image source={{ uri: productData.image }} style={styles.productImage} />
            )}
            <View style={styles.productInfo}>
              <Text style={styles.productTitle} numberOfLines={2}>
                {productData?.name ?? productData?.title ?? 'Product'}
              </Text>
              <Text style={styles.productCategory}>
                {productData?.category ?? 'Industrial Supply'}
              </Text>
              <Text style={styles.productPrice}>
                {productData ? formatProductPrice(productData) : ''}
              </Text>
            </View>
          </View>
          {productData?.description && (
            <Text style={styles.productDescription} numberOfLines={2}>
              {productData.description}
            </Text>
          )}
        </View>

        {/* Delivery Details */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Delivery Details</Text>
          <Field label="Full Name *" value={fullName} onChangeText={setFullName} />
          <Field label="Company" value={company} onChangeText={setCompany} />
          <Field label="Email *" value={email} onChangeText={setEmail} keyboardType="email-address" />
          <Field label="Phone *" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <Field label="Address *" value={address} onChangeText={setAddress} multiline />
          <View style={styles.row}>
            <View style={styles.flex1}>
              <Field label="City *" value={city} onChangeText={setCity} />
            </View>
            <View style={styles.flex1}>
              <Field label="State *" value={state} onChangeText={setState} />
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.flex1}>
              <Field label="Postal Code *" value={postalCode} onChangeText={setPostalCode} />
            </View>
            <View style={styles.flex1}>
              <ChoiceField label="Country *" value={country} options={['India', 'USA', 'UK', 'UAE', 'China', 'Singapore']} onChange={setCountry} />
            </View>
          </View>
          
          <View style={styles.divider} />
          
          <Text style={styles.sectionTitle}>Order Settings</Text>
          <Field label="Quantity" value={quantity} onChangeText={setQuantity} keyboardType="numeric" />
          <ChoiceField label="Payment Method" value={paymentMethod} options={['credit_card', 'bank_transfer', 'escrow', 'letter_of_credit']} onChange={setPaymentMethod} />
          <ChoiceField label="Trade Term" value={incoterm} options={['DAP', 'DDP', 'CIF', 'FOB', 'EXW']} onChange={setIncoterm} />
          <Field label="Notes (Optional)" value={notes} onChangeText={setNotes} multiline />

          <Pressable onPress={() => setTermsAccepted(v => !v)} style={styles.checkboxRow}>
            <Icon name={termsAccepted ? 'checkbox-marked' : 'checkbox-blank-outline'} size={18} color={termsAccepted ? '#2563EB' : '#9CA3AF'} />
            <Text style={styles.checkboxText}>I accept the order & payment terms</Text>
          </Pressable>
        </View>

        {/* Quote Summary */}
        {quoteInput && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Quote Summary</Text>

            {quote.isLoading && (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color="#2563EB" />
                <Text style={styles.loadingText}>Calculating quote...</Text>
              </View>
            )}

            {quote.isError && (
              <Text style={styles.errorText}>{(quote.error as Error)?.message ?? 'Quote failed'}</Text>
            )}

            {quoteData.totalAmount != null && (
              <>
                {/* Price Breakdown */}
                <View style={styles.breakdownList}>
                  <BreakdownRow label="Product Total" value={formatINR(quoteData.productTotal ?? 0)} />
                  <BreakdownRow label="Shipping" value={formatINR(quoteData.logisticsCharges ?? 0)} />
                  {quoteData.platformFee ? (
                    <BreakdownRow
                      label="Payment Processing Fee"
                      value={formatINR(quoteData.platformFee)}
                    />
                  ) : null}
                  {quoteData.gstAmount ? (
                    <BreakdownRow
                      label={`GST (${((quoteData.gstRate ?? 0) * 100).toFixed(0)}%)`}
                      value={formatINR(quoteData.gstAmount)}
                    />
                  ) : null}
                  {quoteData.discount ? (
                    <BreakdownRow label="Discount" value={`-${formatINR(quoteData.discount)}`} isDiscount />
                  ) : null}
                  <View style={styles.totalDivider} />
                  <BreakdownRow label="Grand Total" value={formatINR(quoteData.grandTotal ?? quoteData.totalAmount ?? 0)} isBold />
                </View>

                {/* Shipping Methods */}
                {logisticsOptions.length > 0 && (
                  <View style={styles.shippingSection}>
                    <Text style={styles.shippingSectionTitle}>Shipping Method</Text>
                    
                    {logisticsOptions.map((option: LogisticsOption, index: number) => {
                      const key = getOptionKey(option, index);
                      const isActive = logisticsOption === key;
                      const amount = option.amount ?? option.price ?? 0;
                      const breakdown = option.internalBreakdown ?? {};

                      return (
                        <Pressable
                          key={key}
                          onPress={() => setLogisticsOption(key)}
                          style={[styles.shippingCard, isActive && styles.shippingCardActive]}>
                          
                          {/* Header */}
                          <View style={styles.shippingHeader}>
                            <View style={styles.shippingInfo}>
                              <Text style={[styles.shippingName, isActive && styles.shippingNameActive]}>
                                {getOptionLabel(option)}
                              </Text>
                              <View style={styles.tags}>
                                <View style={styles.tag}>
                                  <Text style={styles.tagText}>{option.incoterm}</Text>
                                </View>
                                <View style={styles.tag}>
                                  <Icon name="clock-outline" size={10} color="#6B7280" />
                                  <Text style={styles.tagText}>{option.eta}</Text>
                                </View>
                              </View>
                            </View>
                            <View style={styles.shippingPriceBlock}>
                              <Text style={[styles.shippingPrice, isActive && styles.shippingPriceActive]}>
                                {formatINR(amount)}
                              </Text>
                              <Icon
                                name={isActive ? 'radiobox-marked' : 'radiobox-blank'}
                                size={18}
                                color={isActive ? '#2563EB' : '#D1D5DB'}
                              />
                            </View>
                          </View>

                          {/* Charges Grid - B2B Style */}
                          {isActive && Object.keys(breakdown).length > 0 && (
                            <View style={styles.chargesGrid}>
                              <Text style={styles.chargesTitle}>Cost Breakdown</Text>
                              <View style={styles.chargesList}>
                                {Object.entries(breakdown).map(([costKey, costValue]) => (
                                  <View key={costKey} style={styles.chargeItem}>
                                    <Text style={styles.chargeLabel}>
                                      {CHARGE_LABELS[costKey] || costKey}
                                    </Text>
                                    <Text style={styles.chargeValue}>
                                      {formatINR(Number(costValue))}
                                    </Text>
                                  </View>
                                ))}
                              </View>
                              <View style={styles.chargeTotal}>
                                <Text style={styles.chargeTotalLabel}>Total</Text>
                                <Text style={styles.chargeTotalValue}>{formatINR(amount)}</Text>
                              </View>
                            </View>
                          )}

                          {option.providerLabel && (
                            <Text style={styles.providerText}>{option.providerLabel}</Text>
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </>
            )}
          </View>
        )}

        {/* Place Order */}
        <Pressable
          disabled={!isEligible || createOrder.isPending}
          onPress={() => createOrder.mutate()}
          style={[styles.orderBtn, (!isEligible || createOrder.isPending) && styles.orderBtnDisabled]}>
          {createOrder.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Icon name="shield-check-outline" size={18} color="#fff" />
              <Text style={styles.orderBtnText}>Confirm & Pay Securely</Text>
            </>
          )}
        </Pressable>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

// ─── Field Components ───────────────────────────────────────────────────────

function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor="#9CA3AF" style={styles.input} {...props} />
    </View>
  );
}

function ChoiceField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
        {options.map(option => (
          <Pressable key={option} onPress={() => onChange(option)} style={[styles.choice, value === option && styles.choiceActive]}>
            <Text style={[styles.choiceText, value === option && styles.choiceTextActive]}>
              {option.replace(/_/g, ' ')}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function BreakdownRow({ label, value, isBold, isDiscount }: { label: string; value: string; isBold?: boolean; isDiscount?: boolean }) {
  return (
    <View style={styles.breakdownRow}>
      <Text style={[styles.breakdownLabel, isBold && styles.breakdownBold]}>{label}</Text>
      <Text style={[styles.breakdownValue, isBold && styles.breakdownBold, isDiscount && styles.discountText]}>
        {value}
      </Text>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Layout
  screen: { flex: 1, backgroundColor: '#F3F4F6' },
  content: { padding: 12 },
  bottomSpacer: { height: 40 },
  row: { flexDirection: 'row', gap: 12 },
  flex1: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, 
    borderBottomColor: '#E5E7EB',
    paddingTop: 48, 
    paddingBottom: 12, 
    paddingHorizontal: 16,
  },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { 
    flex: 1, 
    fontSize: 16, 
    fontWeight: '600', 
    color: '#111827', 
    textAlign: 'center',
    letterSpacing: -0.3,
  },

  // Product Card
  productCard: {
    backgroundColor: '#FFFFFF', 
    borderRadius: 10, 
    padding: 14,
    marginBottom: 10, 
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  productHeader: {
    flexDirection: 'row',
    gap: 12,
  },
  productImage: {
    width: 72,
    height: 72,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  productInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  productTitle: { 
    fontSize: 14, 
    fontWeight: '600', 
    color: '#111827', 
    lineHeight: 18,
    marginBottom: 2,
  },
  productCategory: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
    marginBottom: 6,
  },
  productPrice: { 
    fontSize: 20, 
    fontWeight: '700', 
    color: '#2563EB',
  },
  productDescription: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 16,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },

  // Cards
  card: {
    backgroundColor: '#FFFFFF', 
    borderRadius: 10, 
    padding: 14,
    marginBottom: 10, 
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sectionTitle: { 
    fontSize: 13, 
    fontWeight: '600', 
    color: '#111827', 
    marginBottom: 12,
    letterSpacing: -0.2,
  },

  // Fields
  field: { marginBottom: 10 },
  label: { 
    fontSize: 11, 
    fontWeight: '600', 
    color: '#374151', 
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#F9FAFB', 
    borderRadius: 8, 
    paddingHorizontal: 12,
    paddingVertical: 10, 
    fontSize: 13, 
    fontWeight: '500', 
    color: '#111827', 
    minHeight: 42,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  choiceRow: { gap: 6, paddingVertical: 2 },
  choice: { 
    borderWidth: 1, 
    borderColor: '#D1D5DB', 
    borderRadius: 6, 
    paddingHorizontal: 10, 
    paddingVertical: 6, 
    backgroundColor: '#F9FAFB',
  },
  choiceActive: { 
    borderColor: '#2563EB', 
    backgroundColor: '#EFF6FF',
  },
  choiceText: { 
    color: '#6B7280', 
    fontSize: 11, 
    textTransform: 'capitalize',
    fontWeight: '500',
  },
  choiceTextActive: { 
    color: '#2563EB', 
    fontWeight: '600',
  },
  checkboxRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 8, 
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  checkboxText: { 
    flex: 1, 
    fontSize: 12, 
    fontWeight: '500', 
    color: '#374151',
  },

  // Warning
  warning: {
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 8, 
    backgroundColor: '#FEF2F2',
    borderRadius: 8, 
    padding: 10, 
    marginBottom: 10, 
    borderWidth: 1, 
    borderColor: '#FECACA',
  },
  warningText: { 
    flex: 1, 
    fontSize: 12, 
    fontWeight: '500', 
    color: '#DC2626',
  },

  // Loading
  loadingRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 8, 
    paddingVertical: 12,
  },
  loadingText: { fontSize: 12, color: '#6B7280' },
  errorText: { 
    fontSize: 12, 
    color: '#EF4444', 
    fontWeight: '500', 
    paddingVertical: 8,
  },

  // Breakdown
  breakdownList: { marginBottom: 14 },
  breakdownRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    paddingVertical: 5,
  },
  breakdownLabel: { 
    fontSize: 12, 
    color: '#4B5563', 
    fontWeight: '500',
  },
  breakdownValue: { 
    fontSize: 12, 
    color: '#111827', 
    fontWeight: '600',
  },
  breakdownBold: { 
    fontSize: 14, 
    fontWeight: '700', 
    color: '#111827',
  },
  discountText: { color: '#059669' },
  divider: { 
    height: 1, 
    backgroundColor: '#E5E7EB', 
    marginVertical: 10,
  },
  totalDivider: { 
    height: 1, 
    backgroundColor: '#D1D5DB', 
    marginVertical: 8,
  },

  // Shipping Section
  shippingSection: { marginTop: 14 },
  shippingSectionTitle: { 
    fontSize: 12, 
    fontWeight: '600', 
    color: '#374151', 
    marginBottom: 8,
  },
  shippingCard: {
    borderWidth: 1, 
    borderColor: '#E5E7EB', 
    borderRadius: 8,
    padding: 12, 
    marginBottom: 8, 
    backgroundColor: '#FFFFFF',
  },
  shippingCardActive: { 
    backgroundColor: '#EFF6FF', 
    borderColor: '#2563EB',
    borderWidth: 1.5,
  },
  shippingHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'flex-start',
  },
  shippingInfo: { 
    flex: 1, 
    marginRight: 12,
  },
  shippingName: { 
    fontSize: 13, 
    fontWeight: '600', 
    color: '#111827',
    marginBottom: 4,
  },
  shippingNameActive: { 
    color: '#1E40AF',
  },
  tags: {
    flexDirection: 'row',
    gap: 4,
    flexWrap: 'wrap',
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#6B7280',
  },
  shippingPriceBlock: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 8,
  },
  shippingPrice: { 
    fontSize: 14, 
    fontWeight: '700', 
    color: '#111827',
  },
  shippingPriceActive: { 
    color: '#1E40AF',
  },

  // Charges Grid
  chargesGrid: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  chargesTitle: {
    fontSize: 10,
    fontWeight: '600',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  chargesList: {
    gap: 4,
  },
  chargeItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  chargeLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#4B5563',
  },
  chargeValue: {
    fontSize: 11,
    fontWeight: '600',
    color: '#111827',
  },
  chargeTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 6,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  chargeTotalLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#111827',
  },
  chargeTotalValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  providerText: { 
    fontSize: 10, 
    color: '#9CA3AF', 
    marginTop: 8,
    textAlign: 'right',
  },

  // Order Button
  orderBtn: {
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    gap: 8,
    backgroundColor: '#2563EB', 
    borderRadius: 10, 
    minHeight: 50,
    shadowColor: '#2563EB', 
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, 
    shadowRadius: 8, 
    elevation: 4,
    marginTop: 4,
  },
  orderBtnDisabled: { opacity: 0.6 },
  orderBtnText: { 
    color: '#FFFFFF', 
    fontSize: 15, 
    fontWeight: '600',
    letterSpacing: -0.2,
  },
});

export default OrderCheckoutScreen;