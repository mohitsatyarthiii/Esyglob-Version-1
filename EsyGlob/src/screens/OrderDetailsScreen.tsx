import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { fetchOrderDetails, updateOrderStatus } from '../api/marketplace';
import { Order } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import RemoteImage from '../components/RemoteImage';
import { ErrorState, LoadingState } from '../components/StateViews';
import { colors, radii, shadow, spacing } from '../theme';
import { formatValue } from '../utils/display';
import { firstImage } from '../utils/images';

const sellerNextStatuses = ['confirmed', 'processing', 'production', 'ready_to_ship', 'shipped', 'delivered', 'completed'];

function OrderDetailsScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { activeRole } = useAuth();
  const { orderId } = route.params as { orderId: string };
  const [trackingNumber, setTrackingNumber] = useState('');
  const [notes, setNotes] = useState('');
  const order = useQuery({
    queryKey: ['order-details', orderId],
    queryFn: () => fetchOrderDetails(orderId),
    enabled: Boolean(orderId),
  });
  const update = useMutation({
    mutationFn: (status: string) => updateOrderStatus(orderId, { status, trackingNumber, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order-details', orderId] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      Alert.alert('Order updated', 'The order timeline was updated.');
    },
    onError: error => Alert.alert('Update failed', error instanceof Error ? error.message : 'Unable to update order.'),
  });

  const item = order.data;
  const product = useMemo(() => (item ? getOrderProduct(item) : null), [item]);

  if (order.isLoading) {
    return <LoadingState label="Loading order" />;
  }

  if (order.isError || !item) {
    return <ErrorState message={(order.error as Error)?.message ?? 'Order was not returned.'} onRetry={() => order.refetch()} />;
  }

  const canManage = activeRole === 'seller';
  const productName = String(product?.name ?? product?.title ?? 'Order item');
  const image = firstImage(product?.image as string | undefined, product?.images as string[] | undefined);
  const selectedLogistics = asRecord(item.selectedLogistics);
  const shipping = asRecord(item.shippingAddress);
  const seller = asRecord(item.sellerId);
  const buyer = asRecord(item.buyerId);
  const services = Array.isArray(item.platformServices) ? item.platformServices : Array.isArray(item.automatedServices) ? item.automatedServices : [];

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconButton}>
          <Icon name="arrow-left" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Order details</Text>
        <View style={styles.iconButton} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.heroTitleBlock}>
              <Text numberOfLines={1} style={styles.orderNumber}>{item.orderNumber ?? orderId}</Text>
              <Text style={styles.status}>{String(item.status ?? 'pending').replace(/_/g, ' ')}</Text>
            </View>
            <Text style={styles.total}>{item.currency ?? 'INR'} {String(item.totalAmount ?? item.totalPrice ?? 'pending')}</Text>
          </View>
          <View style={styles.productRow}>
            <RemoteImage
              uri={image}
              width={152}
              height={152}
              style={styles.productImage}
              fallback={<Icon name="package-variant-closed" size={28} color={colors.muted} />}
            />
            <View style={styles.productBody}>
              <Text numberOfLines={2} style={styles.productName}>{productName}</Text>
              <InfoLine label="Quantity" value={item.quantity} />
              <InfoLine label="Order type" value={`${item.orderType ?? 'bulk'} / ${item.orderSubType ?? 'trade_order'}`} />
              <InfoLine label="Payment" value={item.paymentStatus ?? 'pending'} />
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Payment and logistics</Text>
          <InfoGrid
            items={[
              ['Product total', money(item.currency, item.productTotal ?? item.subtotal ?? item.merchandiseAmount)],
              ['Logistics', money(item.currency, item.logisticsCharges ?? item.logisticsAmount ?? item.shippingCost)],
              ['Platform fee', money(item.currency, item.platformFee)],
              ['GST', money(item.currency, item.gstAmount ?? item.taxAmount)],
              ['Grand total', money(item.currency, item.grandTotal ?? item.totalAmount)],
              ['Shipping method', selectedLogistics?.name ?? item.shippingMethod ?? item.logisticsOption],
            ]}
          />
          <InfoLine label="ETA" value={selectedLogistics?.eta ?? item.estimatedDeliveryDate} />
          <InfoLine label="Tracking" value={item.trackingNumber} />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Trade parties</Text>
          <InfoLine label="Buyer" value={buyer?.name ?? buyer?.fullName ?? buyer?.email ?? item.buyerId} />
          <InfoLine label="Supplier" value={seller?.companyName ?? seller?.businessName ?? seller?.displayName ?? item.sellerId} />
          <InfoLine label="Destination" value={[shipping?.city, shipping?.state, shipping?.country, shipping?.postalCode].filter(Boolean).join(', ')} />
        </View>

        {services.length ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Platform services</Text>
            <View style={styles.serviceWrap}>
              {services.map((service, index) => {
                const record = asRecord(service);
                const label = String(record?.name ?? record?.code ?? `Service ${index + 1}`).replace(/_/g, ' ');
                return (
                  <View key={`${label}-${index}`} style={styles.servicePill}>
                    <Icon name="shield-check-outline" size={15} color={colors.green} />
                    <Text style={styles.serviceText}>{label}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {item.timeline?.length ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Timeline</Text>
            {item.timeline.map((event, index) => (
              <View key={index} style={styles.timelineRow}>
                <View style={styles.dot} />
                <Text style={styles.timelineText}>{timelineLabel(event)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {canManage ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Seller shipment update</Text>
            <TextInput value={trackingNumber} onChangeText={setTrackingNumber} placeholder="Tracking number" placeholderTextColor={colors.muted} style={styles.input} />
            <TextInput value={notes} onChangeText={setNotes} placeholder="Notes" placeholderTextColor={colors.muted} style={styles.input} />
            <View style={styles.statusGrid}>
              {sellerNextStatuses.map(status => (
                <Pressable key={status} disabled={update.isPending} onPress={() => update.mutate(status)} style={[styles.statusButton, update.isPending && styles.disabled]}>
                  <Text style={styles.statusButtonText}>{status.replace(/_/g, ' ')}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function InfoGrid({ items }: { items: Array<[string, unknown]> }) {
  return (
    <View style={styles.infoGrid}>
      {items.map(([label, value]) => (
        <View key={label} style={styles.infoTile}>
          <Text style={styles.infoLabel}>{label}</Text>
          <Text numberOfLines={2} style={styles.infoValue}>{display(value)}</Text>
        </View>
      ))}
    </View>
  );
}

function InfoLine({ label, value }: { label: string; value: unknown }) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return (
    <View style={styles.infoLine}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.lineValue}>{display(value)}</Text>
    </View>
  );
}

function getOrderProduct(order: Order) {
  const product = Array.isArray(order.products) && order.products.length ? order.products[0] : order.productId;
  return asRecord(product);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function display(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return 'Pending';
  }

  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }

  return formatValue(value);
}

function money(currency: unknown, value: unknown) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  return `${String(currency ?? 'INR')} ${String(value)}`;
}

function timelineLabel(event: Record<string, unknown>) {
  return String(event.message ?? event.status ?? event.title ?? formatValue(event)).replace(/_/g, ' ');
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
  hero: { backgroundColor: colors.card, borderRadius: radii.md, marginBottom: spacing.lg, padding: spacing.lg, ...shadow },
  heroTop: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  heroTitleBlock: { flex: 1 },
  orderNumber: { color: colors.ink, fontSize: 21, fontWeight: '900' },
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
    textTransform: 'capitalize',
  },
  total: { color: colors.primaryDark, fontSize: 18, fontWeight: '900', textAlign: 'right' },
  productRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  productImage: { backgroundColor: colors.cardMuted, borderRadius: radii.sm, height: 76, width: 76 },
  productBody: { flex: 1 },
  productName: { color: colors.ink, fontSize: 16, fontWeight: '900', lineHeight: 21, marginBottom: spacing.xs },
  card: { backgroundColor: colors.card, borderRadius: radii.md, marginBottom: spacing.lg, padding: spacing.lg },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: '900', marginBottom: spacing.md },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  infoTile: { backgroundColor: colors.cardMuted, borderRadius: radii.sm, flexBasis: '48%', flexGrow: 1, minHeight: 66, padding: spacing.md },
  infoLabel: { color: colors.muted, fontSize: 11, fontWeight: '900', marginBottom: spacing.xs, textTransform: 'uppercase' },
  infoValue: { color: colors.ink, fontSize: 14, fontWeight: '900', lineHeight: 18 },
  infoLine: { borderTopColor: colors.faint, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.md, marginTop: spacing.md },
  lineValue: { color: colors.text, fontSize: 14, fontWeight: '800', lineHeight: 20 },
  serviceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  servicePill: { alignItems: 'center', backgroundColor: '#f0faf6', borderRadius: radii.pill, flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  serviceText: { color: colors.green, fontSize: 12, fontWeight: '900', textTransform: 'capitalize' },
  timelineRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  dot: { backgroundColor: colors.primary, borderRadius: radii.pill, height: 10, marginTop: 5, width: 10 },
  timelineText: { color: colors.text, flex: 1, fontSize: 13, fontWeight: '800', lineHeight: 20 },
  input: { backgroundColor: colors.cardMuted, borderRadius: radii.md, color: colors.ink, fontSize: 14, fontWeight: '800', marginBottom: spacing.md, minHeight: 44, paddingHorizontal: spacing.md },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statusButton: { backgroundColor: colors.ink, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  disabled: { opacity: 0.55 },
  statusButtonText: { color: '#fff', fontSize: 12, fontWeight: '900', textTransform: 'capitalize' },
});

export default OrderDetailsScreen;
