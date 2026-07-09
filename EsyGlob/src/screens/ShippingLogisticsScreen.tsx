import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { fetchShipments, ShippingOrder } from '../api/services';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { colors, radii, spacing } from '../theme';

const filters = ['All', 'Draft', 'Booked', 'In transit', 'Customs', 'Delivered', 'Cancelled'];
const statusMap: Record<string, string | undefined> = {
  All: undefined,
  Draft: 'draft',
  Booked: 'booked',
  'In transit': 'in_transit',
  Customs: 'customs_clearance',
  Delivered: 'delivered',
  Cancelled: 'cancelled',
};

function ShippingLogisticsScreen() {
  const navigation = useNavigation<any>();
  const [filter, setFilter] = useState('All');
  const shipments = useQuery({
    queryKey: ['shipping-logistics', statusMap[filter]],
    queryFn: () => fetchShipments({ status: statusMap[filter] }),
    staleTime: 45_000,
  });
  const data = useMemo(() => shipments.data?.shipments ?? [], [shipments.data?.shipments]);
  const summary = useMemo(() => ({
    active: data.filter(item => !['delivered', 'cancelled'].includes(String(item.status ?? '').toLowerCase())).length,
    delivered: data.filter(item => String(item.status ?? '').toLowerCase() === 'delivered').length,
    docs: data.reduce((count, item) => count + (item.documents?.length ?? 0), 0),
  }), [data]);

  if (shipments.isLoading) {
    return <LoadingState label="Loading logistics" />;
  }

  if (shipments.isError) {
    return <ErrorState message={(shipments.error as Error)?.message ?? 'Shipments could not be loaded.'} onRetry={() => shipments.refetch()} />;
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconButton}>
          <Icon name="arrow-left" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Shipping & Logistics</Text>
        <Pressable onPress={() => navigation.navigate('ServiceDetails', { serviceKey: 'shipping' })} style={styles.iconButton}>
          <Icon name="plus" size={23} color={colors.primary} />
        </Pressable>
      </View>
      <FlatList
        data={data}
        keyExtractor={item => getShipmentId(item)}
        refreshControl={<RefreshControl refreshing={shipments.isRefetching} onRefresh={() => shipments.refetch()} />}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            <View style={styles.heroCard}>
              <Icon name="truck-fast-outline" size={30} color={colors.primary} />
              <View style={styles.heroText}>
                <Text style={styles.heroTitle}>Logistics hub</Text>
                <Text style={styles.heroCopy}>Track active shipments, delivery status, documents, providers, and timelines.</Text>
              </View>
            </View>
            <View style={styles.summaryRow}>
              <SummaryTile label="Active" value={summary.active} icon="progress-clock" />
              <SummaryTile label="Delivered" value={summary.delivered} icon="check-circle-outline" />
              <SummaryTile label="Docs" value={summary.docs} icon="file-document-outline" />
            </View>
            <FlatList
              horizontal
              data={filters}
              keyExtractor={item => item}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
              renderItem={({ item }) => (
                <Pressable onPress={() => setFilter(item)} style={[styles.filterChip, filter === item && styles.filterChipActive]}>
                  <Text style={[styles.filterText, filter === item && styles.filterTextActive]}>{item}</Text>
                </Pressable>
              )}
            />
          </View>
        }
        ListEmptyComponent={<EmptyState title="No shipments found" detail="Shipment records from /shipping will appear here." />}
        renderItem={({ item }) => <ShipmentCard shipment={item} />}
      />
    </View>
  );
}

