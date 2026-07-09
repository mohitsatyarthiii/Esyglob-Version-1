import React from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { fetchQuotations, fetchRFQs } from '../api/marketplace';
import { Quotation, RFQ } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { colors, radii, shadow, spacing, type as typography } from '../theme';
import { getId } from '../utils/format';
import AuthScreen from './AuthScreen';

// ──────────────────────────────────────
// Alibaba-inspired palette
// ──────────────────────────────────────
const PALETTE = {
  primary: '#FF6A00',
  primaryLight: '#FFF3E8',
  primaryDark: '#E05500',
  emerald: '#00B578',
  sky: '#3B9CFF',
  violet: '#7B61FF',
  rose: '#FF3B6E',
  amber: '#FF9500',
  ink: '#1A1A1A',
  text: '#333333',
  muted: '#8C8C8C',
  faint: '#E8E8E8',
  surface: '#FFFFFF',
  background: '#F5F5F5',
} as const;

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'active', label: 'Active' },
  { key: 'quoted', label: 'Quoted' },
  { key: 'negotiating', label: 'Negotiating' },
  { key: 'converted', label: 'Converted' },
  { key: 'closed', label: 'Closed' },
] as const;

// ──────────────────────────────────────
// Status config for visual badges
// ──────────────────────────────────────
const STATUS_CONFIG: Record<string, { bg: string; color: string; icon: string }> = {
  active: { bg: '#E8F8EE', color: '#00B578', icon: 'pulse' },
  draft: { bg: '#F5F5F5', color: '#8C8C8C', icon: 'pencil-outline' },
  quoted: { bg: '#FFF3E8', color: '#FF6A00', icon: 'cash-multiple' },
  negotiating: { bg: '#EEF0FF', color: '#7B61FF', icon: 'handshake' },
  converted: { bg: '#E8F4FF', color: '#3B9CFF', icon: 'check-decagram' },
  closed: { bg: '#FFF0F0', color: '#FF3B30', icon: 'close-circle-outline' },
  submitted: { bg: '#E8F4FF', color: '#3B9CFF', icon: 'send-outline' },
  pending: { bg: '#FFF8E8', color: '#FF9500', icon: 'clock-outline' },
  accepted: { bg: '#E8F8EE', color: '#00B578', icon: 'check-circle-outline' },
  rejected: { bg: '#FFF0F0', color: '#FF3B30', icon: 'close-circle-outline' },
};

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] ?? { bg: '#F5F5F5', color: '#8C8C8C', icon: 'information-outline' };
}

