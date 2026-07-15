import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cancelServiceActivity, fetchAggregatedServiceActivity, fetchServiceRequestDetails, ServiceRequest } from '../api/services';
import { initiateServicePayment, updateServicePaymentStatus, verifyServicePayment } from '../api/services';
import RazorpayCheckout from 'react-native-razorpay';
import { useAuth } from '../auth/AuthContext';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { colors, radii, spacing } from '../theme';
import { RootStackParamList } from '../../App';

function BookedServiceDetailsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, 'BookedServiceDetails'>>();
  const { activeRole } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const activity = useQuery({
    queryKey: ['service-activity', activeRole],
    queryFn: () => fetchAggregatedServiceActivity(activeRole),
    refetchInterval: 45_000,
  });
  const initialRequest = route.params?.request;
  const initialId = initialRequest?._id ?? initialRequest?.id;
  const detail = useQuery({ queryKey: ['service-request', initialId], queryFn: () => fetchServiceRequestDetails(String(initialId)), enabled: Boolean(initialId && initialRequest?._serviceSource === 'service'), refetchInterval: 30_000 });
  const request = detail.data ? { ...detail.data, _serviceSource: 'service' } : initialRequest;
  const cancel = useMutation({ mutationFn: () => { if (!request) throw new Error('Service request is unavailable.'); return cancelServiceActivity(request); }, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['service-activity'] }); navigation.replace('BookedServiceDetails', { mode: 'list' }); } });
  const retryPayment = useMutation({ mutationFn: async () => { if (!request) throw new Error('Service request is unavailable.'); const id = request._id ?? request.id; if (!id) throw new Error('Service request ID is unavailable.'); try { const payment = await initiateServicePayment(id); const gateway = await RazorpayCheckout.open({ key: payment.keyId, amount: payment.amount, currency: payment.currency, name: 'EsyGlob', description: request.serviceTitle ?? 'Service payment', order_id: payment.razorpayOrderId, theme: { color: '#2563EB' } }); return verifyServicePayment(id, { razorpayPaymentId: gateway.razorpay_payment_id, razorpayOrderId: gateway.razorpay_order_id, razorpaySignature: gateway.razorpay_signature }); } catch (error) { await updateServicePaymentStatus(id, 'cancelled').catch(() => undefined); throw error; } }, onSuccess: async (data: any) => { await queryClient.invalidateQueries({ queryKey: ['service-activity'] }); await queryClient.invalidateQueries({ queryKey: ['invoices'] }); navigation.replace('ServiceBookingSuccess', { request: data?.request ?? data }); } });

  if (route.params?.mode === 'list' || !request) {
    if (activity.isLoading) {
      return <LoadingState label="Loading your services" />;
    }
    if (activity.isError) {
      return <ErrorState message={(activity.error as Error)?.message ?? 'Your services could not be loaded.'} onRetry={() => activity.refetch()} />;
    }
    const bookings = (activity.data ?? []).filter(item => {
      const haystack = `${item.serviceTitle ?? item.title ?? item.subject ?? ''} ${item.requestNumber ?? item.orderNumber ?? ''} ${item.serviceKey ?? ''}`.toLowerCase();
      const status = String(item.status ?? '').toLowerCase();
      const matchesSearch = !search.trim() || haystack.includes(search.trim().toLowerCase());
      const matchesFilter = filter === 'all' || (filter === 'payment_pending' ? item.paymentStatus !== 'paid' : filter === 'processing' ? ['processing', 'in_progress', 'under_review'].includes(status) : status === filter);
      return matchesSearch && matchesFilter;
    });
    return (
      <View style={styles.screen}>
        <Header title="My Bookings" />
        <FlatList
          data={bookings}
          keyExtractor={item => getRequestId(item)}
          refreshControl={<RefreshControl refreshing={activity.isRefetching} onRefresh={() => activity.refetch()} />}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={<><View style={styles.searchBox}><Icon name="magnify" size={19} color={colors.muted} /><TextInput value={search} onChangeText={setSearch} placeholder="Search service or booking ID" placeholderTextColor={colors.muted} style={styles.searchInput} />{search ? <Pressable onPress={() => setSearch('')}><Icon name="close-circle" size={18} color={colors.muted} /></Pressable> : null}</View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{['all', 'pending', 'processing', 'completed', 'cancelled', 'rejected', 'payment_pending'].map(value => <Pressable key={value} onPress={() => setFilter(value)} style={[styles.filterChip, filter === value && styles.filterChipActive]}><Text style={[styles.filterText, filter === value && styles.filterTextActive]}>{formatStatus(value)}</Text></Pressable>)}</ScrollView><StatusSummary requests={activity.data ?? []} /></>}
          ListEmptyComponent={<EmptyState title="No matching bookings" detail="Try changing your search or status filter." />}
          renderItem={({ item }) => <ServiceBookingCard request={item} onPress={() => navigation.navigate('BookedServiceDetails', { request: item })} />}
        />
      </View>
    );
  }

  const timeline = buildTimeline(request);
  const canEdit = ['draft', 'submitted', 'pending', 'pending_seller'].includes(String(request.status ?? '').toLowerCase());
  const canCancel = canEdit && ['shipping', 'service'].includes(String(request._serviceSource));
  const invoiceId = typeof request.invoiceId === 'object' ? String((request.invoiceId as any)._id ?? '') : String(request.invoiceId ?? '');

  return (
    <View style={styles.screen}>
      <Header title="Service Tracking" />
      <ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
        <View style={styles.detailCard}>
          <View style={styles.detailTop}>
            <Icon name="briefcase-check-outline" size={30} color={colors.primary} />
            <View style={styles.detailTitleWrap}>
              <Text style={styles.detailTitle}>{request.serviceTitle ?? request.title ?? request.subject ?? request.orderNumber ?? 'Booked service'}</Text>
              <Text style={styles.detailId}>{request.requestNumber ?? request.orderNumber ?? request.transactionNumber ?? request.inspectionNumber ?? getRequestId(request)}</Text>
            </View>
          </View>
          <View style={styles.statusPill}><Text style={styles.statusPillText}>{formatStatus(request.status)}</Text></View>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${getProgress(request.status)}%` }]} /></View>
          <Text style={styles.expected}>Expected completion: {request.expectedCompletionDate ? new Date(request.expectedCompletionDate).toLocaleDateString() : 'Assigned after review'}</Text>
        </View>
        <Section title="Booking timeline">
          {timeline.map((item, index) => (
            <View key={`${item.title}-${index}`} style={styles.timelineRow}>
              <View style={styles.timelineDot} />
              <View style={styles.timelineBody}>
                <Text style={styles.timelineTitle}>{item.title}</Text>
                <Text style={styles.timelineText}>{item.text}</Text>
              </View>
            </View>
          ))}
        </Section>
        <Section title="Submitted information">
          {Object.entries(flattenRequest(request)).map(([key, value]) => (
            <View key={key} style={styles.infoRow}>
              <Text style={styles.infoKey}>{key}</Text>
              <Text style={styles.infoValue}>{String(value)}</Text>
            </View>
          ))}
        </Section>
        <Section title="Uploaded documents">
          {request.documents?.length ? request.documents.map((document, index) => (
            <View key={`${document.url}-${index}`} style={styles.documentRow}>
              <Icon name="file-document-outline" size={20} color={colors.primary} />
              <View style={styles.documentBody}>
                <Text style={styles.documentTitle}>{document.name ?? 'Document'}</Text>
                <Text style={styles.documentStatus}>{document.status ?? document.url ?? 'Submitted'}</Text>
              </View>
            </View>
          )) : <Text style={styles.emptyText}>No document links were submitted.</Text>}
        </Section>
        <Section title="Admin notes">
          <Text style={styles.bodyText}>{request.notes || 'No admin notes yet. Updates will appear here automatically when the backend status changes.'}</Text>
        </Section>
        <Section title="Assigned team"><Text style={styles.bodyText}>{String(request.assignedTeam ?? request.assignedProvider ?? request.assignedTo ?? request.providerName ?? 'Assignment pending')}</Text></Section>
        <Section title="Payment and invoice">
          <View style={styles.infoRow}><Text style={styles.infoKey}>Payment status</Text><Text style={styles.infoValue}>{String(request.paymentStatus ?? 'Not requested')}</Text></View>
          <View style={styles.infoRow}><Text style={styles.infoKey}>Payment amount</Text><Text style={styles.infoValue}>{String(request.amount ?? request.totalAmount ?? request.estimatedCost ?? 'Pending quotation')}</Text></View>
          <View style={styles.infoRow}><Text style={styles.infoKey}>Invoice</Text><Text style={styles.infoValue}>{String(request.invoiceNumber ?? request.invoiceId ?? 'Not generated')}</Text></View>
          {invoiceId ? <Pressable onPress={() => navigation.navigate('InvoiceDetails', { invoiceId })} style={styles.invoiceButton}><Icon name="file-pdf-box" size={19} color="#fff" /><Text style={styles.invoiceButtonText}>View invoice</Text></Pressable> : null}
        </Section>
        <View style={styles.actionRow}>
          {request.paymentStatus !== 'paid' && request._serviceSource === 'service' ? <Pressable disabled={retryPayment.isPending} onPress={() => retryPayment.mutate()} style={styles.payButton}><Icon name="credit-card-check-outline" size={18} color="#fff" /><Text style={styles.payButtonText}>{retryPayment.isPending ? 'Opening...' : 'Pay / Retry'}</Text></Pressable> : null}
          <Pressable disabled={!canCancel || cancel.isPending} onPress={() => cancel.mutate()} style={[styles.outlineButton, !canCancel && styles.disabledButton]}>
            <Icon name="close-circle-outline" size={18} color={canCancel ? colors.rose : colors.muted} />
            <Text style={[styles.cancelText, !canCancel && styles.disabledText]}>{cancel.isPending ? 'Cancelling…' : 'Cancel Request'}</Text>
          </Pressable>
        </View>
        {!canCancel ? <Text style={styles.lockReason}>Direct cancellation is available only for eligible shipment bookings. Contact support for managed services.</Text> : null}
      </ScrollView>
    </View>
  );
}

function Header({ title }: { title: string }) {
  const navigation = useNavigation<any>();
  return (
    <View style={styles.header}>
      <Pressable onPress={() => navigation.goBack()} style={styles.iconButton}><Icon name="arrow-left" size={24} color={colors.ink} /></Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.iconButton} />
    </View>
  );
}

function StatusSummary({ requests }: { requests: ServiceRequest[] }) {
  const counts = useMemo(() => ({
    active: requests.filter(item => !['completed', 'cancelled', 'rejected'].includes(String(item.status ?? '').toLowerCase())).length,
    pending: requests.filter(item => String(item.status ?? '').toLowerCase().includes('pending') || String(item.status ?? '').toLowerCase() === 'submitted').length,
    completed: requests.filter(item => String(item.status ?? '').toLowerCase() === 'completed').length,
    cancelled: requests.filter(item => String(item.status ?? '').toLowerCase() === 'cancelled').length,
  }), [requests]);
  return (
    <View style={styles.summaryGrid}>
      {Object.entries(counts).map(([key, value]) => (
        <View key={key} style={styles.summaryTile}>
          <Text style={styles.summaryValue}>{value}</Text>
          <Text style={styles.summaryLabel}>{key}</Text>
        </View>
      ))}
    </View>
  );
}

function ServiceBookingCard({ request, onPress }: { request: ServiceRequest; onPress: () => void }) {
  const navigation = useNavigation<any>();
  const status = String(request.status ?? 'pending').toLowerCase();
  const invoiceReady = Boolean(request.invoiceId ?? request.invoiceNumber);
  const invoiceId = typeof request.invoiceId === 'object' ? String((request.invoiceId as any)._id ?? '') : String(request.invoiceId ?? '');
  const total = request.pricing?.totalPayable ?? request.totalAmount ?? request.amount;
  return (
    <Pressable onPress={onPress} style={styles.bookingCard}>
      <View style={styles.bookingTop}>
        <View style={styles.bookingIcon}><Icon name={serviceIcon(String(request.serviceKey ?? request._serviceSource ?? ''))} size={21} color={colors.primary} /></View><View style={styles.bookingTitleWrap}><Text numberOfLines={1} style={styles.bookingTitle}>{request.serviceTitle ?? request.title ?? request.subject ?? 'Service booking'}</Text><Text style={styles.bookingCategory}>{String(request.serviceKey ?? request._serviceSource ?? 'Managed service').replace(/-/g, ' ')}</Text></View>
        <View style={[styles.cardStatus, statusStyle(status)]}><Text style={styles.cardStatusText}>{formatStatus(status)}</Text></View>
      </View>
      <Text style={styles.bookingId}>{request.requestNumber ?? request.orderNumber ?? request.transactionNumber ?? getRequestId(request)}</Text>
      <View style={styles.bookingMetaGrid}><MiniInfo label="Booked" value={request.createdAt ? new Date(request.createdAt).toLocaleDateString() : 'Recently'} /><MiniInfo label="Payment" value={formatStatus(request.paymentStatus ?? 'pending')} /><MiniInfo label="Invoice" value={invoiceReady ? 'Ready' : 'Pending'} /><MiniInfo label="Total" value={total ? `${request.pricing?.currency ?? 'INR'} ${Number(total).toFixed(2)}` : 'Quote pending'} /></View>
      <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${getProgress(request.status)}%` }]} /></View>
      <View style={styles.cardFooter}><Text style={styles.updatedText}>Updated {request.updatedAt ? new Date(request.updatedAt).toLocaleDateString() : 'recently'}</Text>{request.priority && request.priority !== 'normal' ? <Text style={styles.priority}>{String(request.priority).toUpperCase()}</Text> : null}<View style={styles.viewAction}><Text style={styles.viewActionText}>Manage</Text><Icon name="chevron-right" size={17} color={colors.primary} /></View></View>
      <View style={styles.quickActions}><Pressable onPress={onPress} style={styles.quickAction}><Icon name="eye-outline" size={15} color={colors.primary} /><Text style={styles.quickActionText}>Details</Text></Pressable><Pressable onPress={onPress} style={styles.quickAction}><Icon name="map-marker-path" size={15} color={colors.primary} /><Text style={styles.quickActionText}>Track</Text></Pressable>{invoiceId ? <Pressable onPress={() => navigation.navigate('InvoiceDetails', { invoiceId })} style={styles.quickAction}><Icon name="file-pdf-box" size={15} color={colors.primary} /><Text style={styles.quickActionText}>Invoice</Text></Pressable> : null}<Pressable onPress={() => navigation.navigate('HelpSupport')} style={styles.quickAction}><Icon name="headset" size={15} color={colors.primary} /><Text style={styles.quickActionText}>Support</Text></Pressable></View>
    </Pressable>
  );
}

