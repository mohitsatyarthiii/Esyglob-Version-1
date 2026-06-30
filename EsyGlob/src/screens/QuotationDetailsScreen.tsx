import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { acceptQuotation, fetchQuotationDetails, patchQuotation } from '../api/marketplace';
import { colors, radii, spacing } from '../theme';
import { formatValue } from '../utils/display';

function QuotationDetailsScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { quotationId } = route.params as { quotationId: string };
  const quotation = useQuery({
    queryKey: ['quotation-details', quotationId],
    queryFn: () => fetchQuotationDetails(quotationId),
    enabled: Boolean(quotationId),
  });
  const accept = useMutation({
    mutationFn: () => acceptQuotation(quotationId),
    onSuccess: result => {
      queryClient.invalidateQueries({ queryKey: ['quotation-details', quotationId] });
      const orderId = typeof result.orderId === 'string' ? result.orderId : result.orderId?._id;
      Alert.alert('Quotation accepted', orderId ? 'The backend created an order.' : 'Quotation status was updated.');
      if (orderId) {
        navigation.navigate('OrderDetails', { orderId });
      }
    },
    onError: error => Alert.alert('Accept failed', error instanceof Error ? error.message : 'Unable to accept quotation.'),
  });
  const revise = useMutation({
    mutationFn: (action: 'request_revision' | 'counter_offer') => patchQuotation(quotationId, {
      action,
      reason: action === 'counter_offer' ? 'Buyer requested a counter offer from mobile.' : 'Buyer requested quotation revision from mobile.',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotation-details', quotationId] });
      Alert.alert('Sent', 'The quotation negotiation was updated.');
    },
    onError: error => Alert.alert('Update failed', error instanceof Error ? error.message : 'Unable to update quotation.'),
  });

  if (quotation.isLoading) {
    return <Text style={styles.centerText}>Loading quotation...</Text>;
  }

  if (quotation.isError || !quotation.data) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerText}>{(quotation.error as Error)?.message ?? 'Quotation was not returned.'}</Text>
        <Pressable onPress={() => quotation.refetch()} style={styles.retryButton}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const item = quotation.data;
  const seller = typeof item.sellerId === 'object' ? item.sellerId : undefined;
  const product = typeof item.productId === 'object' ? item.productId : undefined;
  const rfq = typeof item.rfqId === 'object' ? item.rfqId : undefined;
  const title = item.title ?? product?.name ?? rfq?.title ?? 'Quotation';
  const chatId = typeof item.chatId === 'string' ? item.chatId : item.chatId?._id;
  const orderId = typeof item.orderId === 'string' ? item.orderId : item.orderId?._id;
  const nextProductId = typeof item.productId === 'string' ? item.productId : item.productId?._id;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconButton}>
          <Icon name="arrow-left" size={24} color={colors.ink} />
        </Pressable>
        <Text numberOfLines={1} style={styles.headerTitle}>Quotation</Text>
        <View style={styles.iconButton} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.status}>{item.status ?? 'sent'}</Text>
          <Text style={styles.price}>{item.totalPrice ?? item.unitPrice ? `${item.currency ?? ''} ${item.totalPrice ?? item.unitPrice}` : 'Price on request'}</Text>
          {seller ? <Text style={styles.meta}>{seller.companyName ?? seller.businessName ?? seller.displayName}</Text> : null}
        </View>

        <View style={styles.actions}>
          <Pressable disabled={accept.isPending} onPress={() => accept.mutate()} style={styles.primaryAction}>
            <Icon name="check-circle-outline" size={18} color="#fff" />
            <Text style={styles.primaryActionText}>Accept</Text>
          </Pressable>
          <Pressable disabled={revise.isPending} onPress={() => revise.mutate('request_revision')} style={styles.secondaryAction}>
            <Text style={styles.secondaryActionText}>Reject / revise</Text>
          </Pressable>
          <Pressable disabled={revise.isPending} onPress={() => revise.mutate('counter_offer')} style={styles.secondaryAction}>
            <Text style={styles.secondaryActionText}>Counter</Text>
          </Pressable>
        </View>

        <View style={styles.actions}>
          {chatId ? (
            <Pressable onPress={() => navigation.navigate('ChatDetails', { chatId, title })} style={styles.linkAction}>
              <Icon name="message-text-outline" size={17} color={colors.primaryDark} />
              <Text style={styles.linkActionText}>Related chat</Text>
            </Pressable>
          ) : null}
          {orderId ? (
            <Pressable onPress={() => navigation.navigate('OrderDetails', { orderId })} style={styles.linkAction}>
              <Icon name="clipboard-list-outline" size={17} color={colors.primaryDark} />
              <Text style={styles.linkActionText}>Order</Text>
            </Pressable>
          ) : null}
          {nextProductId ? (
            <Pressable onPress={() => navigation.navigate('OrderCheckout', { mode: 'trade', quotationId, productId: nextProductId })} style={styles.linkAction}>
              <Icon name="cart-arrow-right" size={17} color={colors.primaryDark} />
              <Text style={styles.linkActionText}>Create order</Text>
            </Pressable>
          ) : null}
        </View>

        <Info title="Quotation details" value={item} />
        {rfq ? <Info title="RFQ" value={rfq} /> : null}
        {product ? <Info title="Product" value={product} /> : null}
        {seller ? <Info title="Supplier" value={seller} /> : null}
      </ScrollView>
    </View>
  );
}

function Info({ title, value }: { title: string; value: unknown }) {
  const text = formatValue(value);

  if (!text) {
    return null;
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.description}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
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
  iconButton: {
    alignItems: 'center',
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  headerTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  hero: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.lg,
  },
  title: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 29,
  },
  status: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff8f3',
    borderRadius: radii.pill,
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '900',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    textTransform: 'uppercase',
  },
  price: {
    color: colors.primaryDark,
    fontSize: 22,
    fontWeight: '900',
    marginTop: spacing.md,
  },
  meta: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  section: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    marginBottom: spacing.lg,
    padding: spacing.lg,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  primaryAction: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.lg,
  },
  primaryActionText: {
    color: '#fff',
    fontWeight: '900',
  },
  secondaryAction: {
    alignItems: 'center',
    backgroundColor: '#fff8f3',
    borderRadius: radii.pill,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.lg,
  },
  secondaryActionText: {
    color: colors.primaryDark,
    fontWeight: '900',
  },
  linkAction: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 42,
    paddingHorizontal: spacing.md,
  },
  linkActionText: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '900',
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '900',
  },
  description: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 22,
    marginTop: spacing.sm,
  },
  center: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  centerText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800',
    padding: spacing.xl,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  retryText: {
    color: '#fff',
    fontWeight: '900',
  },
});

export default QuotationDetailsScreen;
