import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
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
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import { fetchNotificationCenter } from '../api/account';
import { fetchCategories } from '../api/categories';
import { fetchSellers } from '../api/marketplace';
import { fetchProducts } from '../api/products';
import { searchMarketplace } from '../api/search';
import { Category, Product, SellerSummary } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import ProductCard from '../components/ProductCard';
import RemoteImage from '../components/RemoteImage';
import SavedHeartButton from '../components/SavedHeartButton';
import SectionHeader from '../components/SectionHeader';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { spacing } from '../theme';
import { getId, getStableKey, isVerifiedProduct } from '../utils/format';
import { firstImage } from '../utils/images';

type HomeTab = 'AI' | 'Products' | 'Manufacturers';

const TABS: HomeTab[] = ['AI', 'Products', 'Manufacturers'];

type ExploreAction = {
  icon: string;
  title: string;
  color: string;
  route?: string;
  tab?: HomeTab;
};

const EXPLORE_ACTIONS: ExploreAction[] = [
  { icon: 'robot-outline', title: 'AI Chat', color: '#6366F1', route: 'AIChat' },
  { icon: 'calculator-variant-outline', title: 'Tax Calc', color: '#0F8B8D' },
  { icon: 'account-search-outline', title: 'Suppliers', color: '#10B981', route: 'Sellers' },
  { icon: 'clipboard-list-outline', title: 'RFQ', color: '#F59E0B', route: 'RFQCreate' },
  { icon: 'chart-line', title: 'Insights', color: '#8B5CF6', route: 'MarketInsights' },
  { icon: 'magnify-scan', title: 'Research', color: '#2563EB', route: 'ProductListing' },
  { icon: 'briefcase-check-outline', title: 'Trade', color: '#F26A21', route: 'Services' },
  { icon: 'truck-delivery-outline', title: 'Logistics', color: '#06B6D4', route: 'ShippingLogistics' },
];

const PALETTE = {
  primary: '#2563EB',
  primaryLight: '#EFF6FF',
  primaryDark: '#1D4ED8',
  accent: '#F26A21',
  accentLight: '#FFF7ED',
  emerald: '#10B981',
  amber: '#F59E0B',
  rose: '#EF4444',
  violet: '#7C3AED',
  sky: '#0EA5E9',
  ink: '#0F172A',
  text: '#1E293B',
  muted: '#64748B',
  faint: '#E2E8F0',
  surface: '#FFFFFF',
  background: '#F8FAFC',
  cardMuted: '#F1F5F9',
};

const CACHE_CONFIG = {
  staleTime: 5 * 60_000,
  gcTime: 30 * 60_000,
  retry: 2,
  retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 8000),
};

