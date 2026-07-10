import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { fetchSellers } from '../api/marketplace';
import { SellerSummary } from '../api/types';
import RemoteImage from '../components/RemoteImage';
import SavedHeartButton from '../components/SavedHeartButton';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { colors, radii, shadow, spacing } from '../theme';
import { getStableKey } from '../utils/format';
import { firstImage } from '../utils/images';

type SortMode = 'verified' | 'rating' | 'products' | 'latest';

const filters: Array<{ label: string; sort: SortMode; verified?: boolean }> = [
  { label: 'Verified', sort: 'verified', verified: true },
  { label: 'Top rated', sort: 'rating' },
  { label: 'Products', sort: 'products' },
  { label: 'Latest', sort: 'latest' },
];

function SellersScreen() {
  const navigation = useNavigation<any>();
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [filter, setFilter] = useState(filters[0]);
  const sellers = useInfiniteQuery({
    queryKey: ['sellers-module', submittedQuery, filter.sort, filter.verified],
    queryFn: ({ pageParam }) => fetchSellers({
      page: Number(pageParam),
      limit: 12,
      search: submittedQuery,
      sort: filter.sort,
      isVerified: filter.verified,
    }),
    initialPageParam: 1,
    getNextPageParam: lastPage => {
      const pagination = lastPage.pagination as { page?: number; totalPages?: number } | undefined;
      return pagination?.page && pagination.totalPages && pagination.page < pagination.totalPages
        ? pagination.page + 1
        : undefined;
    },
    staleTime: 120_000,
  });
  const rows = useMemo(() => sellers.data?.pages.flatMap(page => page.sellers) ?? [], [sellers.data]);
  const submit = () => setSubmittedQuery(query.trim());

  if (sellers.isLoading) {
    return <LoadingState label="Loading verified suppliers" />;
  }

  if (sellers.isError) {
    return <ErrorState message={(sellers.error as Error)?.message ?? 'Suppliers could not be loaded.'} onRetry={() => sellers.refetch()} />;
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconButton}>
          <Icon name="arrow-left" size={22} color={colors.ink} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.kicker}>EsyGlob suppliers</Text>
          <Text style={styles.title}>Verified sellers</Text>
        </View>
        <Pressable onPress={() => navigation.navigate('RFQCreate')} style={styles.rfqButton}>
          <Icon name="clipboard-list-outline" size={18} color="#fff" />
        </Pressable>
      </View>

      <FlashList
        data={rows}
        keyExtractor={item => getStableKey(item)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={sellers.isRefetching && !sellers.isFetchingNextPage} onRefresh={() => sellers.refetch()} tintColor={colors.primary} />}
        onEndReachedThreshold={0.35}
        onEndReached={() => {
          if (sellers.hasNextPage && !sellers.isFetchingNextPage) {
            sellers.fetchNextPage();
          }
        }}
        ListHeaderComponent={
          <View>
            <View style={styles.searchBox}>
              <Icon name="magnify" size={20} color={colors.primary} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={submit}
                placeholder="Search suppliers, products, countries"
                placeholderTextColor={colors.muted}
                returnKeyType="search"
                style={styles.searchInput}
              />
              <Pressable onPress={submit} style={styles.searchSubmit}>
                <Icon name="arrow-right" size={18} color="#fff" />
              </Pressable>
            </View>
            <FlatList
              data={filters}
              horizontal
              keyExtractor={item => item.label}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRail}
              initialNumToRender={filters.length}
              removeClippedSubviews
              renderItem={({ item }) => {
                const active = filter.label === item.label;
                return (
                  <Pressable onPress={() => setFilter(item)} style={[styles.filterChip, active && styles.filterChipActive]}>
                    <Text style={[styles.filterText, active && styles.filterTextActive]}>{item.label}</Text>
                  </Pressable>
                );
              }}
            />
            <View style={styles.summaryCard}>
              <View style={styles.summaryIcon}>
                <Icon name="shield-check-outline" size={22} color={colors.primary} />
              </View>
              <View style={styles.summaryCopy}>
                <Text style={styles.summaryTitle}>Trusted supplier directory</Text>
                <Text style={styles.summaryText}>Compare verification, response, factory details, categories, and product depth before contacting sellers.</Text>
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={<EmptyState title="No suppliers found" detail="Try another search term or filter." />}
        ListFooterComponent={sellers.isFetchingNextPage ? <ActivityIndicator color={colors.primary} style={styles.footerLoader} /> : null}
        renderItem={({ item }) => <SellerDirectoryCard seller={item} />}
      />
    </View>
  );
}

