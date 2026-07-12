import React, { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { fetchOrders } from '../api/marketplace';
import { Order } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import RemoteImage from '../components/RemoteImage';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { colors, radii, spacing } from '../theme';
import { formatValue } from '../utils/display';
import { getId } from '../utils/format';
import { firstImage } from '../utils/images';
import { useCurrency } from '../currency/CurrencyContext';

const buyerFilters = [
  { label: 'All', status: undefined, orderType: undefined },
  { label: 'Pending Payment', status: 'pending_payment', orderType: undefined },
  { label: 'Confirmed', status: 'payment_confirmed', orderType: undefined },
  { label: 'Processing', status: 'processing', orderType: undefined },
  { label: 'Production', status: 'production', orderType: undefined },
  { label: 'Ready to Ship', status: 'ready_to_ship', orderType: undefined },
  { label: 'Shipped', status: 'shipped', orderType: undefined },
  { label: 'Delivered', status: 'delivered', orderType: undefined },
  { label: 'Completed', status: 'completed', orderType: undefined },
  { label: 'Cancelled', status: 'cancelled', orderType: undefined },
  { label: 'Sample Orders', status: undefined, orderType: 'sample' },
  { label: 'Trade Orders', status: undefined, orderType: 'bulk' },
];
const sellerFilters = [
  { label: 'New Orders', status: 'pending_payment', orderType: undefined },
  { label: 'Pending', status: 'pending_approval', orderType: undefined },
  { label: 'Confirmed', status: 'payment_confirmed', orderType: undefined },
  { label: 'Processing', status: 'processing', orderType: undefined },
  { label: 'Production', status: 'production', orderType: undefined },
  { label: 'Ready', status: 'ready_to_ship', orderType: undefined },
  { label: 'Shipped', status: 'shipped', orderType: undefined },
  { label: 'Delivered', status: 'delivered', orderType: undefined },
  { label: 'Completed', status: 'completed', orderType: undefined },
  { label: 'Cancelled', status: 'cancelled', orderType: undefined },
  { label: 'Sample Orders', status: undefined, orderType: 'sample' },
  { label: 'Trade Orders', status: undefined, orderType: 'bulk' },
];

function OrdersScreen() {
  const navigation = useNavigation<any>();
  const { activeRole } = useAuth();
  const role = activeRole === 'seller' ? 'seller' : 'buyer';
  const filters = role === 'seller' ? sellerFilters : buyerFilters;
  const [filterIndex, setFilterIndex] = useState(0);
  const [q, setQ] = useState('');
  const selectedFilter = filters[filterIndex] ?? filters[0];
  const orders = useQuery({
    queryKey: ['orders', role, selectedFilter.status, selectedFilter.orderType, q.trim()],
    queryFn: () => fetchOrders({
      type: role,
      status: selectedFilter.status,
      orderType: selectedFilter.orderType,
      q: q.trim() || undefined,
    }),
  });

  if (orders.isLoading) {
    return <LoadingState label={`Loading ${role} orders`} />;
  }

  if (orders.isError) {
    return <ErrorState message={(orders.error as Error)?.message ?? 'Orders were not returned.'} onRetry={() => orders.refetch()} />;
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconButton}>
          <Icon name="arrow-left" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>{role === 'seller' ? 'Seller Orders' : 'Buyer Orders'}</Text>
        <View style={styles.iconButton} />
      </View>
      <FlatList
        data={orders.data ?? []}
        keyExtractor={item => getId(item)}
        refreshControl={<RefreshControl refreshing={orders.isRefetching} onRefresh={() => orders.refetch()} />}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            <View style={styles.searchBox}>
              <Icon name="magnify" size={20} color={colors.muted} />
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder="Search order number, product, buyer, seller"
                placeholderTextColor={colors.muted}
                style={styles.searchInput}
              />
            </View>
            <FilterRow items={filters.map(item => item.label)} value={selectedFilter.label} onChange={label => setFilterIndex(Math.max(filters.findIndex(item => item.label === label), 0))} />
          </View>
        }
        ListEmptyComponent={<EmptyState title="No orders found" detail="Orders matching this role and filter will appear here." />}
        renderItem={({ item }) => <OrderCard order={item} onPress={() => navigation.navigate('OrderDetails', { orderId: getId(item) })} />}
      />
    </View>
  );
}