function HomeScreen() {
  const navigation = useNavigation<any>();
  const { status } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<HomeTab>('AI');
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const tabPosition = useRef(new Animated.Value(0)).current;
  const [tabWidths, setTabWidths] = useState<number[]>([]);

  // Prefetch all data on mount
  useEffect(() => {
    const prefetchAll = async () => {
      await Promise.allSettled([
        queryClient.prefetchQuery({ queryKey: ['home-categories'], queryFn: fetchCategories, ...CACHE_CONFIG }),
        queryClient.prefetchQuery({ queryKey: ['home-featured-products'], queryFn: () => fetchProducts({ limit: 12, sort: 'latest', verifiedOnly: true }), ...CACHE_CONFIG }),
        queryClient.prefetchQuery({ queryKey: ['home-latest-products'], queryFn: () => fetchProducts({ limit: 30, sort: 'latest' }), ...CACHE_CONFIG }),
        queryClient.prefetchInfiniteQuery({
          queryKey: ['home-products-feed'],
          queryFn: ({ pageParam }) => fetchProducts({ page: Number(pageParam), limit: 18, sort: 'latest' }),
          initialPageParam: 1,
          ...CACHE_CONFIG,
        }),
        queryClient.prefetchQuery({ queryKey: ['manufacturers-directory'], queryFn: () => fetchSellers({ limit: 30, sort: 'verified' }), ...CACHE_CONFIG }),
      ]);
    };
    prefetchAll();
  }, [queryClient]);

  // Smooth tab animation
  useEffect(() => {
    const index = TABS.indexOf(activeTab);
    if (tabWidths.length === TABS.length) {
      const targetX = tabWidths.slice(0, index).reduce((sum, w) => sum + w + 6, 0);
      Animated.spring(tabPosition, {
        toValue: targetX,
        tension: 300,
        friction: 20,
        useNativeDriver: true,
      }).start();
    }
  }, [activeTab, tabWidths, tabPosition]);

  const categoriesQuery = useQuery({
    queryKey: ['home-categories'],
    queryFn: fetchCategories,
    ...CACHE_CONFIG,
  });

  const featuredProducts = useQuery({
    queryKey: ['home-featured-products'],
    queryFn: () => fetchProducts({ limit: 12, sort: 'latest', verifiedOnly: true }),
    ...CACHE_CONFIG,
  });

  const latestProducts = useQuery({
    queryKey: ['home-latest-products'],
    queryFn: () => fetchProducts({ limit: 30, sort: 'latest' }),
    ...CACHE_CONFIG,
  });

  const search = useQuery({
    queryKey: ['home-search', submittedQuery],
    queryFn: () => searchMarketplace(submittedQuery),
    enabled: submittedQuery.trim().length > 1,
    staleTime: 60_000,
    placeholderData: (previousData: any) => previousData,
  });

  const products = useInfiniteQuery({
    queryKey: ['home-products-feed'],
    queryFn: ({ pageParam }) => fetchProducts({ page: Number(pageParam), limit: 18, sort: 'latest' }),
    initialPageParam: 1,
    ...CACHE_CONFIG,
    getNextPageParam: (lastPage: any) => {
      const pagination = lastPage.pagination;
      return pagination?.page && pagination.totalPages && pagination.page < pagination.totalPages
        ? pagination.page + 1
        : undefined;
    },
  });

  const sellers = useQuery({
    queryKey: ['manufacturers-directory'],
    queryFn: () => fetchSellers({ limit: 30, sort: 'verified' }),
    ...CACHE_CONFIG,
  });

  const notifications = useQuery({
    queryKey: ['notification-center'],
    queryFn: fetchNotificationCenter,
    enabled: status === 'authenticated',
    staleTime: 45_000,
  });

  const homeProducts = useMemo(
    () => [...(featuredProducts.data?.products ?? []), ...(latestProducts.data?.products?.slice(12, 24) ?? []), ...(latestProducts.data?.products ?? [])],
    [featuredProducts.data, latestProducts.data],
  );

  const productFeed = useMemo(() => products.data?.pages?.flatMap((page: any) => page.products) ?? [], [products.data]);
  const verifiedProducts = useMemo(() => homeProducts.filter(isVerifiedProduct), [homeProducts]);
  
  const manufacturers = useMemo(
    () => sellers.data?.sellers?.length ? sellers.data.sellers : collectSellers(productFeed.length ? productFeed : homeProducts),
    [homeProducts, productFeed, sellers.data],
  );
  
  const categories = useMemo(
    () => (categoriesQuery.data ?? []).filter((cat: Category, i: number, list: Category[]) => list.findIndex((c: Category) => getStableKey(c) === getStableKey(cat)) === i),
    [categoriesQuery.data],
  );

  const submitSearch = useCallback(() => setSubmittedQuery(query.trim()), [query]);
  const handleTabChange = useCallback((tab: HomeTab) => setActiveTab(tab), []);

  const openExplore = useCallback((action: ExploreAction) => {
    if (action.tab) { setActiveTab(action.tab); return; }
    if (action.route) { navigation.navigate(action.route); return; }
    Alert.alert(action.title, 'Coming soon to mobile app.');
  }, [navigation]);

  const refreshAll = useCallback(() => {
    Promise.allSettled([
      categoriesQuery.refetch(),
      featuredProducts.refetch(),
      latestProducts.refetch(),
      sellers.refetch(),
    ]).catch(() => {});
  }, [categoriesQuery, featuredProducts, latestProducts, sellers]);

  const renderHeader = () => (
    <View>
      <SearchBar
        query={query}
        onChangeText={setQuery}
        onSubmit={submitSearch}
        onCameraPress={() => navigation.navigate('ImageSearch')}
      />
      <ExploreShortcuts actions={EXPLORE_ACTIONS} onPress={openExplore} />
      <CategorySlider categories={categories} loading={categoriesQuery.isLoading} navigation={navigation} />
    </View>
  );

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.brandRow}>
            <Icon name="shopping" size={22} color={PALETTE.primary} />
            <Text style={styles.brand}>EsyGlob</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => navigation.navigate(status === 'authenticated' ? 'Notifications' : 'Auth', { initialMode: 'login' })}
              style={styles.iconBtn}>
              <Icon name="bell-outline" size={18} color={PALETTE.primary} />
              {status === 'authenticated' && (notifications.data?.unreadCount ?? 0) > 0 && <View style={styles.badge} />}
            </Pressable>
            <Pressable onPress={() => navigation.navigate('Messages')} style={styles.iconBtn}>
              <Icon name="message-text-outline" size={18} color={PALETTE.primary} />
            </Pressable>
            <Pressable onPress={() => navigation.navigate('Account')} style={styles.iconBtn}>
              <Icon name="account-outline" size={18} color={PALETTE.primary} />
            </Pressable>
          </View>
        </View>

        {/* Animated Tab Switcher */}
        <View style={styles.tabContainer}>
          <View style={styles.tabTrack}>
            {tabWidths.length === TABS.length && (
              <Animated.View
                style={[
                  styles.tabIndicator,
                  {
                    transform: [{ translateX: tabPosition }],
                    width: tabWidths[TABS.indexOf(activeTab)] || 0,
                  },
                ]}
              />
            )}
            {TABS.map((tab, index) => (
              <Pressable
                key={tab}
                onPress={() => handleTabChange(tab)}
                onLayout={(e) => {
                  const w = e.nativeEvent.layout.width;
                  setTabWidths(prev => {
                    const next = [...prev];
                    next[index] = w;
                    return next;
                  });
                }}
                style={styles.tabButton}>
                <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                  {tab}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      {/* Tab Content */}
      <View style={styles.content}>
        {activeTab === 'AI' && (
          <AITab
            submittedQuery={submittedQuery}
            search={search}
            categoriesQuery={categoriesQuery}
            featuredProducts={featuredProducts}
            latestProducts={latestProducts}
            categories={categories}
            openExplore={openExplore}
            navigation={navigation}
            refreshAll={refreshAll}
          />
        )}
        {activeTab === 'Products' && (
          <ProductsTab
            productFeed={productFeed}
            products={products}
            featuredProducts={featuredProducts}
            latestProducts={latestProducts}
            verifiedProducts={verifiedProducts}
            categories={categories}
            openExplore={openExplore}
            navigation={navigation}
            renderHeader={renderHeader}
          />
        )}
        {activeTab === 'Manufacturers' && (
          <ManufacturersTab
            manufacturers={manufacturers}
            sellers={sellers}
            categories={categories}
            openExplore={openExplore}
            navigation={navigation}
            refreshAll={refreshAll}
          />
        )}
      </View>
    </View>
  );
}

// ──────────────────────────────────────
// AI Tab
// ──────────────────────────────────────
const AITab = React.memo(({ submittedQuery, search, categoriesQuery, featuredProducts, latestProducts, categories, openExplore, navigation, refreshAll }: any) => {
  if (submittedQuery) {
    return (
      <ScrollView
        refreshControl={<RefreshControl refreshing={search.isFetching} onRefresh={() => search.refetch()} tintColor={PALETTE.primary} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.tabContent}>
        <SearchResults
          loading={search.isLoading}
          error={search.error as Error | null}
          onRetry={() => search.refetch()}
          products={search.data?.products ?? []}
          categories={search.data?.categories ?? []}
          sellers={search.data?.suppliers?.length ? search.data.suppliers : collectSellers(search.data?.products ?? [])}
          navigation={navigation}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={categoriesQuery.isRefetching || featuredProducts.isRefetching || latestProducts.isRefetching} onRefresh={refreshAll} tintColor={PALETTE.primary} />}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.tabContent}>
      <ExploreShortcuts actions={EXPLORE_ACTIONS} onPress={openExplore} />
      <CategorySlider categories={categories} loading={categoriesQuery.isLoading} navigation={navigation} />
      <ProductSection title="Featured" products={featuredProducts.data?.products ?? []} loading={featuredProducts.isLoading} navigation={navigation} />
      <ProductSection title="Trending" products={latestProducts.data?.products?.slice(0, 12) ?? []} loading={latestProducts.isLoading} navigation={navigation} />
      <ProductSection title="Latest" products={latestProducts.data?.products ?? []} loading={latestProducts.isLoading} navigation={navigation} />
      <View style={{ height: 40 }} />
    </ScrollView>
  );
});

