import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { fetchAggregatedServiceActivity, getServicesForRole, ServiceCatalogItem, ServiceRequest } from '../api/services';
import { useAuth } from '../auth/AuthContext';
import RemoteImage from '../components/RemoteImage';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { colors, radii, shadow, spacing, type } from '../theme';

const statusFilters = ['All', 'Popular', 'Recommended', 'Essential', 'New'];
const priceFilters = ['Any price', 'Included', 'Quote based', 'From'];

function ServicesScreen() {
  const navigation = useNavigation<any>();
  const { activeRole, user } = useAuth();
  const role = activeRole === 'seller' ? 'seller' : 'buyer';
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [status, setStatus] = useState('All');
  const [price, setPrice] = useState('Any price');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const services = useMemo(() => getServicesForRole(role), [role]);
  const activity = useQuery({
    queryKey: ['service-activity', role],
    queryFn: () => fetchAggregatedServiceActivity(role),
    refetchInterval: 45_000,
  });
  const categories = useMemo(() => ['All', ...Array.from(new Set(services.map(service => service.category)))], [services]);
  const filteredServices = useMemo(
    () => services.filter(service => matchesService(service, query, category, status, price)),
    [category, price, query, services, status],
  );
  const activeBookings = useMemo(() => activity.data?.filter(item => !['completed', 'cancelled', 'rejected', 'refunded'].includes(String(item.status ?? '').toLowerCase())).slice(0, 5) ?? [], [activity.data]);
  const completedCount = activity.data?.filter(item => String(item.status ?? '').toLowerCase() === 'completed').length ?? 0;
  const pendingCount = activity.data?.filter(item => String(item.status ?? '').toLowerCase().includes('pending') || String(item.status ?? '').toLowerCase() === 'submitted').length ?? 0;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.kicker}>{role === 'seller' ? 'Seller services' : 'Buyer services'}</Text>
            <Text style={styles.title}>Services</Text>
          </View>
          <Pressable onPress={() => setFiltersOpen(true)} style={styles.iconButton}>
            <Icon name="tune-variant" size={22} color={colors.ink} />
          </Pressable>
        </View>
        <Text style={styles.welcome}>Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''}. Find, book, and track EsyGlob operations support.</Text>
        <View style={styles.searchShell}>
          <Icon name="magnify" size={21} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search inspection, logistics, documents..."
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Icon name="close-circle" size={19} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <FlatList
        data={filteredServices}
        keyExtractor={item => item.key}
        refreshControl={<RefreshControl refreshing={activity.isRefetching} onRefresh={() => activity.refetch()} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            <View style={styles.statsRow}>
              <StatusTile icon="progress-clock" label="Active" value={String(activeBookings.length)} tone={colors.blue} />
              <StatusTile icon="file-clock-outline" label="Pending" value={String(pendingCount)} tone={colors.amber} />
              <StatusTile icon="check-circle-outline" label="Completed" value={String(completedCount)} tone={colors.green} />
            </View>
            <SectionTitle title="Quick actions" />
            <View style={styles.quickRow}>
              <QuickAction icon="briefcase-search-outline" label="My Services" onPress={() => navigation.navigate('BookedServiceDetails', { mode: 'list' })} />
              <QuickAction icon="truck-fast-outline" label="Logistics" onPress={() => setCategory('Logistics')} />
              <QuickAction icon="file-document-edit-outline" label="Documents" onPress={() => setCategory('Compliance')} />
            </View>
            {activeBookings.length ? (
              <View>
                <SectionTitle title="Active bookings" action="View all" onAction={() => navigation.navigate('BookedServiceDetails', { mode: 'list' })} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bookingRail}>
                  {activeBookings.map(item => <BookingMiniCard key={getRequestId(item)} request={item} onPress={() => navigation.navigate('BookedServiceDetails', { request: item })} />)}
                </ScrollView>
              </View>
            ) : null}
            <SectionTitle title="Featured services" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.featuredRail}>
              {services.slice(0, 4).map(service => <FeaturedCard key={service.key} service={service} onPress={() => navigation.navigate('ServiceDetails', { serviceKey: service.key })} />)}
            </ScrollView>
            <SectionTitle title="Recommended for you" />
            <FlatList
              horizontal
              data={categories}
              keyExtractor={item => item}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
              renderItem={({ item }) => (
                <Pressable onPress={() => setCategory(item)} style={[styles.chip, category === item && styles.chipActive]}>
                  <Text style={[styles.chipText, category === item && styles.chipTextActive]}>{item}</Text>
                </Pressable>
              )}
            />
          </View>
        }
        ListEmptyComponent={activity.isLoading ? <LoadingState label="Loading services" /> : <EmptyState title="No services found" detail="Try a different search term or filter." />}
        ListFooterComponent={activity.isError ? <ErrorState message={(activity.error as Error)?.message ?? 'Service activity could not load.'} onRetry={() => activity.refetch()} /> : null}
        renderItem={({ item }) => <ServiceCard service={item} onPress={() => navigation.navigate('ServiceDetails', { serviceKey: item.key })} />}
      />

      <FilterSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        category={category}
        categories={categories}
        status={status}
        price={price}
        onCategory={setCategory}
        onStatus={setStatus}
        onPrice={setPrice}
      />
    </View>
  );
}