function MiniInfo({ label, value }: { label: string; value: string }) { return <View style={styles.miniInfo}><Text style={styles.miniLabel}>{label}</Text><Text numberOfLines={1} style={styles.miniValue}>{value}</Text></View>; }
function serviceIcon(key: string) { if (key.includes('shipping')) return 'truck-fast-outline'; if (key.includes('customs')) return 'passport-biometric'; if (key.includes('warehouse')) return 'warehouse'; if (key.includes('insurance')) return 'shield-check-outline'; if (key.includes('finance') || key.includes('escrow')) return 'bank-outline'; if (key.includes('document')) return 'file-document-outline'; return 'briefcase-check-outline'; }
function statusStyle(status: string) { if (status === 'completed') return { backgroundColor: '#DCFCE7' }; if (['cancelled', 'rejected'].includes(status)) return { backgroundColor: '#FEE2E2' }; if (status.includes('progress') || status === 'processing') return { backgroundColor: '#DBEAFE' }; return { backgroundColor: '#FEF3C7' }; }

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function buildTimeline(request: ServiceRequest) {
  const history = request.history ?? [];
  if (history.length) {
    return history.map(item => ({
      title: formatStatus(item.status),
      text: item.note ?? item.message ?? item.createdAt ?? item.updatedAt ?? 'Status updated',
    }));
  }
  return [
    { title: 'Submitted', text: request.createdAt ? new Date(request.createdAt).toLocaleString() : 'Booking request created' },
    { title: formatStatus(request.status), text: 'Current backend status' },
  ];
}