// ──────────────────────────────────────
// Main Component
// ──────────────────────────────────────
function RFQScreen() {
  const navigation = useNavigation<any>();
  const { status, activeRole } = useAuth();
  const role = activeRole === 'seller' ? 'seller' : 'buyer';
  const [tab, setTab] = React.useState<'rfqs' | 'quotations'>('rfqs');
  const [search, setSearch] = React.useState('');
  const [filter, setFilter] = React.useState('all');
  const [page, setPage] = React.useState(1);
  const scope = role === 'seller' ? 'seller' : 'buyer';

  const rfqs = useQuery({
    queryKey: ['rfqs', scope, filter, search, page],
    queryFn: () =>
      fetchRFQs({
        scope,
        status: filter === 'all' ? undefined : filter,
        search: search || undefined,
        page,
        limit: 20,
      }),
    enabled: status === 'authenticated',
    staleTime: 30_000,
  });

  const quotations = useQuery({
    queryKey: ['quotations', role, filter, page],
    queryFn: () =>
      fetchQuotations({
        status: filter === 'all' ? undefined : filter,
        page,
        limit: 30,
      }),
    enabled: status === 'authenticated',
    staleTime: 30_000,
  });

  const rfqData = rfqs.data?.rfqs ?? [];
  const quoteData = quotations.data?.quotations ?? [];

  // Safely extract pagination — TypeScript doesn't infer the shape from the API
  const rfqPagination = (rfqs.data as any)?.pagination;
  const quotePagination = (quotations.data as any)?.pagination;
  const rfqTotalPages = rfqPagination?.totalPages as number | undefined;
  const quoteTotalPages = quotePagination?.totalPages as number | undefined;

  React.useEffect(() => setPage(1), [filter, search, tab]);

  // ── Auth gate ──
  if (status !== 'authenticated') {
    return <AuthScreen onClose={() => navigation.navigate('Home')} />;
  }

  // ── Loading state ──
  if (
    (tab === 'rfqs' && rfqs.isLoading) ||
    (tab === 'quotations' && quotations.isLoading)
  ) {
    return (
      <LoadingState
        label={`Loading ${tab === 'rfqs' ? 'RFQs' : 'quotations'}`}
      />
    );
  }

  // ── Error state ──
  if (tab === 'rfqs' && rfqs.isError) {
    return (
      <ErrorState
        message={(rfqs.error as Error).message}
        onRetry={() => rfqs.refetch()}
      />
    );
  }

  if (tab === 'quotations' && quotations.isError) {
    return (
      <ErrorState
        message={(quotations.error as Error).message}
        onRetry={() => quotations.refetch()}
      />
    );
  }

  // ── Data & pagination logic ──
  const data = tab === 'rfqs' ? rfqData : quoteData;
  const totalPages = tab === 'rfqs' ? rfqTotalPages : quoteTotalPages;
  const hasMore = totalPages
    ? page < totalPages
    : data.length >= (tab === 'rfqs' ? 20 : 30);

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.list}
      data={data}
      keyExtractor={item => getId(item)}
      refreshControl={
        <RefreshControl
          refreshing={
            tab === 'rfqs' ? rfqs.isFetching : quotations.isFetching
          }
          onRefresh={() =>
            tab === 'rfqs' ? rfqs.refetch() : quotations.refetch()
          }
          tintColor={PALETTE.primary}
          colors={[PALETTE.primary]}
        />
      }
      ListHeaderComponent={
        <View style={styles.headerSection}>
          {/* ── Top bar ── */}
          <View style={styles.topBar}>
            <View style={styles.topBarLeft}>
              <Text style={styles.eyebrow}>
                {role === 'seller' ? 'Seller Sourcing Desk' : 'Buyer Sourcing Desk'}
              </Text>
              <Text style={styles.screenTitle}>RFQs & Quotations</Text>
            </View>
            {role === 'buyer' ? (
              <Pressable
                onPress={() => navigation.navigate('RFQCreate')}
                style={styles.createButton}>
                <Icon name="plus" size={22} color="#fff" />
              </Pressable>
            ) : null}
          </View>

          {/* ── Tab switcher ── */}
          <View style={styles.tabRow}>
            <Pressable
              onPress={() => setTab('rfqs')}
              style={[styles.tab, tab === 'rfqs' && styles.tabActive]}>
              <Icon
                name="clipboard-list-outline"
                size={18}
                color={tab === 'rfqs' ? PALETTE.primary : PALETTE.muted}
              />
              <Text style={[styles.tabLabel, tab === 'rfqs' && styles.tabLabelActive]}>
                RFQs
              </Text>
              {rfqData.length > 0 ? (
                <View style={styles.tabCount}>
                  <Text style={styles.tabCountText}>{rfqData.length}</Text>
                </View>
              ) : null}
            </Pressable>
            <Pressable
              onPress={() => setTab('quotations')}
              style={[styles.tab, tab === 'quotations' && styles.tabActive]}>
              <Icon
                name="cash-multiple"
                size={18}
                color={tab === 'quotations' ? PALETTE.primary : PALETTE.muted}
              />
              <Text style={[styles.tabLabel, tab === 'quotations' && styles.tabLabelActive]}>
                Quotations
              </Text>
              {quoteData.length > 0 ? (
                <View style={styles.tabCount}>
                  <Text style={styles.tabCountText}>{quoteData.length}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>

          {/* ── Search bar ── */}
          <View style={styles.searchBar}>
            <Icon name="magnify" size={20} color={PALETTE.muted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search by title, category, or destination"
              placeholderTextColor={PALETTE.muted}
              style={styles.searchInput}
              returnKeyType="search"
            />
            {search.length > 0 ? (
              <Pressable onPress={() => setSearch('')} hitSlop={8}>
                <Icon name="close-circle" size={18} color={PALETTE.muted} />
              </Pressable>
            ) : null}
          </View>

          {/* ── Status filter chips ── */}
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={STATUS_FILTERS}
            keyExtractor={item => item.key}
            contentContainerStyle={styles.filterRow}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => setFilter(item.key)}
                style={[
                  styles.filterChip,
                  filter === item.key && styles.filterChipActive,
                ]}>
                <Text
                  style={[
                    styles.filterChipText,
                    filter === item.key && styles.filterChipTextActive,
                  ]}>
                  {item.label}
                </Text>
              </Pressable>
            )}
          />

          {/* ── Results count ── */}
          <Text style={styles.resultCount}>
            {data.length} {tab === 'rfqs' ? 'RFQs' : 'quotations'} found
          </Text>
        </View>
      }
      renderItem={({ item }) =>
        tab === 'rfqs' ? (
          <RFQCard item={item as RFQ} role={role} />
        ) : (
          <QuotationCard item={item as Quotation} />
        )
      }
      ListEmptyComponent={
        <EmptyState
          title={tab === 'rfqs' ? 'No RFQs found' : 'No quotations found'}
          detail="Try adjusting your filters or create a new RFQ."
        />
      }
      ListFooterComponent={
        <View style={styles.footer}>
          <Pressable
            disabled={page <= 1}
            onPress={() => setPage(p => Math.max(p - 1, 1))}
            style={[styles.pageBtn, page <= 1 && styles.pageBtnDisabled]}>
            <Icon name="chevron-left" size={20} color={PALETTE.ink} />
            <Text style={styles.pageBtnText}>Previous</Text>
          </Pressable>
          <Text style={styles.pageIndicator}>
            Page {page}{totalPages ? ` of ${totalPages}` : ''}
          </Text>
          <Pressable
            disabled={!hasMore}
            onPress={() => setPage(p => p + 1)}
            style={[styles.pageBtn, !hasMore && styles.pageBtnDisabled]}>
            <Text style={styles.pageBtnText}>Next</Text>
            <Icon name="chevron-right" size={20} color={PALETTE.ink} />
          </Pressable>
        </View>
      }
    />
  );
}