// ──────────────────────────────────────
// Products Tab
// ──────────────────────────────────────
const ProductsTab = React.memo(({ productFeed, products, featuredProducts, latestProducts, verifiedProducts, categories: _categories, openExplore: _openExplore, navigation, renderHeader }: any) => (
  <FlashList
    data={productFeed}
    keyExtractor={(item: Product) => getId(item)}
    numColumns={2}
    contentContainerStyle={styles.gridContent}
    refreshControl={<RefreshControl refreshing={products.isRefetching && !products.isFetchingNextPage} onRefresh={() => products.refetch()} tintColor={PALETTE.primary} />}
    onEndReachedThreshold={0.3}
    onEndReached={() => { if (products.hasNextPage && !products.isFetchingNextPage) products.fetchNextPage(); }}
    ListHeaderComponent={
      <View>
        {renderHeader()}
        <ProductSection title="Featured" products={featuredProducts.data?.products ?? []} loading={featuredProducts.isLoading} navigation={navigation} />
        <ProductSection title="Verified" products={verifiedProducts} loading={featuredProducts.isLoading || latestProducts.isLoading} navigation={navigation} />
        <SectionHeader title="All Products" />
      </View>
    }
    ListEmptyComponent={products.isLoading ? <LoadingState label="Loading products" /> : <EmptyState title="No products" />}
    ListFooterComponent={products.isFetchingNextPage ? <ActivityIndicator color={PALETTE.primary} style={styles.footerLoader} /> : null}
    renderItem={({ item }: { item: Product }) => <ProductCard product={item} variant="grid" />}
  />
));