function SummaryTile({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <View style={styles.summaryTile}>
      <Icon name={icon} size={19} color={colors.primary} />
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function ShipmentCard({ shipment }: { shipment: ShippingOrder }) {
  const delivery = shipment.delivery ?? {};
  const provider = shipment.carrier ?? shipment.carrierService ?? 'Provider pending';
  const tracking = shipment.trackingNumber ?? 'Tracking pending';
  const estimated = shipment.estimatedDelivery ? new Date(shipment.estimatedDelivery).toLocaleDateString() : 'To be confirmed';

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text numberOfLines={1} style={styles.shipmentNumber}>{shipment.orderNumber ?? getShipmentId(shipment)}</Text>
        <Text style={styles.status}>{formatStatus(shipment.status)}</Text>
      </View>
      <View style={styles.infoGrid}>
        <Info icon="map-marker-outline" label="Destination" value={formatAddress(delivery)} />
        <Info icon="barcode-scan" label="Tracking" value={tracking} />
        <Info icon="truck-outline" label="Provider" value={provider} />
        <Info icon="calendar-clock" label="ETA" value={estimated} />
      </View>
      <View style={styles.timeline}>
        {['draft', 'booked', 'in_transit', 'customs_clearance', 'delivered'].map(step => (
          <View key={step} style={[styles.timelineStep, isReached(step, shipment.status) && styles.timelineStepActive]} />
        ))}
      </View>
      <View style={styles.cardBottom}>
        <Text style={styles.bottomText}>{shipment.documents?.length ?? 0} shipping documents</Text>
        <Text style={styles.bottomText}>{shipment.packages?.length ?? 0} packages</Text>
      </View>
    </View>
  );
}

function Info({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.infoItem}>
      <Icon name={icon} size={16} color={colors.secondary} />
      <View style={styles.infoText}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text numberOfLines={1} style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

function getShipmentId(shipment: ShippingOrder) {
  return shipment._id ?? shipment.id ?? shipment.orderNumber ?? Math.random().toString(36);
}

function formatStatus(status?: string) {
  return String(status ?? 'pending').replace(/_/g, ' ');
}

function formatAddress(address: Record<string, unknown>) {
  return [address.city, address.state, address.country, address.postalCode].filter(Boolean).join(', ') || String(address.address ?? 'Destination pending');
}

function isReached(step: string, status?: string) {
  const order = ['draft', 'booked', 'in_transit', 'customs_clearance', 'delivered'];
  return order.indexOf(step) <= Math.max(order.indexOf(String(status ?? 'draft')), 0);
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  header: { alignItems: 'center', backgroundColor: colors.card, borderBottomColor: colors.faint, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', paddingBottom: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.xxl },
  iconButton: { alignItems: 'center', height: 42, justifyContent: 'center', width: 42 },
  headerTitle: { color: colors.ink, flex: 1, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  content: { padding: spacing.lg, paddingBottom: 120 },
  heroCard: { alignItems: 'center', backgroundColor: colors.card, borderRadius: radii.md, flexDirection: 'row', gap: spacing.md, padding: spacing.lg },
  heroText: { flex: 1 },
  heroTitle: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  heroCopy: { color: colors.muted, fontSize: 13, fontWeight: '700', lineHeight: 19, marginTop: spacing.xs },
  summaryRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  summaryTile: { alignItems: 'center', backgroundColor: colors.card, borderRadius: radii.md, flex: 1, padding: spacing.md },
  summaryValue: { color: colors.ink, fontSize: 19, fontWeight: '900', marginTop: spacing.xs },
  summaryLabel: { color: colors.muted, fontSize: 11, fontWeight: '900', marginTop: 2 },
  filterRow: { gap: spacing.sm, paddingVertical: spacing.lg },
  filterChip: { backgroundColor: colors.card, borderColor: colors.faint, borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  filterTextActive: { color: '#fff' },
  card: { backgroundColor: colors.card, borderRadius: radii.md, marginBottom: spacing.md, padding: spacing.md },
  cardTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  shipmentNumber: { color: colors.ink, flex: 1, fontSize: 16, fontWeight: '900' },
  status: { backgroundColor: '#fff8f3', borderRadius: radii.pill, color: colors.primaryDark, fontSize: 11, fontWeight: '900', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, textTransform: 'capitalize' },
  infoGrid: { gap: spacing.sm, marginTop: spacing.md },
  infoItem: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  infoText: { flex: 1 },
  infoLabel: { color: colors.muted, fontSize: 11, fontWeight: '900' },
  infoValue: { color: colors.text, fontSize: 13, fontWeight: '800', marginTop: 1 },
  timeline: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md },
  timelineStep: { backgroundColor: colors.faint, borderRadius: radii.pill, flex: 1, height: 6 },
  timelineStepActive: { backgroundColor: colors.primary },
  cardBottom: { borderTopColor: colors.faint, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md, paddingTop: spacing.md },
  bottomText: { color: colors.muted, fontSize: 12, fontWeight: '800' },
});

export default ShippingLogisticsScreen;