// ──────────────────────────────────────
// RFQ Card
// ──────────────────────────────────────
function RFQCard({ item, role }: { item: RFQ; role: 'buyer' | 'seller' }) {
  const navigation = useNavigation<any>();
  const destination = item.destinationCountry ?? item.deliveryCountry;
  const statusCfg = getStatusConfig(item.status ?? 'active');

  return (
    <Pressable
      onPress={() =>
        navigation.navigate('RFQDetails', { rfqId: getId(item) })
      }
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      {/* Status badge — top right */}
      <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}>
        <Icon name={statusCfg.icon} size={12} color={statusCfg.color} />
        <Text style={[styles.statusBadgeText, { color: statusCfg.color }]}>
          {(item.status ?? 'active').replace(/_/g, ' ')}
        </Text>
      </View>

      {/* Title & meta */}
      <Text style={styles.cardTitle} numberOfLines={2}>
        {item.title ?? item.productName ?? 'Untitled RFQ'}
      </Text>
      <Text style={styles.cardMeta}>
        {role === 'seller' ? 'Opportunity' : 'Your request'} ·{' '}
        {item.createdAt
          ? new Date(item.createdAt).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })
          : 'Recently'}
      </Text>

      {/* Description */}
      {item.description ? (
        <Text style={styles.cardDescription} numberOfLines={2}>
          {item.description}
        </Text>
      ) : null}

      {/* Key details row */}
      <View style={styles.detailRow}>
        <DetailChip
          icon="cube-outline"
          label={`${item.quantity ?? '—'} ${item.unit ?? 'units'}`}
        />
        {destination ? (
          <DetailChip icon="map-marker-outline" label={destination} />
        ) : null}
        {item.targetPrice ? (
          <DetailChip
            icon="currency-inr"
            label={`${item.currency ?? '₹'} ${Number(item.targetPrice).toLocaleString('en-IN')}`}
          />
        ) : null}
      </View>

      {/* Bottom CTA */}
      <View style={styles.cardCta}>
        <Text style={styles.cardCtaText}>View details</Text>
        <Icon name="arrow-right" size={16} color={PALETTE.primary} />
      </View>
    </Pressable>
  );
}