// ──────────────────────────────────────
// Manufacturers Tab
// ──────────────────────────────────────
const ManufacturersTab = React.memo(({ manufacturers, sellers, categories, openExplore, navigation, refreshAll }: any) => (
  <FlashList
    data={manufacturers}
    keyExtractor={(item: SellerSummary) => getStableKey(item)}
    contentContainerStyle={styles.listContent}
    refreshControl={<RefreshControl refreshing={sellers.isRefetching} onRefresh={refreshAll} tintColor={PALETTE.primary} />}
    ListHeaderComponent={
      <View>
        <ExploreShortcuts actions={EXPLORE_ACTIONS.slice(0, 4)} onPress={openExplore} />
        <CategorySlider categories={categories} loading={false} navigation={navigation} />
        <SectionHeader title="Verified Manufacturers" />
      </View>
    }
    ListEmptyComponent={sellers.isLoading ? <LoadingState label="Loading manufacturers" /> : <EmptyState title="No manufacturers" />}
    renderItem={({ item }: { item: SellerSummary }) => <SellerCard seller={item} navigation={navigation} />}
  />
));

// ──────────────────────────────────────
// Search Bar
// ──────────────────────────────────────
const SearchBar = React.memo(({ query, onChangeText, onSubmit, onCameraPress }: any) => (
  <View style={styles.searchShell}>
    <Icon name="magnify" size={18} color={PALETTE.muted} />
    <TextInput
      value={query}
      onChangeText={onChangeText}
      onSubmitEditing={onSubmit}
      returnKeyType="search"
      placeholder="Search products, suppliers..."
      placeholderTextColor={PALETTE.muted}
      style={styles.searchInput}
    />
    {query.length > 0 && (
      <Pressable onPress={() => onChangeText('')} hitSlop={8}>
        <Icon name="close-circle" size={16} color={PALETTE.muted} />
      </Pressable>
    )}
    <Pressable onPress={onCameraPress} hitSlop={8} style={styles.searchIconBtn}>
      <Icon name="camera-outline" size={18} color={PALETTE.primary} />
    </Pressable>
  </View>
));

