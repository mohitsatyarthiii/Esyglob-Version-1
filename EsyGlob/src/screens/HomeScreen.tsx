import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { fetchHome } from '../api/home';
import { fetchSellers } from '../api/marketplace';
import { fetchProducts } from '../api/products';
import { searchMarketplace } from '../api/search';
import { Product, SellerSummary } from '../api/types';
import ProductCard from '../components/ProductCard';
import RemoteImage from '../components/RemoteImage';
import SectionHeader from '../components/SectionHeader';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { colors, radii, shadow, spacing, type } from '../theme';
import { getId, getProductLocation, getStableKey, isVerifiedProduct } from '../utils/format';

type HomeTab = 'AI' | 'Products' | 'Manufacturers' | 'Worldwide';

const tabs: HomeTab[] = ['AI', 'Products', 'Manufacturers', 'Worldwide'];

function HomeScreen() {
  const navigation = useNavigation<any>();
  const [activeTab, setActiveTab] = useState<HomeTab>('AI');
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const home = useQuery({
    queryKey: ['home'],
    queryFn: fetchHome,
  });
  const search = useQuery({
    queryKey: ['home-search', submittedQuery],
    queryFn: () => searchMarketplace(submittedQuery),
    enabled: submittedQuery.trim().length > 1,
    staleTime: 60_000,
  });
  const products = useInfiniteQuery({
    queryKey: ['home-products-feed'],
    queryFn: ({ pageParam }) => fetchProducts({ page: Number(pageParam), limit: 18, sort: 'latest' }),
    initialPageParam: 1,
    enabled: activeTab === 'Products',
    getNextPageParam: lastPage => {
      const pagination = lastPage.pagination;
      return pagination?.page && pagination.totalPages && pagination.page < pagination.totalPages
        ? pagination.page + 1
        : undefined;
    },
  });
  const sellers = useQuery({
    queryKey: ['manufacturers-directory'],
    queryFn: () => fetchSellers({ limit: 30, sort: 'verified' }),
    enabled: activeTab === 'Manufacturers' || activeTab === 'AI',
    staleTime: 120_000,
  });

  const homeProducts = useMemo(
    () => [
      ...(home.data?.featuredProducts ?? []),
      ...(home.data?.recommendedProducts ?? []),
      ...(home.data?.latestProducts ?? []),
    ],
    [home.data],
  );
  const productFeed = useMemo(() => products.data?.pages.flatMap(page => page.products) ?? [], [products.data]);
  const verifiedProducts = useMemo(() => homeProducts.filter(isVerifiedProduct), [homeProducts]);
  const manufacturers = useMemo(
    () => sellers.data?.sellers?.length ? sellers.data.sellers : collectSellers(productFeed.length ? productFeed : homeProducts),
    [homeProducts, productFeed, sellers.data],
  );
  const countries = useMemo(() => collectCountries(productFeed.length ? productFeed : homeProducts), [homeProducts, productFeed]);

  const submitSearch = () => setSubmittedQuery(query.trim());

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.brand}>EsyGlob</Text>
          <View style={styles.headerActions}>
            <Pressable style={styles.iconButton}>
              <Icon name="bell-outline" size={22} color={colors.ink} />
            </Pressable>
            <Pressable onPress={() => navigation.navigate('Messages')} style={styles.iconButton}>
              <Icon name="message-text-outline" size={22} color={colors.ink} />
            </Pressable>
            <Pressable onPress={() => navigation.navigate('Account')} style={styles.iconButton}>
              <Icon name="account-outline" size={22} color={colors.ink} />
            </Pressable>
          </View>
        </View>
        <View style={styles.tabs}>
          {tabs.map(tab => (
            <Pressable key={tab} onPress={() => setActiveTab(tab)} style={styles.tabButton}>
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
              {activeTab === tab ? <View style={styles.tabIndicator} /> : null}
            </Pressable>
          ))}
        </View>
      </View>

      {activeTab === 'AI' ? (
        <ScrollView
          refreshControl={<RefreshControl refreshing={home.isRefetching || search.isRefetching} onRefresh={() => home.refetch()} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}>
          <View style={styles.searchShell}>
            <Icon name="camera-outline" size={25} color={colors.ink} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={submitSearch}
              returnKeyType="search"
              placeholder="Search Products, Suppliers, Categories..."
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
            />
            <Pressable hitSlop={8}>
              <Icon name="microphone-outline" size={22} color={colors.ink} />
            </Pressable>
            <Pressable onPress={submitSearch} style={styles.searchButton}>
              <Icon name="magnify" size={24} color="#fff" />
            </Pressable>
          </View>

          {submittedQuery ? (
            <SearchResults
              loading={search.isLoading}
              error={search.error as Error | null}
              onRetry={() => search.refetch()}
              products={search.data?.products ?? []}
              categories={search.data?.categories ?? []}
              sellers={search.data?.suppliers?.length ? search.data.suppliers : collectSellers(search.data?.products ?? [])}
            />
          ) : (
            <>
              <View style={styles.quickRow}>
                <QuickAction icon="view-grid-outline" title="Source by category" onPress={() => navigation.navigate('Categories')} />
                <QuickAction icon="bullseye-arrow" title="Request quotation" onPress={() => navigation.navigate('RFQ')} />
                <QuickAction icon="check-decagram-outline" title="Verified suppliers" onPress={() => setActiveTab('Manufacturers')} />
              </View>
              <ProductSection title="Featured products" products={home.data?.featuredProducts ?? []} loading={home.isLoading} />
              <ProductSection title="Recommended products" products={home.data?.recommendedProducts ?? []} loading={home.isLoading} />
              <ProductSection title="Latest arrivals" products={home.data?.latestProducts ?? []} loading={home.isLoading} />
            </>
          )}
        </ScrollView>
      ) : null}

      {activeTab === 'Products' ? (
        <FlatList
          data={productFeed}
          keyExtractor={item => getId(item)}
          numColumns={2}
          contentContainerStyle={styles.gridContent}
          columnWrapperStyle={styles.gridColumn}
          refreshControl={<RefreshControl refreshing={products.isRefetching && !products.isFetchingNextPage} onRefresh={() => products.refetch()} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (products.hasNextPage && !products.isFetchingNextPage) {
              products.fetchNextPage();
            }
          }}
          ListHeaderComponent={
            <View>
              <ProductSection title="Featured products" products={home.data?.featuredProducts ?? []} loading={home.isLoading} />
              <ProductSection title="Trending products" products={home.data?.trendingProducts ?? []} loading={home.isLoading} />
              <ProductSection title="Recommended products" products={home.data?.recommendedProducts ?? []} loading={home.isLoading} />
              <ProductSection title="Verified products" products={verifiedProducts} loading={home.isLoading} />
              <SectionHeader title="Latest products" />
            </View>
          }
          ListEmptyComponent={products.isLoading ? <LoadingState label="Loading products" /> : <EmptyState title="No products" />}
          ListFooterComponent={products.isFetchingNextPage ? <ActivityIndicator color={colors.primary} style={styles.footerLoader} /> : null}
          renderItem={({ item }) => <ProductCard product={item} variant="grid" />}
        />
      ) : null}

      {activeTab === 'Manufacturers' ? (
        <FlatList
          data={manufacturers}
          keyExtractor={item => getStableKey(item)}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={home.isRefetching} onRefresh={() => home.refetch()} />}
          ListEmptyComponent={(home.isLoading || sellers.isLoading) ? <LoadingState label="Loading manufacturers" /> : <EmptyState title="No manufacturers available" />}
          renderItem={({ item }) => <SellerCard seller={item} />}
        />
      ) : null}

      {activeTab === 'Worldwide' ? (
        <FlatList
          data={countries}
          keyExtractor={item => item.country}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={home.isRefetching} onRefresh={() => home.refetch()} />}
          ListEmptyComponent={home.isLoading ? <LoadingState label="Loading worldwide products" /> : <EmptyState title="No worldwide products" />}
          renderItem={({ item }) => (
            <View style={styles.countryCard}>
              <View style={styles.countryHeader}>
                <Icon name="earth" size={22} color={colors.secondary} />
                <Text style={styles.countryTitle}>{item.country}</Text>
                <Text style={styles.countryCount}>{item.products.length}</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList}>
                {item.products.map(product => <ProductCard key={getId(product)} product={product} />)}
              </ScrollView>
            </View>
          )}
        />
      ) : null}
    </View>
  );
}