function matchesService(service: ServiceCatalogItem, query: string, category: string, status: string, price: string) {
  const term = query.trim().toLowerCase();
  const haystack = [service.title, service.category, service.shortDescription, service.description, ...service.keywords].join(' ').toLowerCase();
  const categoryMatch = category === 'All' || service.category === category;
  const statusMatch = status === 'All' || service.status === status;
  const priceMatch = price === 'Any price' || service.startingPrice.toLowerCase().includes(price.toLowerCase());
  const searchMatch = !term || haystack.includes(term) || haystack.split(/\s+/).some(word => word.startsWith(term) || distance(word, term) <= 1);
  return categoryMatch && statusMatch && priceMatch && searchMatch;
}

function distance(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 2 || b.length < 3) {
    return 3;
  }
  let mismatches = 0;
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) {
      mismatches += 1;
    }
  }
  return mismatches + Math.abs(a.length - b.length);
}

function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? <Pressable onPress={onAction}><Text style={styles.sectionAction}>{action}</Text></Pressable> : null}
    </View>
  );
}

function StatusTile({ icon, label, value, tone }: { icon: string; label: string; value: string; tone: string }) {
  return (
    <View style={styles.statusTile}>
      <Icon name={icon} size={20} color={tone} />
      <Text style={styles.statusValue}>{value}</Text>
      <Text style={styles.statusLabel}>{label}</Text>
    </View>
  );
}

function QuickAction({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.quickCard}>
      <Icon name={icon} size={24} color={colors.primary} />
      <Text style={styles.quickText}>{label}</Text>
    </Pressable>
  );
}

function FeaturedCard({ service, onPress }: { service: ServiceCatalogItem; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.featuredCard}>
      <RemoteImage uri={service.image} width={360} height={220} style={styles.featuredImage} />
      <View style={styles.featuredScrim} />
      <View style={styles.featuredBody}>
        <View style={styles.badgeDark}><Text style={styles.badgeDarkText}>{service.status}</Text></View>
        <Text numberOfLines={2} style={styles.featuredTitle}>{service.title}</Text>
        <Text numberOfLines={2} style={styles.featuredMeta}>{service.startingPrice} / {service.duration}</Text>
      </View>
    </Pressable>
  );
}

function ServiceCard({ service, onPress }: { service: ServiceCatalogItem; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.serviceCard}>
      <RemoteImage uri={service.image} width={180} height={120} style={styles.cardImage} fallback={<Icon name={service.icon} size={30} color={colors.primary} />} />
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <View style={styles.iconBadge}><Icon name={service.icon} size={16} color={colors.primaryDark} /></View>
          <Text style={styles.cardCategory}>{service.category}</Text>
          <Text style={styles.cardStatus}>{service.status}</Text>
        </View>
        <Text numberOfLines={1} style={styles.cardTitle}>{service.title}</Text>
        <Text numberOfLines={2} style={styles.cardDescription}>{service.shortDescription}</Text>
        <View style={styles.cardMetaRow}>
          <Text style={styles.cardMeta}>{service.startingPrice}</Text>
          <Text style={styles.cardMeta}>{service.duration}</Text>
        </View>
        <View style={styles.viewDetailsRow}>
          <Text style={styles.viewDetails}>View Details</Text>
          <Icon name="chevron-right" size={18} color={colors.primaryDark} />
        </View>
      </View>
    </Pressable>
  );
}