// ──────────────────────────────────────
// Explore Shortcuts
// ──────────────────────────────────────
const ExploreShortcuts = React.memo(({ actions, onPress }: { actions: ExploreAction[]; onPress: (action: ExploreAction) => void }) => (
  <View style={styles.exploreSection}>
    <Text style={styles.sectionTitle}>Explore Services</Text>
    <FlatList
      data={actions}
      horizontal
      keyExtractor={item => item.title}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.exploreRail}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => onPress(item)}
          style={({ pressed }) => [styles.exploreItem, pressed && styles.exploreItemPressed]}>
          <View style={[styles.exploreIconWrap, { backgroundColor: `${item.color}12` }]}>
            <Icon name={item.icon} size={18} color={item.color} />
          </View>
          <Text style={styles.exploreItemText} numberOfLines={1}>{item.title}</Text>
        </Pressable>
      )}
    />
  </View>
));

// ──────────────────────────────────────
// Category Slider
// ──────────────────────────────────────
const CategorySlider = React.memo(({ categories, loading, navigation }: any) => {
  if (loading && !categories.length) {
    return (
      <View style={styles.categorySection}>
        <Text style={styles.sectionTitle}>Categories</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRail}>
          {[0, 1, 2, 3, 4, 5].map(i => <View key={i} style={styles.categorySkeleton} />)}
        </ScrollView>
      </View>
    );
  }

  if (!categories.length) return null;

  return (
    <View style={styles.categorySection}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Categories</Text>
        <Pressable onPress={() => navigation.navigate('Categories')} hitSlop={8}>
          <Text style={styles.seeAll}>See all</Text>
        </Pressable>
      </View>
      <FlatList
        data={categories.slice(0, 10)}
        horizontal
        keyExtractor={(item: Category) => getStableKey(item)}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryRail}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => navigation.navigate('ProductListing', { category: item.slug ?? item.name, categoryName: item.name })}
            style={styles.categoryItem}>
            <View style={styles.categoryIconWrap}>
              <RemoteImage
                uri={item.image}
                width={80}
                height={80}
                style={styles.categoryIcon}
                fallback={<Icon name="view-grid-outline" size={20} color={PALETTE.primary} />}
              />
            </View>
            <Text style={styles.categoryName} numberOfLines={2}>{item.name ?? item.slug}</Text>
          </Pressable>
        )}
      />
    </View>
  );
});

// ──────────────────────────────────────
// Product Section
// ──────────────────────────────────────
const ProductSection = React.memo(({ title, products: items, loading, navigation }: any) => {
  if (loading || !items?.length) return null;

  return (
    <View style={styles.productSection}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Pressable onPress={() => navigation.navigate('ProductListing')} hitSlop={8}>
          <Text style={styles.seeAll}>View all</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.productRail}>
        {items.map((product: Product) => <ProductCard key={getId(product)} product={product} />)}
      </ScrollView>
    </View>
  );
});