function flattenRequest(request: ServiceRequest) {
  const output: Record<string, string> = {};
  ['companyName', 'contactName', 'contactEmail', 'details', 'priority'].forEach(key => {
    const value = request[key];
    if (value) output[key.replace(/([A-Z])/g, ' $1')] = String(value);
  });
  if (request.requirements && typeof request.requirements === 'object') {
    Object.entries(request.requirements).slice(0, 12).forEach(([key, value]) => {
      if (value) output[key.replace(/([A-Z])/g, ' $1')] = String(value);
    });
  }
  return Object.keys(output).length ? output : { Status: formatStatus(request.status), Reference: getRequestId(request) };
}

function getRequestId(request: ServiceRequest) {
  return request._id ?? request.id ?? request.requestNumber ?? request.orderNumber ?? request.transactionNumber ?? Math.random().toString(36);
}

function getProgress(status?: string) {
  const key = String(status ?? 'submitted').toLowerCase();
  if (['completed', 'delivered', 'approved'].includes(key)) return 100;
  if (['processing', 'in_progress', 'booked', 'funded'].includes(key)) return 64;
  if (['under_review', 'document_review'].includes(key)) return 42;
  if (['cancelled', 'rejected'].includes(key)) return 12;
  return 24;
}

function formatStatus(status?: string) {
  return String(status ?? 'pending').replace(/_/g, ' ');
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  header: { alignItems: 'center', backgroundColor: colors.card, borderBottomColor: colors.faint, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', paddingBottom: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.xxl },
  iconButton: { alignItems: 'center', height: 42, justifyContent: 'center', width: 42 },
  headerTitle: { color: colors.ink, flex: 1, fontSize: 17, fontWeight: '900', textAlign: 'center' },
  listContent: { padding: spacing.lg, paddingBottom: 120 },
  searchBox: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.faint, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md, paddingHorizontal: spacing.md },
  searchInput: { color: colors.ink, flex: 1, fontSize: 13, minHeight: 46 },
  filters: { gap: spacing.sm, paddingBottom: spacing.md },
  filterChip: { backgroundColor: colors.card, borderColor: colors.faint, borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.muted, fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },
  filterTextActive: { color: '#fff' },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  summaryTile: { backgroundColor: colors.card, borderRadius: radii.md, flexBasis: '48%', flexGrow: 1, padding: spacing.md },
  summaryValue: { color: colors.ink, fontSize: 22, fontWeight: '900' },
  summaryLabel: { color: colors.muted, fontSize: 12, fontWeight: '900', marginTop: spacing.xs, textTransform: 'capitalize' },
  bookingCard: { backgroundColor: colors.card, borderColor: colors.faint, borderRadius: radii.md, borderWidth: 1, marginBottom: spacing.md, padding: spacing.md },
  bookingTop: { alignItems: 'center', flexDirection: 'row' },
  bookingIcon: { alignItems: 'center', backgroundColor: '#EFF6FF', borderRadius: 11, height: 42, justifyContent: 'center', marginRight: spacing.sm, width: 42 },
  bookingTitleWrap: { flex: 1 },
  bookingTitle: { color: colors.ink, flex: 1, fontSize: 16, fontWeight: '900' },
  bookingCategory: { color: colors.muted, fontSize: 10, fontWeight: '700', marginTop: 2, textTransform: 'capitalize' },
  cardStatus: { borderRadius: radii.pill, marginLeft: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  cardStatusText: { color: '#334155', fontSize: 9, fontWeight: '900', textTransform: 'capitalize' },
  bookingId: { color: colors.muted, fontSize: 12, fontWeight: '800', marginTop: spacing.xs },
  bookingDate: { color: colors.text, fontSize: 12, fontWeight: '700', marginTop: spacing.xs },
  bookingMetaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  miniInfo: { backgroundColor: colors.cardMuted, borderRadius: radii.sm, flexBasis: '47%', flexGrow: 1, padding: spacing.sm },
  miniLabel: { color: colors.muted, fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  miniValue: { color: colors.ink, fontSize: 11, fontWeight: '900', marginTop: 3, textTransform: 'capitalize' },
  cardFooter: { alignItems: 'center', flexDirection: 'row', marginTop: spacing.sm },
  updatedText: { color: colors.muted, flex: 1, fontSize: 10, fontWeight: '700' },
  priority: { color: colors.rose, fontSize: 9, fontWeight: '900', marginRight: spacing.sm },
  viewAction: { alignItems: 'center', flexDirection: 'row' },
  viewActionText: { color: colors.primary, fontSize: 11, fontWeight: '900' },
  quickActions: { borderTopColor: colors.faint, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm, paddingTop: spacing.sm },
  quickAction: { alignItems: 'center', backgroundColor: '#EFF6FF', borderRadius: radii.pill, flexDirection: 'row', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 7 },
  quickActionText: { color: colors.primary, fontSize: 10, fontWeight: '900' },
  progressTrack: { backgroundColor: colors.cardMuted, borderRadius: radii.pill, height: 8, marginTop: spacing.md, overflow: 'hidden' },
  progressFill: { backgroundColor: colors.primary, borderRadius: radii.pill, height: 8 },
  bookingStatus: { color: colors.primaryDark, fontSize: 12, fontWeight: '900', marginTop: spacing.sm, textTransform: 'capitalize' },
  detailContent: { padding: spacing.lg, paddingBottom: 120 },
  detailCard: { backgroundColor: colors.card, borderRadius: radii.md, padding: spacing.lg },
  detailTop: { flexDirection: 'row', gap: spacing.md },
  detailTitleWrap: { flex: 1 },
  detailTitle: { color: colors.ink, fontSize: 18, fontWeight: '900', lineHeight: 23 },
  detailId: { color: colors.muted, fontSize: 12, fontWeight: '800', marginTop: spacing.xs },
  statusPill: { alignSelf: 'flex-start', backgroundColor: '#fff8f3', borderRadius: radii.pill, marginTop: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  statusPillText: { color: colors.primaryDark, fontSize: 12, fontWeight: '900', textTransform: 'capitalize' },
  expected: { color: colors.muted, fontSize: 12, fontWeight: '800', marginTop: spacing.sm },
  section: { backgroundColor: colors.card, borderRadius: radii.md, marginTop: spacing.lg, padding: spacing.lg },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: '900', marginBottom: spacing.md },
  timelineRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  timelineDot: { backgroundColor: colors.primary, borderRadius: radii.pill, height: 12, marginTop: 4, width: 12 },
  timelineBody: { flex: 1 },
  timelineTitle: { color: colors.ink, fontSize: 14, fontWeight: '900', textTransform: 'capitalize' },
  timelineText: { color: colors.muted, fontSize: 12, fontWeight: '700', lineHeight: 18, marginTop: 2 },
  infoRow: { borderBottomColor: colors.faint, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: spacing.sm },
  infoKey: { color: colors.muted, fontSize: 11, fontWeight: '900', textTransform: 'capitalize' },
  infoValue: { color: colors.ink, fontSize: 13, fontWeight: '800', marginTop: 2 },
  documentRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  documentBody: { flex: 1 },
  documentTitle: { color: colors.ink, fontWeight: '900' },
  documentStatus: { color: colors.muted, fontSize: 12, fontWeight: '700', marginTop: 2 },
  emptyText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  bodyText: { color: colors.text, fontSize: 13, fontWeight: '700', lineHeight: 20 },
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  outlineButton: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.faint, borderRadius: radii.pill, borderWidth: 1, flex: 1, flexDirection: 'row', gap: spacing.xs, justifyContent: 'center', minHeight: 46 },
  outlineText: { color: colors.primaryDark, fontWeight: '900' },
  cancelText: { color: colors.rose, fontWeight: '900' },
  disabledButton: { opacity: 0.58 },
  disabledText: { color: colors.muted },
  lockReason: { color: colors.muted, fontSize: 12, fontWeight: '800', marginTop: spacing.sm, textAlign: 'center' },
  invoiceButton: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: colors.primary, borderRadius: radii.pill, flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  invoiceButtonText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  payButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.pill, flex: 1, flexDirection: 'row', gap: spacing.xs, justifyContent: 'center', minHeight: 46 },
  payButtonText: { color: '#fff', fontWeight: '900' },
});

export default BookedServiceDetailsScreen;