function BookingMiniCard({ request, onPress }: { request: ServiceRequest; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.bookingCard}>
      <Text numberOfLines={1} style={styles.bookingTitle}>{request.serviceTitle ?? request.title ?? request.subject ?? request.orderNumber ?? 'Service booking'}</Text>
      <Text style={styles.bookingId}>{request.requestNumber ?? request.transactionNumber ?? request.inspectionNumber ?? getRequestId(request)}</Text>
      <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${getProgress(request.status)}%` }]} /></View>
      <Text style={styles.bookingStatus}>{formatStatus(request.status)}</Text>
    </Pressable>
  );
}

function FilterSheet({
  visible,
  onClose,
  category,
  categories,
  status,
  price,
  onCategory,
  onStatus,
  onPrice,
}: {
  visible: boolean;
  onClose: () => void;
  category: string;
  categories: string[];
  status: string;
  price: string;
  onCategory: (value: string) => void;
  onStatus: (value: string) => void;
  onPrice: (value: string) => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>Filters</Text>
        <FilterGroup title="Category" items={categories} value={category} onChange={onCategory} />
        <FilterGroup title="Status" items={statusFilters} value={status} onChange={onStatus} />
        <FilterGroup title="Price" items={priceFilters} value={price} onChange={onPrice} />
        <Pressable onPress={onClose} style={styles.applyButton}><Text style={styles.applyText}>Apply filters</Text></Pressable>
      </View>
    </Modal>
  );
}

function FilterGroup({ title, items, value, onChange }: { title: string; items: string[]; value: string; onChange: (value: string) => void }) {
  return (
    <View>
      <Text style={styles.filterTitle}>{title}</Text>
      <View style={styles.filterWrap}>
        {items.map(item => (
          <Pressable key={item} onPress={() => onChange(item)} style={[styles.sheetChip, value === item && styles.sheetChipActive]}>
            <Text style={[styles.sheetChipText, value === item && styles.sheetChipTextActive]}>{item}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function getRequestId(request: ServiceRequest) {
  return request._id ?? request.id ?? request.requestNumber ?? request.orderNumber ?? Math.random().toString(36);
}

function getProgress(status?: string) {
  const key = String(status ?? 'submitted').toLowerCase();
  if (['completed', 'delivered', 'approved'].includes(key)) return 100;
  if (['processing', 'in_progress', 'booked', 'funded'].includes(key)) return 62;
  if (['under_review', 'document_review'].includes(key)) return 38;
  if (['cancelled', 'rejected'].includes(key)) return 10;
  return 22;
}

function formatStatus(status?: string) {
  return String(status ?? 'pending').replace(/_/g, ' ');
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  header: { backgroundColor: '#fff8f3', paddingHorizontal: spacing.lg, paddingTop: spacing.xxl, paddingBottom: spacing.lg },
  headerTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  kicker: { color: colors.primaryDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  title: { color: colors.ink, fontSize: type.hero, fontWeight: '900', marginTop: 2 },
  welcome: { color: colors.text, fontSize: 13, fontWeight: '700', lineHeight: 19, marginTop: spacing.sm },
  iconButton: { alignItems: 'center', backgroundColor: colors.card, borderRadius: radii.pill, height: 42, justifyContent: 'center', width: 42 },
  searchShell: { alignItems: 'center', backgroundColor: colors.card, borderRadius: radii.md, flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, minHeight: 50, paddingHorizontal: spacing.md, ...shadow },
  searchInput: { color: colors.ink, flex: 1, fontSize: 14, fontWeight: '800', padding: 0 },
  content: { padding: spacing.lg, paddingBottom: 122 },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  statusTile: { backgroundColor: colors.card, borderRadius: radii.md, flex: 1, padding: spacing.md },
  statusValue: { color: colors.ink, fontSize: 20, fontWeight: '900', marginTop: spacing.xs },
  statusLabel: { color: colors.muted, fontSize: 11, fontWeight: '800', marginTop: 2 },
  sectionTitleRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xl, marginBottom: spacing.md },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  sectionAction: { color: colors.primaryDark, fontSize: 12, fontWeight: '900' },
  quickRow: { flexDirection: 'row', gap: spacing.sm },
  quickCard: { alignItems: 'center', backgroundColor: colors.card, borderRadius: radii.md, flex: 1, minHeight: 76, justifyContent: 'center', padding: spacing.sm },
  quickText: { color: colors.ink, fontSize: 11, fontWeight: '900', marginTop: spacing.xs, textAlign: 'center' },
  bookingRail: { gap: spacing.md, paddingRight: spacing.lg },
  bookingCard: { backgroundColor: colors.card, borderRadius: radii.md, padding: spacing.md, width: 210 },
  bookingTitle: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  bookingId: { color: colors.muted, fontSize: 11, fontWeight: '800', marginTop: spacing.xs },
  progressTrack: { backgroundColor: colors.cardMuted, borderRadius: radii.pill, height: 7, marginTop: spacing.md, overflow: 'hidden' },
  progressFill: { backgroundColor: colors.primary, borderRadius: radii.pill, height: 7 },
  bookingStatus: { color: colors.primaryDark, fontSize: 11, fontWeight: '900', marginTop: spacing.sm, textTransform: 'capitalize' },
  featuredRail: { gap: spacing.md, paddingRight: spacing.lg },
  featuredCard: { borderRadius: radii.md, height: 178, overflow: 'hidden', width: 250 },
  featuredImage: { height: 178, width: 250 },
  featuredScrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.25)' },
  featuredBody: { bottom: spacing.md, left: spacing.md, position: 'absolute', right: spacing.md },
  badgeDark: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  badgeDarkText: { color: colors.primaryDark, fontSize: 10, fontWeight: '900' },
  featuredTitle: { color: '#fff', fontSize: 18, fontWeight: '900', marginTop: spacing.sm },
  featuredMeta: { color: '#fff', fontSize: 12, fontWeight: '800', marginTop: spacing.xs },
  chipRow: { gap: spacing.sm, paddingBottom: spacing.md },
  chip: { backgroundColor: colors.card, borderColor: colors.faint, borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  chipTextActive: { color: '#fff' },
  serviceCard: { backgroundColor: colors.card, borderRadius: radii.md, flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md, padding: spacing.md },
  cardImage: { backgroundColor: colors.cardMuted, borderRadius: radii.sm, height: 104, width: 96 },
  cardBody: { flex: 1 },
  cardTop: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  iconBadge: { alignItems: 'center', backgroundColor: '#fff2eb', borderRadius: radii.pill, height: 26, justifyContent: 'center', width: 26 },
  cardCategory: { color: colors.muted, flex: 1, fontSize: 11, fontWeight: '900' },
  cardStatus: { backgroundColor: '#e9fbfb', borderRadius: radii.pill, color: colors.secondary, fontSize: 10, fontWeight: '900', paddingHorizontal: spacing.sm, paddingVertical: 3 },
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: '900', marginTop: spacing.sm },
  cardDescription: { color: colors.text, fontSize: 12, fontWeight: '700', lineHeight: 17, marginTop: spacing.xs },
  cardMetaRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  cardMeta: { color: colors.muted, fontSize: 11, fontWeight: '900' },
  viewDetailsRow: { alignItems: 'center', flexDirection: 'row', marginTop: spacing.sm },
  viewDetails: { color: colors.primaryDark, fontSize: 12, fontWeight: '900' },
  modalBackdrop: { backgroundColor: 'rgba(0,0,0,0.35)', flex: 1 },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, padding: spacing.lg },
  sheetHandle: { alignSelf: 'center', backgroundColor: colors.faint, borderRadius: radii.pill, height: 4, marginBottom: spacing.md, width: 48 },
  sheetTitle: { color: colors.ink, fontSize: 20, fontWeight: '900', marginBottom: spacing.md },
  filterTitle: { color: colors.ink, fontSize: 13, fontWeight: '900', marginTop: spacing.md },
  filterWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  sheetChip: { backgroundColor: colors.cardMuted, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  sheetChipActive: { backgroundColor: colors.primary },
  sheetChipText: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  sheetChipTextActive: { color: '#fff' },
  applyButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.pill, marginTop: spacing.xl, minHeight: 48, justifyContent: 'center' },
  applyText: { color: '#fff', fontWeight: '900' },
});

export default React.memo(ServicesScreen);
