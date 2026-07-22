import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { addOrderProductionUpdate, buyerOrderAction, fetchOrderDetails, updateOrderStatus } from '../api/marketplace';
import { Order } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import RemoteImage from '../components/RemoteImage';
import { ErrorState, LoadingState } from '../components/StateViews';
import { colors, radii, shadow, spacing } from '../theme';
import { formatValue } from '../utils/display';
import { firstImage } from '../utils/images';
import { useCurrency } from '../currency/CurrencyContext';

const sellerNextStatuses = ['confirmed', 'processing', 'production', 'ready_to_ship', 'shipped', 'delivered', 'completed'];
const productionStages = ['raw_material_procured', 'manufacturing_started', 'manufacturing', 'quality_inspection', 'packaging', 'production_completed'];

function OrderDetailsScreen() {
  const { formatPrice } = useCurrency();
  const displayMoney = (currency: unknown, value: unknown) => value == null ? '' : formatPrice(Number(value), String(currency ?? 'INR'));
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
  const productionUpdate = useMutation({
    mutationFn: (stage: string) => addOrderProductionUpdate(orderId, { stage, note: notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order-details', orderId] });
      Alert.alert('Production updated', 'The buyer timeline and workflow were updated.');
    },
    onError: error => Alert.alert('Update failed', error instanceof Error ? error.message : 'Unable to update production.'),
  });
  const buyerAction = useMutation({
    mutationFn: (action: 'approve' | 'reject_changes' | 'cancel' | 'confirm_delivery') => buyerOrderAction(orderId, { action, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order-details', orderId] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      Alert.alert('Order updated', 'Your response was added to the order timeline.');
    },
    onError: error => Alert.alert('Action failed', error instanceof Error ? error.message : 'Unable to update order.'),
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
  const billing = asRecord(item.billingAddress);
  const seller = asRecord(item.sellerId);
  const buyer = asRecord(item.buyerId);
  const services = Array.isArray(item.platformServices) ? item.platformServices : Array.isArray(item.automatedServices) ? item.automatedServices : [];
  const workflow = asRecord((item as unknown as Record<string, unknown>).workflowSnapshot);
  const allowedNextStages = Array.isArray(workflow?.allowedNextStages) ? workflow.allowedNextStages.map(String) : sellerNextStatuses;
  const orchestration = [
    ['Escrow', 'bank-lock-outline', workflow?.escrow],
    ['Production', 'factory', workflow?.production],
    ['Inspection', 'clipboard-check-outline', workflow?.inspection],
    ['Shipment', 'truck-fast-outline', workflow?.shipment],
    ['Customs', 'passport', workflow?.customs],
    ['Financing', 'finance', workflow?.financing],
    ['Dispute', 'scale-balance', workflow?.dispute],
  ] as Array<[string, string, unknown]>;

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
            <Text style={styles.total}>{displayMoney(item.currency, item.totalAmount ?? item.totalPrice)}</Text>
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

        {workflow ? (
          <View style={styles.workflowCard}>
            <View style={styles.workflowHeader}><View><Text style={styles.workflowEyebrow}>TRADE WORKFLOW</Text><Text style={styles.sectionTitle}>Platform Orchestration</Text></View><Icon name="transit-connection-variant" size={28} color="#2563EB" /></View>
            <InfoGrid items={[["Trade ID", workflow.tradeId], ["Current stage", workflow.currentStage], ["Next stage", workflow.nextStage], ["Responsible", workflow.responsibleParty]]} />
            {Array.isArray(workflow.pendingActions) && workflow.pendingActions.length ? <View style={styles.pendingBox}><Icon name="clock-alert-outline" size={18} color="#B45309" /><Text style={styles.pendingText}>{workflow.pendingActions.map(String).join(' · ')}</Text></View> : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.orchestrationRow}>
              {orchestration.map(([label, icon, value]) => { const record = asRecord(value); const status = record?.status ?? record?.result ?? (value ? 'Active' : 'Pending'); return <View key={label} style={styles.orchestrationTile}><Icon name={icon} size={21} color={value ? '#16A34A' : '#94A3B8'} /><Text style={styles.orchestrationLabel}>{label}</Text><Text style={styles.orchestrationStatus}>{String(status).replace(/_/g, ' ')}</Text></View>; })}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Payment and logistics</Text>
          <InfoGrid
            items={[
              ['Product total', displayMoney(item.currency, item.productTotal ?? item.subtotal ?? item.merchandiseAmount)],
              ['Logistics', displayMoney(item.currency, item.logisticsCharges ?? item.logisticsAmount ?? item.shippingCost)],
              ['Platform fee', displayMoney(item.currency, item.platformFee)],
              ['GST', displayMoney(item.currency, item.gstAmount ?? item.taxAmount)],
              ['Grand total', displayMoney(item.currency, item.grandTotal ?? item.totalAmount)],
              ['Shipping method', selectedLogistics?.name ?? item.shippingMethod ?? item.logisticsOption],
            ]}
          />
          <InfoLine label="ETA" value={selectedLogistics?.eta ?? item.estimatedDeliveryDate} />
          <InfoLine label="Tracking" value={item.trackingNumber} />
          <View style={styles.documentActions}>
            {entityId(item.paymentId) ? <Pressable onPress={() => navigation.navigate('PaymentDetails', { paymentId: entityId(item.paymentId), orderNumber: item.orderNumber })} style={styles.documentButton}><Icon name="credit-card-outline" size={18} color={colors.primaryDark} /><Text style={styles.documentButtonText}>Payment details</Text></Pressable> : null}
            <Pressable onPress={() => navigation.navigate('InvoiceDetails', { invoiceId: entityId(item.invoiceId), orderId })} style={styles.documentButton}><Icon name="file-document-outline" size={18} color={colors.primaryDark} /><Text style={styles.documentButtonText}>Invoice</Text></Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Trade parties</Text>
          <InfoLine label="Buyer" value={buyer?.name ?? buyer?.fullName ?? buyer?.email ?? item.buyerId} />
          <InfoLine label="Supplier" value={seller?.companyName ?? seller?.businessName ?? seller?.displayName ?? item.sellerId} />
          <InfoLine label="Destination" value={[shipping?.city, shipping?.state, shipping?.country, shipping?.postalCode].filter(Boolean).join(', ')} />
          <InfoLine label="Shipping address" value={formatAddress(shipping)} />
          <InfoLine label="Billing address" value={formatAddress(billing)} />
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
            <Text style={styles.sectionTitle}>Seller workflow actions</Text>
            <TextInput value={trackingNumber} onChangeText={setTrackingNumber} placeholder="Tracking number" placeholderTextColor={colors.muted} style={styles.input} />
            <TextInput value={notes} onChangeText={setNotes} placeholder="Notes" placeholderTextColor={colors.muted} style={styles.input} />
            <View style={styles.statusGrid}>
              {allowedNextStages.map(status => (
                <Pressable key={status} disabled={update.isPending} onPress={() => update.mutate(status)} style={[styles.statusButton, update.isPending && styles.disabled]}>
                  <Text style={styles.statusButtonText}>{status.replace(/_/g, ' ')}</Text>
                </Pressable>
              ))}
            </View>
            {['confirmed', 'processing', 'production'].includes(String(item.status)) ? <><Text style={styles.actionSubheading}>Structured production update</Text><View style={styles.statusGrid}>{productionStages.map(stage => <Pressable key={stage} disabled={productionUpdate.isPending} onPress={() => productionUpdate.mutate(stage)} style={[styles.productionButton, productionUpdate.isPending && styles.disabled]}><Icon name="factory" size={14} color="#1D4ED8" /><Text style={styles.productionButtonText}>{stage.replace(/_/g, ' ')}</Text></Pressable>)}</View></> : null}
          </View>
        ) : null}
        {!canManage ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Buyer actions</Text>
            <TextInput value={notes} onChangeText={setNotes} placeholder="Add a note for the seller" placeholderTextColor={colors.muted} style={styles.input} />
            <View style={styles.statusGrid}>
              {String(item.status) === 'pending_approval' ? <><Pressable disabled={buyerAction.isPending} onPress={() => buyerAction.mutate('approve')} style={styles.statusButton}><Text style={styles.statusButtonText}>Approve terms</Text></Pressable><Pressable disabled={buyerAction.isPending} onPress={() => buyerAction.mutate('reject_changes')} style={styles.productionButton}><Text style={styles.productionButtonText}>Reject changes</Text></Pressable></> : null}
              {String(item.status) === 'delivered' ? <Pressable disabled={buyerAction.isPending} onPress={() => buyerAction.mutate('confirm_delivery')} style={styles.statusButton}><Text style={styles.statusButtonText}>Confirm delivery</Text></Pressable> : null}
              {['pending', 'pending_approval', 'awaiting_payment', 'pending_payment', 'confirmed'].includes(String(item.status)) ? <Pressable disabled={buyerAction.isPending} onPress={() => buyerAction.mutate('cancel')} style={styles.productionButton}><Text style={styles.productionButtonText}>Cancel order</Text></Pressable> : null}
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

function entityId(value: unknown) {
  if (typeof value === 'string') return value;
  const record = asRecord(value);
  return record ? String(record._id ?? record.id ?? '') : '';
}

function formatAddress(address: Record<string, unknown> | null) {
  if (!address) return undefined;
  return [address.fullName ?? address.name, address.addressLine1 ?? address.line1 ?? address.street, address.addressLine2 ?? address.line2, address.city, address.state, address.postalCode, address.country].filter(Boolean).join(', ');
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
  workflowCard: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE', borderRadius: radii.md, borderWidth: 1, marginBottom: spacing.lg, padding: spacing.lg },
  workflowHeader: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  workflowEyebrow: { color: '#2563EB', fontSize: 9, fontWeight: '900', letterSpacing: 1, marginBottom: 4 },
  pendingBox: { alignItems: 'center', backgroundColor: '#FFFBEB', borderRadius: radii.sm, flexDirection: 'row', gap: 7, marginTop: spacing.sm, padding: spacing.md },
  pendingText: { color: '#92400E', flex: 1, fontSize: 11, fontWeight: '800' },
  orchestrationRow: { gap: spacing.sm, paddingTop: spacing.md },
  orchestrationTile: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: radii.sm, minWidth: 105, padding: spacing.md },
  orchestrationLabel: { color: colors.ink, fontSize: 11, fontWeight: '900', marginTop: 6 },
  orchestrationStatus: { color: colors.muted, fontSize: 9, marginTop: 2, textTransform: 'capitalize' },
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
  documentActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  documentButton: { alignItems: 'center', backgroundColor: colors.cardMuted, borderRadius: radii.pill, flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', padding: spacing.md },
  documentButtonText: { color: colors.primaryDark, fontSize: 12, fontWeight: '900' },
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
  actionSubheading: { color: colors.ink, fontSize: 13, fontWeight: '900', marginBottom: spacing.sm, marginTop: spacing.lg },
  productionButton: { alignItems: 'center', backgroundColor: '#DBEAFE', borderRadius: radii.pill, flexDirection: 'row', gap: 5, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  productionButtonText: { color: '#1D4ED8', fontSize: 10, fontWeight: '900', textTransform: 'capitalize' },
});

export default OrderDetailsScreen;