// ──────────────────────────────────────
// Quotation Card
// ──────────────────────────────────────
function QuotationCard({ item }: { item: Quotation }) {
  const navigation = useNavigation<any>();
  const rfq = typeof item.rfqId === 'object' ? (item.rfqId as any) : undefined;
  const product =
    typeof item.productId === 'object' ? (item.productId as any) : undefined;
  const title = item.title ?? product?.name ?? rfq?.title ?? 'Quotation';
  const statusCfg = getStatusConfig(item.status ?? 'submitted');

  return (
    <Pressable
      onPress={() =>
        navigation.navigate('QuotationDetails', {
          quotationId: getId(item),
        })
      }
      style={({ pressed }) => [
        styles.card,
        styles.quoteCard,
        pressed && styles.cardPressed,
      ]}>
      {/* Status badge */}
      <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}>
        <Icon name={statusCfg.icon} size={12} color={statusCfg.color} />
        <Text style={[styles.statusBadgeText, { color: statusCfg.color }]}>
          {(item.status ?? 'submitted').replace(/_/g, ' ')}
        </Text>
      </View>

      {/* Title */}
      <Text style={styles.cardTitle} numberOfLines={2}>
        {title}
      </Text>
      <Text style={styles.cardMeta}>
        {item.createdAt
          ? new Date(item.createdAt).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })
          : 'Recently'}
      </Text>

      {/* Price highlight */}
      {item.totalPrice || item.unitPrice ? (
        <View style={styles.priceHighlight}>
          <Text style={styles.priceValue}>
            {item.currency ?? '₹'}{' '}
            {Number(item.totalPrice ?? item.unitPrice).toLocaleString('en-IN')}
          </Text>
          {item.unitPrice && item.quantity ? (
            <Text style={styles.priceUnit}>
              {item.currency ?? '₹'} {Number(item.unitPrice).toLocaleString('en-IN')} / unit · Qty: {item.quantity}
            </Text>
          ) : null}
        </View>
      ) : (
        <Text style={styles.pricePending}>Price on request</Text>
      )}

      {/* Detail chips */}
      <View style={styles.detailRow}>
        {item.quantity ? (
          <DetailChip
            icon="cube-outline"
            label={`${item.quantity} ${item.unit ?? 'units'}`}
          />
        ) : null}
        {item.leadTime ? (
          <DetailChip icon="clock-outline" label={String(item.leadTime)} />
        ) : null}
      </View>

      {/* Bottom CTA */}
      <View style={styles.cardCta}>
        <Text style={styles.cardCtaText}>Review quotation</Text>
        <Icon name="arrow-right" size={16} color={PALETTE.primary} />
      </View>
    </Pressable>
  );
}

