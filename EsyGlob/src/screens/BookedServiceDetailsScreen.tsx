import React, { useMemo } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cancelServiceActivity, fetchAggregatedServiceActivity, ServiceRequest } from '../api/services';
import { useAuth } from '../auth/AuthContext';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { colors, radii, spacing } from '../theme';
import { RootStackParamList } from '../../App';
ss
function BookedServiceDetailsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, 'BookedServiceDetails'>>();
  const { activeRole } = useAuth();
  const queryClient = useQueryClient();
  const activity = useQuery({
    queryKey: ['service-activity', activeRole],
    queryFn: () => fetchAggregatedServiceActivity(activeRole),
    refetchInterval: 45_000,
  });
  const request = route.params?.request;
  const cancel = useMutation({ mutationFn: () => { if (!request) throw new Error('Service request is unavailable.'); return cancelServiceActivity(request); }, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['service-activity'] }); navigation.replace('BookedServiceDetails', { mode: 'list' }); } });

  if (route.params?.mode === 'list' || !request) {
    if (activity.isLoading) {
      return <LoadingState label="Loading your services" />;
    }
    if (activity.isError) {
      return <ErrorState message={(activity.error as Error)?.message ?? 'Your services could not be loaded.'} onRetry={() => activity.refetch()} />;
    }
    return (
      <View style={styles.screen}>
        <Header title="My Services" />
        <FlatList
          data={activity.data ?? []}
          keyExtractor={item => getRequestId(item)}
          refreshControl={<RefreshControl refreshing={activity.isRefetching} onRefresh={() => activity.refetch()} />}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={<StatusSummary requests={activity.data ?? []} />}
          ListEmptyComponent={<EmptyState title="No service bookings yet" detail="Booked services and requests will appear here." />}
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
  return (
    <Pressable onPress={onPress} style={styles.bookingCard}>
      <View style={styles.bookingTop}>
        <Text numberOfLines={1} style={styles.bookingTitle}>{request.serviceTitle ?? request.title ?? request.subject ?? 'Service booking'}</Text>
        <Icon name="chevron-right" size={22} color={colors.muted} />
      </View>
      <Text style={styles.bookingId}>{request.requestNumber ?? request.orderNumber ?? request.transactionNumber ?? getRequestId(request)}</Text>
      <Text style={styles.bookingDate}>Date: {request.createdAt ? new Date(request.createdAt).toLocaleDateString() : 'Recently submitted'}</Text>
      <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${getProgress(request.status)}%` }]} /></View>
      <Text style={styles.bookingStatus}>{formatStatus(request.status)}</Text>
    </Pressable>
  );
}

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
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  summaryTile: { backgroundColor: colors.card, borderRadius: radii.md, flexBasis: '48%', flexGrow: 1, padding: spacing.md },
  summaryValue: { color: colors.ink, fontSize: 22, fontWeight: '900' },
  summaryLabel: { color: colors.muted, fontSize: 12, fontWeight: '900', marginTop: spacing.xs, textTransform: 'capitalize' },
  bookingCard: { backgroundColor: colors.card, borderRadius: radii.md, marginBottom: spacing.md, padding: spacing.md },
  bookingTop: { alignItems: 'center', flexDirection: 'row' },
  bookingTitle: { color: colors.ink, flex: 1, fontSize: 16, fontWeight: '900' },
  bookingId: { color: colors.muted, fontSize: 12, fontWeight: '800', marginTop: spacing.xs },
  bookingDate: { color: colors.text, fontSize: 12, fontWeight: '700', marginTop: spacing.xs },
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
});

export default BookedServiceDetailsScreen;