function SellerDirectoryCard({ seller }: { seller: SellerSummary }) {
  const navigation = useNavigation<any>();
  const title = seller.companyName ?? seller.businessName ?? seller.displayName ?? 'Supplier';
  const sellerId = seller._id ?? seller.id ?? title;
  const verified = seller.isVerified || seller.verificationStatus === 'verified';
  const trusted = seller.trustedSeller || seller.isTrusted || seller.trustedBadgeActive || verified;
  const location = [seller.address?.city, seller.address?.state, seller.address?.country ?? seller.country].filter(Boolean).join(', ') || 'Worldwide';
  const type = seller.businessType ?? seller.companyType ?? seller.supplierType ?? 'Manufacturer / Supplier';
  const categories = seller.mainCategories?.filter(Boolean).slice(0, 4) ?? [];
  const previewImages = seller.factoryImages?.filter(Boolean).slice(0, 4) ?? [];
  const image = getSellerImage(seller);

  return (
    <Pressable onPress={() => navigation.navigate('SellerDetails', { sellerId, sellerName: title })} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      <View style={styles.cardTop}>
        <RemoteImage
          uri={image}
          width={128}
          height={128}
          style={styles.logo}
          fallback={<Text style={styles.logoText}>{title.slice(0, 1).toUpperCase()}</Text>}
        />
        <View style={styles.cardBody}>
          <View style={styles.titleRow}>
            <Text numberOfLines={2} style={styles.sellerName}>{title}</Text>
            {trusted ? <Icon name="check-decagram" size={19} color={colors.primary} /> : null}
            <SavedHeartButton type="supplier" itemId={sellerId} target={seller} size={15} style={styles.saveButton} iconColor={colors.muted} />
          </View>
          <Text numberOfLines={1} style={styles.sellerMeta}>{type}</Text>
          <Text numberOfLines={1} style={styles.location}>{location}</Text>
          <View style={styles.badges}>
            {verified ? <MiniBadge icon="shield-check-outline" label="Business verified" color={colors.green} /> : null}
            {seller.factoryVerified ? <MiniBadge icon="factory" label="Factory checked" color={colors.secondary} /> : null}
            {trusted ? <MiniBadge icon="star-circle-outline" label="Trusted" color={colors.primary} /> : null}
          </View>
        </View>
      </View>

      <Text numberOfLines={2} style={styles.description}>
        {seller.companyIntroduction ?? seller.description ?? 'Verified B2B supplier with marketplace-ready products and sourcing support.'}
      </Text>

      <View style={styles.statGrid}>
        <SellerStat label="Years" value={seller.yearsInBusiness ?? '-'} icon="calendar-check-outline" />
        <SellerStat label="Response" value={seller.responseRate ?? seller.responseTime ?? '-'} icon="timer-outline" />
        <SellerStat label="Products" value={seller.productCount ?? '-'} icon="package-variant-closed" />
        <SellerStat label="Rating" value={seller.rating ?? '-'} icon="star-outline" />
      </View>

      {categories.length ? (
        <View style={styles.tags}>
          {categories.map(category => <Text key={category} numberOfLines={1} style={styles.tag}>{category}</Text>)}
        </View>
      ) : null}

      {previewImages.length ? (
        <View style={styles.previewStrip}>
          {previewImages.map((uri, index) => (
            <RemoteImage key={`${uri}-${index}`} uri={uri} width={180} height={120} style={styles.previewImage} />
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable onPress={() => navigation.navigate('SellerDetails', { sellerId, sellerName: title })} style={styles.outlineAction}>
          <Icon name="storefront-outline" size={14} color={colors.primaryDark} />
          <Text style={styles.outlineActionText}>View Profile</Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate('Messages')} style={styles.outlineAction}>
          <Icon name="message-text-outline" size={14} color={colors.primaryDark} />
          <Text style={styles.outlineActionText}>Chat Now</Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate('RFQCreate', { prefill: { sellerId, supplierName: title } })} style={styles.primaryAction}>
          <Icon name="bullseye-arrow" size={14} color="#fff" />
          <Text style={styles.primaryActionText}>Send RFQ</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

function MiniBadge({ icon, label, color }: { icon: string; label: string; color: string }) {
  return (
    <View style={[styles.miniBadge, { backgroundColor: `${color}12`, borderColor: `${color}30` }]}>
      <Icon name={icon} size={11} color={color} />
      <Text style={[styles.miniBadgeText, { color }]}>{label}</Text>
    </View>
  );
}

function SellerStat({ icon, label, value }: { icon: string; label: string; value: unknown }) {
  return (
    <View style={styles.statBox}>
      <Icon name={icon} size={13} color={colors.primary} />
      <Text numberOfLines={1} style={styles.statValue}>{String(value)}</Text>
      <Text numberOfLines={1} style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function getSellerImage(seller: SellerSummary) {
  const record = seller as SellerSummary & {
    profileImage?: string;
    avatar?: string;
    image?: string;
    coverImage?: string;
    bannerImage?: string;
    images?: string[];
  };

  return firstImage(
    seller.logo,
    seller.companyLogo,
    record.profileImage,
    record.avatar,
    record.image,
    record.coverImage,
    record.bannerImage,
    seller.factoryImages,
    record.images,
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
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xxl,
  },
  iconButton: { alignItems: 'center', height: 42, justifyContent: 'center', width: 42 },
  headerText: { flex: 1 },
  kicker: { color: colors.primary, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  title: { color: colors.ink, fontSize: 21, fontWeight: '900', marginTop: 2 },
  rfqButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.pill, height: 40, justifyContent: 'center', width: 40 },
  content: { padding: spacing.lg, paddingBottom: 110 },
  searchBox: { alignItems: 'center', backgroundColor: colors.card, borderRadius: radii.md, flexDirection: 'row', gap: spacing.sm, minHeight: 52, paddingHorizontal: spacing.md, ...shadow },
  searchInput: { color: colors.ink, flex: 1, fontSize: 14, fontWeight: '800', padding: 0 },
  searchSubmit: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.pill, height: 34, justifyContent: 'center', width: 34 },
  filterRail: { gap: spacing.sm, paddingVertical: spacing.md },
  filterChip: { backgroundColor: colors.card, borderColor: colors.faint, borderRadius: radii.pill, borderWidth: 1, marginRight: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.muted, fontSize: 12, fontWeight: '900' },
  filterTextActive: { color: '#fff' },
  summaryCard: { alignItems: 'center', backgroundColor: '#fff8f3', borderColor: '#ffe0d0', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md, padding: spacing.md },
  summaryIcon: { alignItems: 'center', backgroundColor: colors.card, borderRadius: radii.pill, height: 44, justifyContent: 'center', width: 44 },
  summaryCopy: { flex: 1 },
  summaryTitle: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  summaryText: { color: colors.text, fontSize: 12, fontWeight: '700', lineHeight: 17, marginTop: 3 },
  card: { backgroundColor: colors.card, borderColor: '#e8edf5', borderRadius: radii.lg, borderWidth: 1, marginBottom: spacing.lg, padding: spacing.md, ...shadow },
  cardPressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  cardTop: { flexDirection: 'row', gap: spacing.md },
  logo: { alignItems: 'center', backgroundColor: '#fff2eb', borderColor: '#ffe0d0', borderRadius: radii.md, borderWidth: 1, height: 64, justifyContent: 'center', overflow: 'hidden', width: 64 },
  logoText: { color: colors.primaryDark, fontSize: 22, fontWeight: '900' },
  cardBody: { flex: 1 },
  titleRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.xs },
  sellerName: { color: colors.ink, flex: 1, fontSize: 16, fontWeight: '900', lineHeight: 20 },
  saveButton: { height: 30, width: 30 },
  sellerMeta: { color: colors.text, fontSize: 12, fontWeight: '800', marginTop: 3 },
  location: { color: colors.muted, fontSize: 11, fontWeight: '800', marginTop: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  miniBadge: { alignItems: 'center', borderRadius: radii.pill, borderWidth: 1, flexDirection: 'row', gap: 3, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  miniBadgeText: { fontSize: 9, fontWeight: '900' },
  description: { color: colors.text, fontSize: 12, fontWeight: '700', lineHeight: 17, marginTop: spacing.md },
  statGrid: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  statBox: { backgroundColor: colors.cardMuted, borderRadius: radii.md, flex: 1, minHeight: 58, padding: spacing.sm },
  statValue: { color: colors.ink, fontSize: 12, fontWeight: '900', marginTop: 2 },
  statLabel: { color: colors.muted, fontSize: 9, fontWeight: '800', marginTop: 1 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.md },
  tag: { backgroundColor: '#f7f8fb', borderColor: '#e8edf5', borderRadius: radii.pill, borderWidth: 1, color: colors.ink, fontSize: 10, fontWeight: '800', maxWidth: 150, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  previewStrip: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  previewImage: { backgroundColor: colors.cardMuted, borderRadius: radii.sm, flex: 1, height: 62 },
  actions: { borderTopColor: colors.faint, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, paddingTop: spacing.md },
  outlineAction: { alignItems: 'center', backgroundColor: '#fff8f3', borderRadius: radii.pill, flex: 1, flexDirection: 'row', gap: 4, justifyContent: 'center', minHeight: 38 },
  outlineActionText: { color: colors.primaryDark, fontSize: 11, fontWeight: '900' },
  primaryAction: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.pill, flex: 1, flexDirection: 'row', gap: 4, justifyContent: 'center', minHeight: 38 },
  primaryActionText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  footerLoader: { padding: spacing.xl },
});

export default SellersScreen;