// ──────────────────────────────────────
// Search Results
// ──────────────────────────────────────
const SearchResults = React.memo(({ loading, error, onRetry, products, categories, sellers, navigation }: any) => {
  if (loading) return <LoadingState label="Searching..." />;
  if (error) return <ErrorState message={error.message} onRetry={onRetry} />;
  if (!products.length && !categories.length && !sellers.length) return <EmptyState title="No results" detail="Try different keywords." />;

  return (
    <View>
      {categories.length > 0 && (
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionTitle}>Categories</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipList}>
            {categories.map((cat: any) => (
              <Pressable key={getStableKey(cat)} onPress={() => navigation.navigate('ProductListing', { category: cat.name, categoryName: cat.name })} style={styles.chip}>
                <Text style={styles.chipText}>{cat.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
      {sellers.length > 0 && (
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionTitle}>Suppliers</Text>
          {sellers.slice(0, 3).map((seller: SellerSummary) => <SellerCard key={getStableKey(seller)} seller={seller} navigation={navigation} />)}
        </View>
      )}
      <ProductSection title="Products" products={products} loading={false} navigation={navigation} />
    </View>
  );
});

// ──────────────────────────────────────
// Seller Card
// ──────────────────────────────────────
const SellerCard = React.memo(({ seller, navigation }: any) => {
  const verified = seller.isVerified || seller.verificationStatus === 'verified';
  const title = seller.companyName ?? seller.businessName ?? seller.displayName ?? 'Supplier';
  const location = [seller.address?.city, seller.address?.country ?? seller.country].filter(Boolean).join(', ') || 'Worldwide';
  const categories = seller.mainCategories?.filter(Boolean).slice(0, 3) ?? [];
  const previewImages = seller.factoryImages?.filter(Boolean).slice(0, 3) ?? [];
  const sellerImage = firstImage(seller.logo, seller.companyLogo, seller.profileImage, seller.avatar, seller.image, seller.factoryImages);
  const sellerId = seller._id ?? seller.id ?? title;

  return (
    <Pressable
      onPress={() => navigation.navigate('SellerDetails', { sellerId, sellerName: title })}
      style={styles.sellerCard}>
      <View style={styles.sellerTop}>
        <RemoteImage uri={sellerImage} width={48} height={48} style={styles.sellerLogo} fallback={<Text style={styles.sellerLogoText}>{title[0]}</Text>} />
        <View style={styles.sellerInfo}>
          <View style={styles.sellerNameRow}>
            <Text style={styles.sellerName} numberOfLines={1}>{title}</Text>
            {verified && <Icon name="check-decagram" size={14} color={PALETTE.primary} />}
          </View>
          <Text style={styles.sellerLocation} numberOfLines={1}>{location}</Text>
          <Text style={styles.sellerMeta}>{seller.businessType ?? 'Supplier'}{seller.yearsInBusiness ? ` · ${seller.yearsInBusiness} yrs` : ''}</Text>
        </View>
        <SavedHeartButton type="supplier" itemId={sellerId} target={seller} size={16} iconColor={PALETTE.muted} />
      </View>

      {previewImages.length > 0 && (
        <View style={styles.factoryStrip}>
          {previewImages.map((uri: string, i: number) => (
            <RemoteImage key={`${uri}-${i}`} uri={uri} width={120} height={80} style={styles.factoryImage} />
          ))}
        </View>
      )}

      <View style={styles.sellerStats}>
        {seller.rating && <StatPill icon="star" text={`${seller.rating}`} color={PALETTE.amber} />}
        {seller.responseRate && <StatPill icon="timer-outline" text={seller.responseRate} color={PALETTE.emerald} />}
        {seller.productCount && <StatPill icon="package-variant-closed" text={`${seller.productCount} products`} color={PALETTE.violet} />}
        {seller.minMoq && <StatPill icon="format-list-numbered" text={`MOQ ${seller.minMoq}`} color={PALETTE.rose} />}
      </View>

      {categories.length > 0 && (
        <View style={styles.categoryTags}>
          {categories.map((cat: string) => <Text key={cat} style={styles.categoryTag}>{cat}</Text>)}
        </View>
      )}

      <View style={styles.sellerActions}>
        <Pressable onPress={() => navigation.navigate('Messages')} style={styles.chatBtn}>
          <Icon name="message-text-outline" size={14} color="#fff" />
          <Text style={styles.chatBtnText}>Chat</Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate('RFQCreate', { prefill: { sellerId, supplierName: title } })} style={styles.rfqBtn}>
          <Icon name="bullseye-arrow" size={14} color="#fff" />
          <Text style={styles.chatBtnText}>Send RFQ</Text>
        </Pressable>
      </View>
    </Pressable>
  );
});

const StatPill = React.memo(({ icon, text, color }: any) => (
  <View style={[styles.statPill, { borderLeftColor: color, borderLeftWidth: 2 }]}>
    <Icon name={icon} size={10} color={color} />
    <Text style={styles.statPillText}>{text}</Text>
  </View>
));

// ──────────────────────────────────────
// Helpers
// ──────────────────────────────────────
function collectSellers(products: Product[]) {
  const sellers = new Map<string, SellerSummary>();
  products.forEach(product => {
    const seller = product.seller ?? product.sellerId;
    if (!seller || typeof seller === 'string') return;
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

// ──────────────────────────────────────
// Styles
// ──────────────────────────────────────
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PALETTE.background },
  header: {
    backgroundColor: PALETTE.surface,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: PALETTE.faint,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  brand: {
    fontSize: 20,
    fontWeight: '800',
    color: PALETTE.ink,
    letterSpacing: -0.3,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: PALETTE.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: PALETTE.rose,
    borderWidth: 1.5,
    borderColor: '#fff',
  },

  // Tabs
  tabContainer: {
    marginTop: 0,
  },
  tabTrack: {
    flexDirection: 'row',
    backgroundColor: PALETTE.cardMuted,
    borderRadius: 10,
    padding: 3,
    position: 'relative',
  },
  tabIndicator: {
    position: 'absolute',
    top: 3,
    left: 3,
    bottom: 3,
    backgroundColor: PALETTE.surface,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    zIndex: 1,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: PALETTE.muted,
  },
  tabTextActive: {
    color: PALETTE.primary,
    fontWeight: '800',
  },

  // Content
  content: { flex: 1 },
  tabContent: { paddingBottom: 100 },
  gridContent: { paddingBottom: 100, paddingHorizontal: spacing.sm },
  listContent: { padding: spacing.sm, paddingBottom: 100 },
  footerLoader: { padding: spacing.xl },

  // Search
  searchShell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: PALETTE.primaryLight,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: PALETTE.primary,
    margin: spacing.md,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: PALETTE.ink,
    padding: 0,
  },
  searchIconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: PALETTE.surface,
  },

  // Explore
  exploreSection: {
    paddingBottom: spacing.md,
  },
  exploreRail: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  exploreItem: {
    alignItems: 'center',
    width: 68,
    paddingVertical: spacing.sm,
  },
  exploreItemPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }],
  },
  exploreIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exploreItemText: {
    fontSize: 9,
    fontWeight: '700',
    color: PALETTE.text,
    marginTop: 4,
    textAlign: 'center',
  },

  // Categories
  categorySection: {
    paddingBottom: spacing.md,
  },
  categoryRail: {
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  categoryItem: {
    alignItems: 'center',
    width: 64,
  },
  categoryIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: PALETTE.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  categoryIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  categoryName: {
    fontSize: 9,
    fontWeight: '700',
    color: PALETTE.text,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 11,
  },
  categorySkeleton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: PALETTE.cardMuted,
  },

  // Product Section
  productSection: {
    paddingBottom: spacing.lg,
  },
  productRail: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  sectionWrap: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: PALETTE.ink,
    letterSpacing: -0.2,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  seeAll: {
    fontSize: 11,
    fontWeight: '700',
    color: PALETTE.primary,
    paddingRight: spacing.md,
    paddingBottom: spacing.sm,
  },

  // Chips
  chipList: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  chip: {
    backgroundColor: PALETTE.primaryLight,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
    color: PALETTE.primary,
  },

  // Seller Card
  sellerCard: {
    backgroundColor: PALETTE.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  sellerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sellerLogo: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: PALETTE.cardMuted,
  },
  sellerLogoText: {
    fontSize: 20,
    fontWeight: '800',
    color: PALETTE.primary,
  },
  sellerInfo: {
    flex: 1,
  },
  sellerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sellerName: {
    fontSize: 13,
    fontWeight: '800',
    color: PALETTE.ink,
    flex: 1,
  },
  sellerLocation: {
    fontSize: 10,
    fontWeight: '600',
    color: PALETTE.muted,
    marginTop: 1,
  },
  sellerMeta: {
    fontSize: 9,
    fontWeight: '600',
    color: PALETTE.muted,
    marginTop: 1,
  },
  factoryStrip: {
    flexDirection: 'row',
    gap: 6,
    marginTop: spacing.sm,
  },
  factoryImage: {
    flex: 1,
    height: 56,
    borderRadius: 6,
    backgroundColor: PALETTE.cardMuted,
  },
  sellerStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: spacing.sm,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: PALETTE.cardMuted,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  statPillText: {
    fontSize: 9,
    fontWeight: '700',
    color: PALETTE.text,
  },
  categoryTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: spacing.sm,
  },
  categoryTag: {
    fontSize: 9,
    fontWeight: '600',
    color: PALETTE.primary,
    backgroundColor: PALETTE.primaryLight,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  sellerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: PALETTE.faint,
  },
  chatBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: PALETTE.primary,
    borderRadius: 8,
    paddingVertical: 8,
  },
  rfqBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: PALETTE.accent,
    borderRadius: 8,
    paddingVertical: 8,
  },
  chatBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
});

export default React.memo(HomeScreen);