function FilterRow({ items, value, onChange }: { items: string[]; value: string; onChange: (value: string) => void }) {
  return (
    <FlatList
      horizontal
      showsHorizontalScrollIndicator={false}
      data={items}
      keyExtractor={item => item}
      contentContainerStyle={styles.filterRow}
      renderItem={({ item }) => (
        <Pressable onPress={() => onChange(item)} style={[styles.filterChip, value === item && styles.filterChipActive]}>
          <Text style={[styles.filterText, value === item && styles.filterTextActive]}>{item.replace(/_/g, ' ')}</Text>
        </Pressable>
      )}
    />
  );
}

function OrderCard({ order, onPress }: { order: Order; onPress: () => void }) {
  const { formatPrice } = useCurrency();
  const product = getOrderProduct(order);
  const productRecord = isRecord(product) ? product : null;
  const productName = String(productRecord?.name ?? productRecord?.title ?? 'Order item');
  const image = productRecord ? firstImage(productRecord.image as string | undefined, productRecord.images as string[] | undefined) : null;

  return (
    <Pressable onPress={onPress} style={styles.card}>
      <View style={styles.cardTop}>
        <Text numberOfLines={1} style={styles.orderNumber}>{order.orderNumber ?? getId(order)}</Text>
        <Text style={styles.status}>{(order.status ?? 'pending').replace(/_/g, ' ')}</Text>
      </View>
      <View style={styles.productRow}>
        <RemoteImage
          uri={image}
          width={132}
          height={132}
          style={styles.productImage}
          fallback={<Icon name="package-variant-closed" size={26} color={colors.muted} />}
        />
        <View style={styles.productBody}>
          <Text numberOfLines={2} style={styles.productName}>{productName}</Text>
          <Text style={styles.meta}>Type: {order.orderType ?? 'bulk'} / {order.orderSubType ?? 'trade_order'}</Text>
          <Text style={styles.meta}>Payment: {order.paymentStatus ?? 'pending'}</Text>
          <Text style={styles.meta}>Buyer: {formatValue(order.buyerId)}</Text>
          {order.trackingNumber ? <Text style={styles.meta}>Tracking: {order.trackingNumber}</Text> : null}
        </View>
      </View>
      <View style={styles.cardBottom}>
        <Text style={styles.total}>{formatPrice(Number(order.totalAmount ?? order.totalPrice ?? 0), order.currency ?? 'INR')}</Text>
        <Icon name="chevron-right" size={22} color={colors.muted} />
      </View>
    </Pressable>
  );
}

function getOrderProduct(order: Order) {
  if (Array.isArray(order.products) && order.products.length) {
    return order.products[0];
  }

  return order.productId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
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
  content: { padding: spacing.lg, paddingBottom: 120 },
  searchBox: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
    minHeight: 46,
    paddingHorizontal: spacing.md,
  },
  searchInput: { color: colors.ink, flex: 1, fontSize: 14, fontWeight: '700' },
  filterRow: { gap: spacing.sm, paddingBottom: spacing.md },
  filterChip: {
    backgroundColor: colors.card,
    borderColor: colors.faint,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.ink, fontSize: 12, fontWeight: '800', textTransform: 'capitalize' },
  filterTextActive: { color: '#fff' },
  card: { backgroundColor: colors.card, borderRadius: radii.md, marginBottom: spacing.md, padding: spacing.md },
  cardTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  orderNumber: { color: colors.ink, flex: 1, fontSize: 15, fontWeight: '900' },
  status: {
    backgroundColor: '#fff8f3',
    borderRadius: radii.pill,
    color: colors.primaryDark,
    fontSize: 11,
    fontWeight: '900',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    textTransform: 'capitalize',
  },
  productRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  productImage: { backgroundColor: colors.cardMuted, borderRadius: radii.sm, height: 66, width: 66 },
  productBody: { flex: 1 },
  productName: { color: colors.ink, fontSize: 15, fontWeight: '900', lineHeight: 20 },
  meta: { color: colors.muted, fontSize: 12, fontWeight: '800', marginTop: 3 },
  cardBottom: { alignItems: 'center', borderTopColor: colors.faint, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', marginTop: spacing.md, paddingTop: spacing.md },
  total: { color: colors.primaryDark, flex: 1, fontSize: 16, fontWeight: '900' },
});

export default OrdersScreen;
