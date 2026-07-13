import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { fetchPaymentDetails } from '../api/marketplace';
import { ErrorState, LoadingState } from '../components/StateViews';
import { useCurrency } from '../currency/CurrencyContext';
import { colors, radii, shadow, spacing } from '../theme';

function PaymentDetailsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { paymentId, orderNumber } = route.params as { paymentId: string; orderNumber?: string };
  const { formatPrice } = useCurrency();
  const payment = useQuery({ queryKey: ['payment-details', paymentId], queryFn: () => fetchPaymentDetails(paymentId), enabled: Boolean(paymentId) });
  if (payment.isLoading) return <LoadingState label="Loading payment" />;
  if (payment.isError || !payment.data) return <ErrorState message={(payment.error as Error)?.message ?? 'Payment was not returned.'} onRetry={() => payment.refetch()} />;
  const item = payment.data;
  const currency = String(item.currency ?? 'INR');
  const timeline = [
    ['Created', item.createdAt], ['Processing', item.paymentDate], ['Paid', item.paidAt ?? item.completedAt], ['Refunded', item.refundedAt],
  ].filter((entry) => entry[1]);
  return <View style={styles.screen}><View style={styles.header}><Pressable onPress={() => navigation.goBack()} style={styles.iconButton}><Icon name="arrow-left" size={24} color={colors.ink} /></Pressable><Text style={styles.headerTitle}>Payment details</Text><View style={styles.iconButton} /></View><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.hero}><Icon name={item.status === 'completed' ? 'check-decagram' : 'clock-outline'} size={38} color={item.status === 'completed' ? colors.green : colors.primary} /><Text style={styles.amount}>{formatPrice(Number(item.amount ?? 0), currency)}</Text><Text style={styles.status}>{String(item.status ?? 'pending').replace(/_/g, ' ')}</Text></View>
    <Card title="Transaction"><Row label="Order number" value={orderNumber ?? readNested(item.orderId, 'orderNumber')} /><Row label="Payment number" value={item.paymentNumber} /><Row label="Transaction ID" value={item.transactionId ?? item.razorpayPaymentId} /><Row label="Method" value={item.paymentMethod ?? item.method} /></Card>
    <Card title="Amount breakdown"><Row label="Order amount" value={money(item.orderAmount, currency, formatPrice)} /><Row label="Platform fee" value={money(item.platformFee, currency, formatPrice)} /><Row label="Gateway fee" value={money(item.gatewayFee, currency, formatPrice)} /><Row label="GST" value={money(readNested(item.metadata, 'gstAmount'), currency, formatPrice)} /><Row label="Logistics" value={money(readNested(item.metadata, 'logisticsCharges'), currency, formatPrice)} /><Row label="Net amount" value={money(item.netAmount ?? item.amount, currency, formatPrice)} /></Card>
    <Card title="Refund"><Row label="Refund status" value={item.status === 'refunded' ? 'Refunded' : item.refundAmount ? 'Processing' : 'Not requested'} /><Row label="Refund amount" value={money(item.refundAmount, currency, formatPrice)} /><Row label="Reason" value={item.refundReason} /></Card>
    {item.invoiceUrl ? <Pressable onPress={() => navigation.navigate('InvoiceDetails', { orderId: idOf(item.orderId) })} style={styles.action}><Icon name="file-document-outline" size={20} color="#fff" /><Text style={styles.actionText}>View invoice</Text></Pressable> : null}
    <Card title="Payment timeline">{timeline.map(([label, date]) => <View key={String(label)} style={styles.timeline}><View style={styles.dot} /><View><Text style={styles.timelineTitle}>{String(label)}</Text><Text style={styles.timelineDate}>{new Date(String(date)).toLocaleString()}</Text></View></View>)}</Card>
  </ScrollView></View>;
}

function Card({ title, children }: React.PropsWithChildren<{ title: string }>) { return <View style={styles.card}><Text style={styles.cardTitle}>{title}</Text>{children}</View>; }
function Row({ label, value }: { label: string; value: unknown }) { if (value === undefined || value === null || value === '') return null; return <View style={styles.row}><Text style={styles.label}>{label}</Text><Text selectable style={styles.value}>{String(value).replace(/_/g, ' ')}</Text></View>; }
function readNested(value: unknown, key: string) { return value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined; }
function idOf(value: unknown) { return typeof value === 'string' ? value : String(readNested(value, '_id') ?? readNested(value, 'id') ?? ''); }
function money(value: unknown, currency: string, formatter: (amount: number, currency?: string) => string) { return value === undefined || value === null ? undefined : formatter(Number(value), currency); }

const styles = StyleSheet.create({ screen: { backgroundColor: colors.background, flex: 1 }, header: { alignItems: 'center', backgroundColor: colors.card, flexDirection: 'row', paddingHorizontal: spacing.md, paddingTop: spacing.xxl, paddingBottom: spacing.sm }, iconButton: { alignItems: 'center', height: 42, justifyContent: 'center', width: 42 }, headerTitle: { color: colors.ink, flex: 1, fontSize: 18, fontWeight: '900', textAlign: 'center' }, content: { padding: spacing.lg, paddingBottom: spacing.xxl }, hero: { alignItems: 'center', backgroundColor: colors.card, borderRadius: radii.md, marginBottom: spacing.lg, padding: spacing.xl, ...shadow }, amount: { color: colors.ink, fontSize: 28, fontWeight: '900', marginTop: spacing.sm }, status: { color: colors.primaryDark, fontSize: 12, fontWeight: '900', marginTop: 5, textTransform: 'capitalize' }, card: { backgroundColor: colors.card, borderRadius: radii.md, marginBottom: spacing.lg, padding: spacing.lg }, cardTitle: { color: colors.ink, fontSize: 16, fontWeight: '900', marginBottom: spacing.sm }, row: { borderBottomColor: colors.faint, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between', paddingVertical: spacing.sm }, label: { color: colors.muted, flex: 1, fontSize: 12, fontWeight: '700' }, value: { color: colors.ink, flex: 1.3, fontSize: 12, fontWeight: '800', textAlign: 'right', textTransform: 'capitalize' }, action: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.pill, flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', marginBottom: spacing.lg, padding: spacing.md }, actionText: { color: '#fff', fontWeight: '900' }, timeline: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm }, dot: { backgroundColor: colors.green, borderRadius: 5, height: 10, marginTop: 4, width: 10 }, timelineTitle: { color: colors.ink, fontSize: 13, fontWeight: '800' }, timelineDate: { color: colors.muted, fontSize: 11, marginTop: 2 } });

export default PaymentDetailsScreen;
