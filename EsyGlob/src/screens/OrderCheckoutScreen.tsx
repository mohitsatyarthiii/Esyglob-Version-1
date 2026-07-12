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
          theme: { color: '#FF6B35' },
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
            <Icon name="lock-alert-outline" size={16} color="#EF4444" />
            <Text style={styles.warningText}>Order not available for this product.</Text>
          </View>
        )}

        {/* Product Info - Enhanced */}
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
            <Text style={styles.productDescription} numberOfLines={3}>
              {productData.description}
            </Text>
          )}
          {productData?.specifications && (
            <View style={styles.specs}>
              {Object.entries(productData.specifications).slice(0, 3).map(([key, value]) => (
                <View key={key} style={styles.specItem}>
                  <Text style={styles.specLabel}>{key}</Text>
                  <Text style={styles.specValue}>{String(value)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Order Form */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Delivery Details</Text>
          <Field label="Quantity" value={quantity} onChangeText={setQuantity} keyboardType="numeric" />
          <Field label="Full Name *" value={fullName} onChangeText={setFullName} />
          <Field label="Company" value={company} onChangeText={setCompany} />
          <Field label="Email *" value={email} onChangeText={setEmail} keyboardType="email-address" />
          <Field label="Phone *" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <Field label="Street Address *" value={address} onChangeText={setAddress} multiline />
          <ChoiceField label="Country *" value={country} options={['India', 'United States', 'United Kingdom', 'UAE', 'China', 'Singapore']} onChange={setCountry} />
          <Field label="City *" value={city} onChangeText={setCity} />
          <Field label="State / Province *" value={state} onChangeText={setState} />
          <Field label="Postal Code *" value={postalCode} onChangeText={setPostalCode} />
          
          <ChoiceField label="Payment Method" value={paymentMethod} options={['credit_card', 'bank_transfer', 'escrow', 'letter_of_credit']} onChange={setPaymentMethod} />
          <ChoiceField label="Trade Term" value={incoterm} options={['DAP', 'DDP', 'CIF', 'FOB', 'EXW']} onChange={setIncoterm} />
          <Field label="Notes" value={notes} onChangeText={setNotes} multiline />

          <Pressable onPress={() => setTermsAccepted(v => !v)} style={styles.checkboxRow}>
            <Icon name={termsAccepted ? 'checkbox-marked' : 'checkbox-blank-outline'} size={18} color={termsAccepted ? '#FF6B35' : '#9CA3AF'} />
            <Text style={styles.checkboxText}>I accept the order & payment terms</Text>
          </Pressable>
        </View>

        {/* Quote */}
        {quoteInput && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Quote Summary</Text>

            {quote.isLoading && (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color="#FF6B35" />
                <Text style={styles.loadingText}>Calculating...</Text>
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
                  <BreakdownRow label="Logistics" value={formatINR(quoteData.logisticsCharges ?? 0)} />
                  {quoteData.platformFee ? (
                    <BreakdownRow
                      label={`Payment Processing Fee (${((quoteData.platformFeeRate ?? 0) * 100).toFixed(1)}%)`}
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
                  <View style={styles.divider} />
                  <BreakdownRow label="Grand Total" value={formatINR(quoteData.grandTotal ?? quoteData.totalAmount ?? 0)} isBold />
                </View>

                {/* Logistics Options */}
                {logisticsOptions.length > 0 && (
                  <View style={styles.logisticsSection}>
                    <Text style={styles.logisticsSectionTitle}>Shipping Method</Text>
                    {logisticsOptions.map((option: LogisticsOption, index: number) => {
                      const key = getOptionKey(option, index);
                      const isActive = logisticsOption === key;
                      const amount = option.amount ?? option.price ?? 0;
                      const breakdown = option.internalBreakdown ?? {};

                      return (
                        <Pressable
                          key={key}
                          onPress={() => setLogisticsOption(key)}
                          style={[styles.logisticsCard, isActive && styles.logisticsCardActive]}>
                          {/* Top Row */}
                          <View style={styles.logisticsTopRow}>
                            <View style={styles.logisticsTopLeft}>
                              <Text style={[styles.logisticsName, isActive && styles.logisticsNameActive]}>
                                {getOptionLabel(option)}
                              </Text>
                              {option.incoterm && (
                                <View style={styles.incotermBadge}>
                                  <Text style={styles.incotermText}>{option.incoterm}</Text>
                                </View>
                              )}
                            </View>
                            <View style={styles.logisticsRight}>
                              <Text style={[styles.logisticsPrice, isActive && styles.logisticsPriceActive]}>
                                {formatINR(amount)}
                              </Text>
                              <Icon
                                name={isActive ? 'radiobox-marked' : 'radiobox-blank'}
                                size={18}
                                color={isActive ? '#FF6B35' : '#9CA3AF'}
                              />
                            </View>
                          </View>

                          {/* Shipping Details */}
                          <View style={styles.shippingDetails}>
                            {option.estimatedDelivery && (
                              <View style={styles.shippingDetail}>
                                <Icon name="truck-delivery-outline" size={12} color="#6B7280" />
                                <View>
                                  <Text style={styles.shippingDetailLabel}>Delivery</Text>
                                  <Text style={styles.shippingDetailValue}>{option.estimatedDelivery}</Text>
                                </View>
                              </View>
                            )}
                            {option.insuranceAmount != null && option.insuranceAmount > 0 && (
                              <View style={styles.shippingDetail}>
                                <Icon name="shield-check-outline" size={12} color="#6B7280" />
                                <View>
                                  <Text style={styles.shippingDetailLabel}>Insurance</Text>
                                  <Text style={styles.shippingDetailValue}>{formatINR(option.insuranceAmount)}</Text>
                                </View>
                              </View>
                            )}
                            {(option.warehousingCharges != null && option.warehousingCharges > 0) && (
                              <View style={styles.shippingDetail}>
                                <Icon name="warehouse" size={12} color="#6B7280" />
                                <View>
                                  <Text style={styles.shippingDetailLabel}>Warehousing</Text>
                                  <Text style={styles.shippingDetailValue}>{formatINR(option.warehousingCharges)}</Text>
                                </View>
                              </View>
                            )}
                          </View>

                          {/* Complete Logistics Breakdown - Shows when active */}
                          {isActive && (
                            <View style={styles.costBreakdown}>
                              <Text style={styles.costBreakdownTitle}>Logistics Breakdown</Text>
                              
                              {/* Show all logistics items from internal breakdown */}
                              {Object.entries(breakdown).map(([costKey, costValue]) => (
                                <View key={costKey} style={styles.costRow}>
                                  <Text style={styles.costLabel}>
                                    {costKey.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
                                  </Text>
                                  <Text style={styles.costValue}>{formatINR(costValue)}</Text>
                                </View>
                              ))}
                              
                              {/* Show all additional charges */}
                              {option.handlingCharges != null && option.handlingCharges > 0 && (
                                <View style={styles.costRow}>
                                  <Text style={styles.costLabel}>Handling</Text>
                                  <Text style={styles.costValue}>{formatINR(option.handlingCharges)}</Text>
                                </View>
                              )}
                              {option.documentationCharges != null && option.documentationCharges > 0 && (
                                <View style={styles.costRow}>
                                  <Text style={styles.costLabel}>Documentation</Text>
                                  <Text style={styles.costValue}>{formatINR(option.documentationCharges)}</Text>
                                </View>
                              )}
                              {option.customsCharges != null && option.customsCharges > 0 && (
                                <View style={styles.costRow}>
                                  <Text style={styles.costLabel}>Customs</Text>
                                  <Text style={styles.costValue}>{formatINR(option.customsCharges)}</Text>
                                </View>
                              )}
                              {option.variableCharges != null && option.variableCharges > 0 && (
                                <View style={styles.costRow}>
                                  <Text style={styles.costLabel}>Variable Charges</Text>
                                  <Text style={styles.costValue}>{formatINR(option.variableCharges)}</Text>
                                </View>
                              )}
                            </View>
                          )}

                          {option.providerLabel && (
                            <Text style={styles.providerLabel}>
                              via {option.providerLabel}
                            </Text>
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
              <Icon name="credit-card-check-outline" size={18} color="#fff" />
              <Text style={styles.orderBtnText}>Place Order & Pay</Text>
            </>
          )}
        </Pressable>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

// ─── Field Component ────────────────────────────────────────────────────────

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
            <Text style={[styles.choiceText, value === option && styles.choiceTextActive]}>{option.replace(/_/g, ' ')}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Breakdown Row ──────────────────────────────────────────────────────────

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
  choiceRow: { gap: spacing.sm, paddingVertical: 2 },
  choice: { 
    borderWidth: 1, 
    borderColor: '#D1D5DB', 
    borderRadius: radii.sm, 
    paddingHorizontal: spacing.sm, 
    paddingVertical: spacing.xs, 
    backgroundColor: '#F9FAFB' 
  },
  choiceActive: { 
    borderColor: '#FF6B35', 
    backgroundColor: '#FFF7ED' 
  },
  choiceText: { 
    color: '#6B7280', 
    fontSize: 11, 
    textTransform: 'capitalize',
    fontWeight: '500'
  },
  choiceTextActive: { 
    color: '#FF6B35', 
    fontWeight: '600' 
  },
  bottomSpacer: { height: 40 },
  screen: { flex: 1, backgroundColor: '#F3F4F6' },
  header: {
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth, 
    borderBottomColor: '#E5E7EB',
    paddingTop: spacing.xxl, 
    paddingBottom: spacing.sm, 
    paddingHorizontal: spacing.md,
  },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { 
    flex: 1, 
    fontSize: 15, 
    fontWeight: '600', 
    color: '#111827', 
    textAlign: 'center' 
  },
  content: { padding: spacing.md },

  // Product Card - Enhanced
  productCard: {
    backgroundColor: '#FFFFFF', 
    borderRadius: radii.md, 
    padding: spacing.md,
    marginBottom: spacing.md, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, 
    shadowRadius: 3, 
    elevation: 2,
  },
  productHeader: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  productImage: {
    width: 80,
    height: 80,
    borderRadius: radii.sm,
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
    marginBottom: 4,
  },
  productPrice: { 
    fontSize: 18, 
    fontWeight: '700', 
    color: '#FF6B35',
  },
  productDescription: {
    fontSize: 12,
    color: '#4B5563',
    lineHeight: 16,
    marginTop: spacing.sm,
  },
  specs: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  specItem: {
    flex: 1,
  },
  specLabel: {
    fontSize: 10,
    color: '#9CA3AF',
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  specValue: {
    fontSize: 11,
    color: '#374151',
    fontWeight: '600',
    marginTop: 1,
  },

  // Cards
  card: {
    backgroundColor: '#FFFFFF', 
    borderRadius: radii.md, 
    padding: spacing.md,
    marginBottom: spacing.md, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, 
    shadowRadius: 3, 
    elevation: 2,
  },
  sectionTitle: { 
    fontSize: 13, 
    fontWeight: '600', 
    color: '#111827', 
    marginBottom: spacing.sm 
  },

  // Fields
  field: { marginBottom: spacing.sm },
  label: { 
    fontSize: 10, 
    fontWeight: '600', 
    color: '#6B7280', 
    textTransform: 'uppercase', 
    letterSpacing: 0.5, 
    marginBottom: 3 
  },
  input: {
    backgroundColor: '#F9FAFB', 
    borderRadius: radii.sm, 
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm, 
    fontSize: 13, 
    fontWeight: '500', 
    color: '#111827', 
    minHeight: 40,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  checkboxRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: spacing.sm, 
    marginTop: spacing.xs 
  },
  checkboxText: { 
    flex: 1, 
    fontSize: 12, 
    fontWeight: '500', 
    color: '#4B5563' 
  },

  // Warning
  warning: {
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: spacing.sm, 
    backgroundColor: '#FEF2F2',
    borderRadius: radii.sm, 
    padding: spacing.sm, 
    marginBottom: spacing.md, 
    borderWidth: 1, 
    borderColor: '#FECACA',
  },
  warningText: { 
    flex: 1, 
    fontSize: 11, 
    fontWeight: '500', 
    color: '#DC2626' 
  },

  // Loading
  loadingRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: spacing.sm, 
    paddingVertical: spacing.sm 
  },
  loadingText: { fontSize: 12, color: '#6B7280' },
  errorText: { 
    fontSize: 12, 
    color: '#EF4444', 
    fontWeight: '600', 
    paddingVertical: spacing.sm 
  },

  // Breakdown
  breakdownList: { marginBottom: spacing.sm },
  breakdownRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    paddingVertical: 4 
  },
  breakdownLabel: { 
    fontSize: 12, 
    color: '#4B5563', 
    fontWeight: '500' 
  },
  breakdownValue: { 
    fontSize: 12, 
    color: '#374151', 
    fontWeight: '600' 
  },
  breakdownBold: { 
    fontSize: 14, 
    fontWeight: '700', 
    color: '#111827' 
  },
  discountText: { color: '#059669' },
  divider: { 
    height: 1, 
    backgroundColor: '#E5E7EB', 
    marginVertical: 6 
  },

  // Logistics
  logisticsSection: { marginTop: spacing.sm },
  logisticsSectionTitle: { 
    fontSize: 12, 
    fontWeight: '600', 
    color: '#374151', 
    marginBottom: spacing.xs 
  },
  logisticsCard: {
    borderWidth: 1, 
    borderColor: '#E5E7EB', 
    borderRadius: radii.sm,
    padding: spacing.sm, 
    marginBottom: spacing.xs, 
    backgroundColor: '#F9FAFB',
  },
  logisticsCardActive: { 
    backgroundColor: '#FFF7ED', 
    borderColor: '#FF6B35' 
  },
  logisticsTopRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center' 
  },
  logisticsTopLeft: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: spacing.xs, 
    flex: 1 
  },
  logisticsName: { 
    fontSize: 13, 
    fontWeight: '600', 
    color: '#111827' 
  },
  logisticsNameActive: { color: '#FF6B35' },
  incotermBadge: {
    backgroundColor: '#EFF6FF',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
  },
  incotermText: { 
    fontSize: 9, 
    fontWeight: '600', 
    color: '#3B82F6' 
  },
  logisticsRight: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: spacing.xs 
  },
  logisticsPrice: { 
    fontSize: 13, 
    fontWeight: '600', 
    color: '#374151' 
  },
  logisticsPriceActive: { color: '#FF6B35' },

  // Shipping Details
  shippingDetails: { 
    flexDirection: 'row', 
    gap: spacing.sm, 
    marginTop: spacing.sm, 
    flexWrap: 'wrap' 
  },
  shippingDetail: { 
    flexDirection: 'row', 
    alignItems: 'flex-start', 
    gap: spacing.xs, 
    flex: 1, 
    minWidth: 80 
  },
  shippingDetailLabel: { 
    fontSize: 9, 
    fontWeight: '600', 
    color: '#9CA3AF', 
    textTransform: 'uppercase' 
  },
  shippingDetailValue: { 
    fontSize: 11, 
    fontWeight: '600', 
    color: '#374151', 
    marginTop: 1 
  },

  // Cost Breakdown - Complete logistics breakdown
  costBreakdown: {
    marginTop: spacing.sm, 
    paddingTop: spacing.sm, 
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  costBreakdownTitle: { 
    fontSize: 10, 
    fontWeight: '600', 
    color: '#6B7280', 
    marginBottom: spacing.xs, 
    textTransform: 'uppercase' 
  },
  costRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    paddingVertical: 3 
  },
  costLabel: { 
    fontSize: 11, 
    color: '#4B5563', 
    textTransform: 'capitalize',
    fontWeight: '500'
  },
  costValue: { 
    fontSize: 11, 
    fontWeight: '600', 
    color: '#374151' 
  },

  // Provider
  providerLabel: { 
    fontSize: 9, 
    color: '#9CA3AF', 
    marginTop: spacing.xs, 
    fontStyle: 'italic' 
  },

  // Order Button
  orderBtn: {
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    gap: spacing.xs,
    backgroundColor: '#FF6B35', 
    borderRadius: radii.pill, 
    minHeight: 48,
    shadowColor: '#FF6B35', 
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, 
    shadowRadius: 8, 
    elevation: 4,
  },
  orderBtnDisabled: { opacity: 0.5 },
  orderBtnText: { 
    color: '#fff', 
    fontSize: 14, 
    fontWeight: '600' 
  },
});

export default OrderCheckoutScreen;