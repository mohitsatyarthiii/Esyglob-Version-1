import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQuery } from '@tanstack/react-query';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
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

type RouteParams = {
  mode: 'sample' | 'trade';
  productId?: string;
  chatId?: string;
  quotationId?: string;
};

function OrderCheckoutScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { mode, productId, chatId, quotationId } = route.params as RouteParams;
  const [quantity, setQuantity] = useState(mode === 'sample' ? '1' : '100');
  const [country, setCountry] = useState('India');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [notes, setNotes] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [logisticsOption, setLogisticsOption] = useState('esyglob_standard');

  const quotation = useQuery({
    queryKey: ['checkout-quotation', quotationId],
    queryFn: () => fetchQuotationDetails(quotationId as string),
    enabled: Boolean(quotationId),
  });
  const resolvedProductId = productId ?? (typeof quotation.data?.productId === 'string' ? quotation.data.productId : quotation.data?.productId?._id);
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
  const quoteInput = useMemo(() => {
    const selectedProductId = resolvedProductId;

    if (!selectedProductId) {
      return null;
    }

    return {
      productId: selectedProductId,
      quantity: Number(quantity) || 1,
      orderType: mode === 'sample' ? 'sample' : 'bulk',
      orderSubType: mode === 'sample' ? 'sample_order' : chatId ? 'chat_order' : quotationId ? 'trade_order' : 'direct_order',
      logisticsOption,
      destination: {
        country,
        city,
        postalCode,
      },
    };
  }, [chatId, country, city, logisticsOption, mode, postalCode, quantity, quotationId, resolvedProductId]);
  const quote = useQuery({
    queryKey: ['checkout-quote', quoteInput],
    queryFn: () => calculateCheckoutQuote(quoteInput as Record<string, unknown>),
    enabled: Boolean(quoteInput),
  });
  const createOrder = useMutation({
    mutationFn: async () => {
      if (!resolvedProductId) {
        throw new Error('Product is required before creating an order.');
      }

      if (!termsAccepted) {
        throw new Error('Accept the order terms before continuing.');
      }

      const base = {
        productId: resolvedProductId,
        quantity: Number(quantity) || 1,
        shippingAddress: {
          country,
          city,
          postalCode,
        },
        logisticsOption,
        termsAccepted,
        notes,
      };

      if (mode === 'sample') {
        return createSampleOrder(base);
      }

      return createTradeOrder({
        ...base,
        quotationId,
        rfqId: typeof quotation.data?.rfqId === 'string' ? quotation.data.rfqId : quotation.data?.rfqId?._id,
        chatId,
        orderType: 'bulk',
        orderSubType: chatId ? 'chat_order' : quotationId ? 'trade_order' : 'direct_order',
        buyerCompany: {},
        sellerCompany: {},
        tradeInformation: {
          incoterms: 'FOB',
          logisticsOption,
          deliveryTerms: notes,
        },
        paymentRequired: true,
      });
    },
    onSuccess: async order => {
      const orderId = getId(order);
      try {
        const payment = await initiateOrderPayment(orderId);
        await verifyOrderPayment({
          paymentId: payment.paymentId,
          razorpayPaymentId: `mobile_${Date.now()}`,
          razorpayOrderId: payment.razorpayOrderId,
          razorpaySignature: 'mobile-development-verification',
        });
        Alert.alert('Order paid', 'Payment was verified and the order timeline was updated.');
      } catch (error) {
        Alert.alert('Order created', error instanceof Error ? error.message : 'Payment initiation needs attention.');
      }
      navigation.replace('OrderDetails', { orderId });
    },
    onError: error => Alert.alert('Order failed', error instanceof Error ? error.message : 'Unable to create order.'),
  });

  if ((quotationId && quotation.isLoading) || product.isLoading || (chatId && chat.isLoading)) {
    return <LoadingState label="Preparing checkout" />;
  }

  if ((quotationId && quotation.isError) || product.isError || (chatId && chat.isError)) {
    const error = quotation.error ?? product.error ?? chat.error;
    return <ErrorState message={(error as Error)?.message ?? 'Checkout data was not returned.'} onRetry={() => {
      quotation.refetch();
      product.refetch();
      chat.refetch();
    }} />;
  }

  const productData = product.data as Product | undefined;
  const eligible = !chatId || chat.data?.chat?.orderEligibility?.some(item => {
    const nextProductId = typeof item.productId === 'string' ? item.productId : item.productId?._id;
    return item.isActive && nextProductId === resolvedProductId;
  });

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconButton}>
          <Icon name="arrow-left" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>{mode === 'sample' ? 'Sample order' : 'Trade order'}</Text>
        <View style={styles.iconButton} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {!eligible ? (
          <View style={styles.warning}>
            <Icon name="lock-alert-outline" size={20} color={colors.rose} />
            <Text style={styles.warningText}>Start Order is not active for this product in the selected conversation.</Text>
          </View>
        ) : null}
        <View style={styles.card}>
          <Text style={styles.title}>{productData?.name ?? productData?.title ?? quotation.data?.title ?? 'Order item'}</Text>
          <Text style={styles.price}>{productData ? formatProductPrice(productData) : 'Price from quotation'}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Order details</Text>
          <Field label="Quantity" value={quantity} onChangeText={setQuantity} keyboardType="numeric" />
          <Field label="Destination country" value={country} onChangeText={setCountry} />
          <Field label="City" value={city} onChangeText={setCity} />
          <Field label="Postal code" value={postalCode} onChangeText={setPostalCode} />
          <Field label="Notes / delivery terms" value={notes} onChangeText={setNotes} multiline />
          <Pressable onPress={() => setTermsAccepted(value => !value)} style={styles.checkboxRow}>
            <Icon name={termsAccepted ? 'checkbox-marked' : 'checkbox-blank-outline'} size={22} color={termsAccepted ? colors.primary : colors.muted} />
            <Text style={styles.checkboxText}>I accept the order, payment, and trade terms.</Text>
          </Pressable>
        </View>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Checkout quote</Text>
          {quote.isLoading ? <Text style={styles.meta}>Calculating...</Text> : null}
          {quote.isError ? <Text style={styles.errorText}>{(quote.error as Error).message}</Text> : null}
          {quote.data ? (
            <>
              <Text style={styles.total}>{quote.data.currency ?? productData?.currency ?? 'INR'} {quote.data.totalAmount ?? quote.data.total ?? quote.data.subtotal ?? 'pending'}</Text>
              <Text style={styles.meta}>Logistics: {logisticsOption.replace(/_/g, ' ')}</Text>
              <View style={styles.logisticsList}>
                {(quote.data.logisticsOptions ?? []).map(option => {
                  const record = option as typeof option & { key?: string };
                  const key = option.id ?? option.code ?? record.key ?? option.name ?? 'esyglob_standard';
                  const amount = option.amount ?? option.price ?? 0;
                  return (
                    <Pressable key={String(key)} onPress={() => setLogisticsOption(String(key))} style={[styles.logisticsOption, logisticsOption === key && styles.logisticsOptionActive]}>
                      <Text style={[styles.logisticsTitle, logisticsOption === key && styles.logisticsTitleActive]}>{String(option.name ?? key).replace(/_/g, ' ')}</Text>
                      <Text style={[styles.logisticsMeta, logisticsOption === key && styles.logisticsMetaActive]}>{quote.data?.currency ?? productData?.currency ?? 'INR'} {String(amount)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}
        </View>
        <Pressable disabled={!eligible || createOrder.isPending} onPress={() => createOrder.mutate()} style={[styles.primaryAction, (!eligible || createOrder.isPending) && styles.disabled]}>
          <Icon name="credit-card-check-outline" size={19} color="#fff" />
          <Text style={styles.primaryActionText}>{createOrder.isPending ? 'Creating order...' : 'Create order and pay'}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} style={styles.input} {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  header: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderBottomColor: colors.faint,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xxl,
  },
  iconButton: { alignItems: 'center', height: 42, justifyContent: 'center', width: 42 },
  headerTitle: { color: colors.ink, flex: 1, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  card: { backgroundColor: colors.card, borderRadius: radii.md, marginBottom: spacing.lg, padding: spacing.lg },
  title: { color: colors.ink, fontSize: 20, fontWeight: '900', lineHeight: 26 },
  price: { color: colors.primaryDark, fontSize: 18, fontWeight: '900', marginTop: spacing.sm },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: '900', marginBottom: spacing.md },
  field: { marginBottom: spacing.md },
  label: { color: colors.muted, fontSize: 12, fontWeight: '900', marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.cardMuted,
    borderRadius: radii.md,
    color: colors.ink,
    fontSize: 14,
    fontWeight: '800',
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  checkboxRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  checkboxText: { color: colors.text, flex: 1, fontSize: 13, fontWeight: '800', lineHeight: 19 },
  warning: { alignItems: 'center', backgroundColor: '#fff1f2', borderRadius: radii.md, flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md, padding: spacing.md },
  warningText: { color: colors.rose, flex: 1, fontSize: 13, fontWeight: '900' },
  meta: { color: colors.muted, fontSize: 13, fontWeight: '800', marginTop: spacing.xs },
  logisticsList: { gap: spacing.sm, marginTop: spacing.md },
  logisticsOption: { borderColor: colors.faint, borderRadius: radii.md, borderWidth: 1, padding: spacing.md },
  logisticsOptionActive: { backgroundColor: '#fff8f3', borderColor: colors.primary },
  logisticsTitle: { color: colors.ink, fontSize: 13, fontWeight: '900', textTransform: 'capitalize' },
  logisticsTitleActive: { color: colors.primaryDark },
  logisticsMeta: { color: colors.muted, fontSize: 12, fontWeight: '800', marginTop: 3 },
  logisticsMetaActive: { color: colors.primaryDark },
  total: { color: colors.ink, fontSize: 22, fontWeight: '900' },
  errorText: { color: colors.rose, fontSize: 13, fontWeight: '800' },
  primaryAction: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.pill, flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', minHeight: 50 },
  primaryActionText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  disabled: { opacity: 0.45 },
});

export default OrderCheckoutScreen;
