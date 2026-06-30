import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { fetchOrderDetails, updateOrderStatus } from '../api/marketplace';
import { ErrorState, LoadingState } from '../components/StateViews';
import { colors, radii, spacing } from '../theme';
import { formatValue } from '../utils/display';

const nextStatuses = ['confirmed', 'processing', 'production', 'ready_to_ship', 'shipped', 'delivered', 'completed'];

function OrderDetailsScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
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
      Alert.alert('Order updated', 'The backend accepted the status update.');
    },
    onError: error => Alert.alert('Update failed', error instanceof Error ? error.message : 'Unable to update order.'),
  });

  if (order.isLoading) {
    return <LoadingState label="Loading order" />;
  }

  if (order.isError || !order.data) {
    return <ErrorState message={(order.error as Error)?.message ?? 'Order was not returned.'} onRetry={() => order.refetch()} />;
  }

  const item = order.data;
  const product = Array.isArray(item.products) ? item.products[0] : item.productId;
  const productName = typeof product === 'object' ? String(product.name ?? product.title ?? '') : undefined;

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
          <Text style={styles.orderNumber}>{item.orderNumber ?? orderId}</Text>
          <Text style={styles.status}>{item.status ?? 'pending'}</Text>
          <Text style={styles.total}>{String(item.currency ?? '')} {String(item.totalAmount ?? 'Amount pending')}</Text>
          {productName ? <Text style={styles.meta}>{productName}</Text> : null}
          <Text style={styles.meta}>Payment: {item.paymentStatus ?? 'pending'}</Text>
        </View>

        {item.timeline?.length ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Timeline</Text>
            {item.timeline.map((event, index) => (
              <View key={index} style={styles.timelineRow}>
                <View style={styles.dot} />
                <Text style={styles.timelineText}>{formatValue(event)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Shipment update</Text>
          <TextInput value={trackingNumber} onChangeText={setTrackingNumber} placeholder="Tracking number" placeholderTextColor={colors.muted} style={styles.input} />
          <TextInput value={notes} onChangeText={setNotes} placeholder="Notes" placeholderTextColor={colors.muted} style={styles.input} />
          <View style={styles.statusGrid}>
            {nextStatuses.map(status => (
              <Pressable key={status} disabled={update.isPending} onPress={() => update.mutate(status)} style={styles.statusButton}>
                <Text style={styles.statusButtonText}>{status.replace(/_/g, ' ')}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Backend record</Text>
          <Text style={styles.description}>{formatValue(item)}</Text>
        </View>
      </ScrollView>
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
  hero: { backgroundColor: colors.card, borderRadius: radii.md, marginBottom: spacing.lg, padding: spacing.lg },
  orderNumber: { color: colors.ink, fontSize: 22, fontWeight: '900' },
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
  total: { color: colors.primaryDark, fontSize: 20, fontWeight: '900', marginTop: spacing.md },
  meta: { color: colors.muted, fontSize: 13, fontWeight: '800', marginTop: spacing.xs },
  card: { backgroundColor: colors.card, borderRadius: radii.md, marginBottom: spacing.lg, padding: spacing.lg },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: '900', marginBottom: spacing.md },
  timelineRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  dot: { backgroundColor: colors.primary, borderRadius: radii.pill, height: 10, marginTop: 5, width: 10 },
  timelineText: { color: colors.text, flex: 1, fontSize: 13, fontWeight: '800', lineHeight: 20 },
  input: { backgroundColor: colors.cardMuted, borderRadius: radii.md, color: colors.ink, fontSize: 14, fontWeight: '800', marginBottom: spacing.md, minHeight: 44, paddingHorizontal: spacing.md },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statusButton: { backgroundColor: colors.cardMuted, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  statusButtonText: { color: colors.ink, fontSize: 12, fontWeight: '900', textTransform: 'capitalize' },
  description: { color: colors.text, fontSize: 13, fontWeight: '700', lineHeight: 20 },
});

export default OrderDetailsScreen;