// ──────────────────────────────────────
// Detail chip (mini fact)
// ──────────────────────────────────────
function DetailChip({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={styles.detailChip}>
      <Icon name={icon} size={13} color={PALETTE.muted} />
      <Text style={styles.detailChipText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

// ──────────────────────────────────────
// Styles
// ──────────────────────────────────────
const styles = StyleSheet.create({
  screen: {
    backgroundColor: PALETTE.background,
    flex: 1,
  },
  list: {
    paddingBottom: 120,
  },

  // ── Header section ──
  headerSection: {
    padding: spacing.lg,
    paddingTop: spacing.xxl,
  },
  topBar: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  topBarLeft: {
    flex: 1,
  },
  eyebrow: {
    color: PALETTE.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  screenTitle: {
    color: PALETTE.ink,
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginTop: 4,
  },
  createButton: {
    alignItems: 'center',
    backgroundColor: PALETTE.primary,
    borderRadius: radii.lg,
    height: 48,
    justifyContent: 'center',
    width: 48,
    shadowColor: PALETTE.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },

  // ── Tabs ──
  tabRow: {
    backgroundColor: PALETTE.surface,
    borderRadius: radii.lg,
    flexDirection: 'row',
    marginBottom: spacing.md,
    padding: 4,
    ...shadow,
  },
  tab: {
    alignItems: 'center',
    borderRadius: radii.md,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingVertical: 12,
  },
  tabActive: {
    backgroundColor: PALETTE.primaryLight,
  },
  tabLabel: {
    color: PALETTE.muted,
    fontSize: 14,
    fontWeight: '700',
  },
  tabLabelActive: {
    color: PALETTE.primary,
  },
  tabCount: {
    alignItems: 'center',
    backgroundColor: PALETTE.primary,
    borderRadius: 10,
    justifyContent: 'center',
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tabCountText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },

  // ── Search ──
  searchBar: {
    alignItems: 'center',
    backgroundColor: PALETTE.surface,
    borderRadius: radii.lg,
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    ...shadow,
  },
  searchInput: {
    color: PALETTE.ink,
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    minHeight: 48,
  },

  // ── Filter chips ──
  filterRow: {
    gap: spacing.sm,
    marginBottom: spacing.md,
    paddingRight: spacing.lg,
  },
  filterChip: {
    backgroundColor: PALETTE.surface,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    ...shadow,
  },
  filterChipActive: {
    backgroundColor: PALETTE.primaryLight,
    borderColor: PALETTE.primary,
    borderWidth: 1.5,
  },
  filterChipText: {
    color: PALETTE.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  filterChipTextActive: {
    color: PALETTE.primaryDark,
  },

  // ── Result count ──
  resultCount: {
    color: PALETTE.muted,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },

  // ── Cards ──
  card: {
    backgroundColor: PALETTE.surface,
    borderRadius: radii.lg,
    marginBottom: spacing.md,
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    position: 'relative',
    ...shadow,
  },
  quoteCard: {
    borderLeftColor: PALETTE.emerald,
    borderLeftWidth: 3,
  },
  cardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },

  // ── Status badge ──
  statusBadge: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: 4,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },

  // ── Card content ──
  cardTitle: {
    color: PALETTE.ink,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
    lineHeight: 22,
    marginBottom: 4,
  },
  cardMeta: {
    color: PALETTE.muted,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  cardDescription: {
    color: PALETTE.text,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 19,
    marginBottom: spacing.md,
  },

  // ── Price highlight (quotations) ──
  priceHighlight: {
    backgroundColor: PALETTE.primaryLight,
    borderRadius: radii.md,
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  priceValue: {
    color: PALETTE.primaryDark,
    fontSize: 20,
    fontWeight: '900',
  },
  priceUnit: {
    color: PALETTE.primary,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  pricePending: {
    color: PALETTE.muted,
    fontSize: 13,
    fontWeight: '600',
    fontStyle: 'italic',
    marginBottom: spacing.md,
  },

  // ── Detail row ──
  detailRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  detailChip: {
    alignItems: 'center',
    backgroundColor: PALETTE.background,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  detailChipText: {
    color: PALETTE.text,
    fontSize: 11,
    fontWeight: '700',
    maxWidth: 140,
  },

  // ── Card CTA ──
  cardCta: {
    alignItems: 'center',
    borderTopColor: PALETTE.faint,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'flex-end',
    paddingTop: spacing.md,
  },
  cardCtaText: {
    color: PALETTE.primary,
    fontSize: 12,
    fontWeight: '800',
  },

  // ── Footer pagination ──
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  pageBtn: {
    alignItems: 'center',
    backgroundColor: PALETTE.surface,
    borderRadius: radii.lg,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...shadow,
  },
  pageBtnDisabled: {
    opacity: 0.35,
  },
  pageBtnText: {
    color: PALETTE.ink,
    fontSize: 13,
    fontWeight: '800',
  },
  pageIndicator: {
    color: PALETTE.muted,
    fontSize: 12,
    fontWeight: '700',
  },
});

export default RFQScreen;