function SearchResults({
  loading,
  error,
  onRetry,
  products,
  categories,
  sellers,
}: {
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  products: Product[];
  categories: { _id?: string; id?: string; name?: string; slug?: string }[];
  sellers: SellerSummary[];
}) {
  const navigation = useNavigation<any>();

  if (loading) {
    return <LoadingState label="Searching marketplace" />;
  }

  if (error) {
    return <ErrorState message={error.message} onRetry={onRetry} />;
  }

  if (!products.length && !categories.length && !sellers.length) {
    return <EmptyState title="No results found" detail="Try a different product, supplier, or category term." />;
  }

  return (
    <View>
      {categories.length ? (
        <View>
          <SectionHeader title="Categories" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipList}>
            {categories.map(category => (
              <Pressable
                key={getStableKey(category)}
                onPress={() => navigation.navigate('ProductListing', { category: category.name ?? getId(category), categoryName: category.name })}
                style={styles.resultChip}>
                <Text style={styles.resultChipText}>{category.name ?? category.slug ?? 'Category'}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
      {sellers.length ? (
        <View>
          <SectionHeader title="Suppliers" />
          {sellers.slice(0, 4).map(seller => <SellerCard key={getStableKey(seller)} seller={seller} compact />)}
        </View>
      ) : null}
      <ProductSection title="Products" products={products} loading={false} />
    </View>
  );
}

function ProductSection({ title, products, loading }: { title: string; products: Product[]; loading: boolean }) {
  const navigation = useNavigation<any>();

  if (loading) {
    return <SkeletonSection title={title} />;
  }

  if (!products.length) {
    return null;
  }

  return (
    <View>
      <SectionHeader title={title} action="View all" onAction={() => navigation.navigate('ProductListing')} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList}>
        {products.map(product => <ProductCard key={getId(product)} product={product} />)}
      </ScrollView>
    </View>
  );
}

function QuickAction({ icon, title, onPress }: { icon: string; title: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.quickCard}>
      <Icon name={icon} size={28} color={colors.primary} />
      <Text style={styles.quickTitle}>{title}</Text>
    </Pressable>
  );
}

function SellerCard({ seller, compact }: { seller: SellerSummary; compact?: boolean }) {
  const navigation = useNavigation<any>();
  const verified = seller.isVerified || seller.verificationStatus === 'verified';
  const title = seller.companyName ?? seller.businessName ?? seller.displayName ?? 'Supplier';
  const location = seller.address?.country ?? seller.country ?? 'Worldwide';
  const categories = seller.mainCategories?.filter(Boolean).slice(0, 3) ?? [];
  const previewImages = seller.factoryImages?.filter(Boolean).slice(0, 3) ?? [];
  const businessType = seller.businessType ?? seller.companyType ?? seller.supplierType;
  const intro = seller.companyIntroduction ?? seller.description;

  return (
    <Pressable
      onPress={() => navigation.navigate('SellerDetails', { sellerId: seller._id ?? seller.id ?? title, sellerName: title })}
      style={[styles.sellerCard, compact && styles.sellerCompact]}>
      <View style={styles.sellerHeroRow}>
        <View style={styles.sellerLogo}>
          <Text style={styles.sellerLogoText}>{title.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={styles.sellerBody}>
          <View style={styles.sellerTitleRow}>
            <Text numberOfLines={1} style={styles.sellerTitle}>{title}</Text>
            {verified ? <Icon name="check-decagram" size={18} color={colors.green} /> : null}
            {seller.factoryVerified ? <Icon name="factory" size={18} color={colors.secondary} /> : null}
          </View>
          <Text style={styles.sellerMeta}>{[businessType, location].filter(Boolean).join(' • ')}</Text>
          {intro ? <Text numberOfLines={2} style={styles.sellerIntro}>{intro}</Text> : null}
        </View>
      </View>
      {previewImages.length ? (
        <View style={styles.factoryStrip}>
          {previewImages.map((uri, index) => (
            <RemoteImage key={`${uri}-${index}`} uri={uri} width={220} height={140} style={styles.factoryImage} />
          ))}
        </View>
      ) : null}
      <View style={styles.sellerStats}>
        {seller.yearsInBusiness ? <StatPill icon="calendar-check-outline" text={`${seller.yearsInBusiness} yrs`} /> : null}
        {seller.rating ? <StatPill icon="star" text={`${seller.rating} rating`} /> : null}
        {seller.responseRate ? <StatPill icon="timer-outline" text={`${seller.responseRate} response`} /> : null}
        {seller.productCount ? <StatPill icon="package-variant-closed" text={`${seller.productCount} products`} /> : null}
        {seller.minMoq ? <StatPill icon="format-list-numbered" text={`MOQ ${seller.minMoq}`} /> : null}
      </View>
      {categories.length ? (
        <View style={styles.categoryTags}>
          {categories.map(category => <Text key={category} numberOfLines={1} style={styles.categoryTag}>{category}</Text>)}
        </View>
      ) : null}
    </Pressable>
  );
}

function StatPill({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.statPill}>
      <Icon name={icon} size={13} color={colors.primaryDark} />
      <Text style={styles.sellerStat}>{text}</Text>
    </View>
  );
}

function SkeletonSection({ title }: { title: string }) {
  return (
    <View>
      <SectionHeader title={title} />
      <View style={styles.skeletonRow}>
        {[0, 1, 2].map(item => <View key={item} style={styles.skeletonCard} />)}
      </View>
    </View>
  );
}

function collectSellers(products: Product[]) {
  const sellers = new Map<string, SellerSummary>();

  products.forEach(product => {
    const seller = product.seller ?? product.sellerId;
    if (!seller || typeof seller === 'string') {
      return;
    }

    const id = getStableKey(seller);
    const existing = sellers.get(id);
    sellers.set(id, {
      ...existing,
      ...seller,
      productCount: (existing?.productCount ?? 0) + 1,
      mainCategories: Array.from(new Set([...(existing?.mainCategories ?? []), product.category].filter(Boolean) as string[])),
    });
  });

  return Array.from(sellers.values());
}

function collectCountries(products: Product[]) {
  const byCountry = new Map<string, Product[]>();

  products.forEach(product => {
    const country = getProductLocation(product);
    if (!country) {
      return;
    }

    byCountry.set(country, [...(byCountry.get(country) ?? []), product]);
  });

  return Array.from(byCountry.entries()).map(([country, countryProducts]) => ({ country, products: countryProducts }));
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  header: {
    backgroundColor: '#fff8f3',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
  },
  headerTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  brand: {
    color: colors.ink,
    fontSize: type.title,
    fontWeight: '900',
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  tabs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
  },
  tabButton: {
    alignItems: 'center',
    minHeight: 44,
  },
  tabText: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  tabTextActive: {
    fontSize: 20,
  },
  tabIndicator: {
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    height: 4,
    marginTop: spacing.sm,
    width: 86,
  },
  content: {
    paddingBottom: 116,
  },
  searchShell: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.primary,
    borderRadius: radii.md,
    borderWidth: 2,
    flexDirection: 'row',
    gap: spacing.sm,
    margin: spacing.lg,
    minHeight: 58,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    ...shadow,
  },
  searchInput: {
    color: colors.ink,
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    padding: 0,
  },
  searchButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    height: 48,
    justifyContent: 'center',
    width: 62,
  },
  quickRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  quickCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    flex: 1,
    minHeight: 92,
    justifyContent: 'center',
    padding: spacing.sm,
  },
  quickTitle: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '900',
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  horizontalList: {
    paddingBottom: spacing.xxl,
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
  },
  gridContent: {
    paddingBottom: 116,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
  },
  gridColumn: {
    alignItems: 'stretch',
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: 116,
  },
  footerLoader: {
    padding: spacing.xl,
  },
  sellerCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    marginBottom: spacing.md,
    padding: spacing.md,
    ...shadow,
  },
  sellerCompact: {
    elevation: 0,
    marginHorizontal: spacing.lg,
    shadowOpacity: 0,
  },
  sellerLogo: {
    alignItems: 'center',
    backgroundColor: '#fff2eb',
    borderRadius: radii.md,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  sellerLogoText: {
    color: colors.primaryDark,
    fontSize: 20,
    fontWeight: '900',
  },
  sellerBody: {
    flex: 1,
    marginLeft: spacing.md,
  },
  sellerHeroRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  sellerTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  sellerTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: 15,
    fontWeight: '900',
  },
  sellerMeta: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  sellerIntro: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: spacing.xs,
  },
  factoryStrip: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  factoryImage: {
    backgroundColor: colors.cardMuted,
    borderRadius: radii.sm,
    flex: 1,
    height: 74,
  },
  sellerStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  statPill: {
    alignItems: 'center',
    backgroundColor: '#fff8f3',
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  sellerStat: {
    color: colors.primaryDark,
    fontSize: 11,
    fontWeight: '900',
  },
  categoryTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  categoryTag: {
    backgroundColor: colors.cardMuted,
    borderRadius: radii.pill,
    color: colors.ink,
    fontSize: 11,
    fontWeight: '800',
    maxWidth: 150,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  countryCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    marginBottom: spacing.lg,
    paddingTop: spacing.md,
  },
  countryHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  countryTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: 17,
    fontWeight: '900',
  },
  countryCount: {
    color: colors.muted,
    fontWeight: '900',
  },
  chipList: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  resultChip: {
    backgroundColor: colors.card,
    borderColor: colors.faint,
    borderRadius: radii.pill,
    borderWidth: 1,
    marginRight: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  resultChipText: {
    color: colors.ink,
    fontWeight: '800',
  },
  skeletonRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  skeletonCard: {
    backgroundColor: colors.cardMuted,
    borderRadius: radii.md,
    height: 210,
    width: 180,
  },
});

export default React.memo(HomeScreen);
