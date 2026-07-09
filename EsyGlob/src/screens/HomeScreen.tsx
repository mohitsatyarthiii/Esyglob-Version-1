import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import { fetchCategories } from '../api/categories';
import { fetchSellers } from '../api/marketplace';
import { fetchProducts } from '../api/products';
import { Category, Product, SellerSummary } from '../api/types';
import AIChatBot from '../components/AIChatBot';
import LiveSearchDropdown from '../components/LiveSearchDropdown';
import ProductCard from '../components/ProductCard';
import RemoteImage from '../components/RemoteImage';
import SavedHeartButton from '../components/SavedHeartButton';
import SectionHeader from '../components/SectionHeader';
import { EmptyState, LoadingState } from '../components/StateViews';
import { spacing } from '../theme';
import { getId, getStableKey } from '../utils/format';
import { firstImage } from '../utils/images';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const PALETTE = {
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  primary: '#2563EB',
  primaryLight: '#EFF6FF',
  accent: '#F26A21',
  accentLight: '#FFF7ED',
  emerald: '#10B981',
  amber: '#F59E0B',
  rose: '#EF4444',
  violet: '#7C3AED',
  ink: '#0F172A',
  text: '#1E293B',
  muted: '#64748B',
  faint: '#E2E8F0',
  cardMuted: '#F1F5F9',
};

type HomeTab = 'AI' | 'Products' | 'Manufacturers';
const TABS: HomeTab[] = ['AI', 'Products', 'Manufacturers'];

type ExploreAction = {
  icon: string;
  title: string;
  color: string;
  bg: string;
  route?: string;
  tab?: HomeTab;
};

const EXPLORE_ACTIONS: ExploreAction[] = [
  { icon: 'robot', title: 'AI Chat', color: '#6366F1', bg: '#EEF2FF', route: 'AIChat' },
  { icon: 'calculator', title: 'Tax Calc', color: '#0F8B8D', bg: '#ECFDF5' },
  { icon: 'account-search', title: 'Suppliers', color: '#10B981', bg: '#ECFDF5', route: 'Sellers' },
  { icon: 'clipboard-list', title: 'RFQ', color: '#F59E0B', bg: '#FFFBEB', route: 'RFQCreate' },
  { icon: 'chart-line', title: 'Insights', color: '#8B5CF6', bg: '#F5F3FF', route: 'MarketInsights' },
  { icon: 'magnify-scan', title: 'Research', color: '#2563EB', bg: '#EFF6FF', route: 'ProductListing' },
  { icon: 'briefcase-check', title: 'Trade', color: '#F26A21', bg: '#FFF7ED', route: 'Services' },
  { icon: 'truck-delivery', title: 'Logistics', color: '#06B6D4', bg: '#F0F9FF', route: 'ShippingLogistics' },
];

const CACHE_CONFIG = { staleTime: 5 * 60_000, gcTime: 30 * 60_000, retry: 2 };

function HomeScreen() {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<HomeTab>('AI');
  const [showSearch, setShowSearch] = useState(false);
  const tabPosition = useRef(new Animated.Value(0)).current;
  const [tabWidths, setTabWidths] = useState<number[]>([]);

  useEffect(() => {
    const prefetchAll = async () => {
      await Promise.allSettled([
        queryClient.prefetchQuery({ queryKey: ['home-categories'], queryFn: fetchCategories, ...CACHE_CONFIG }),
        queryClient.prefetchQuery({
          queryKey: ['home-featured-products'],
          queryFn: () => fetchProducts({ limit: 12, sort: 'latest', verifiedOnly: true }),
          ...CACHE_CONFIG,
        }),
        queryClient.prefetchQuery({
          queryKey: ['home-latest-products'],
          queryFn: () => fetchProducts({ limit: 30, sort: 'latest' }),
          ...CACHE_CONFIG,
        }),
        queryClient.prefetchQuery({
          queryKey: ['manufacturers-directory'],
          queryFn: () => fetchSellers({ limit: 30, sort: 'verified' }),
          ...CACHE_CONFIG,
        }),
      ]);
    };
    prefetchAll();
  }, [queryClient]);

  useEffect(() => {
    const index = TABS.indexOf(activeTab);
    if (tabWidths.length === TABS.length) {
      const targetX = tabWidths.slice(0, index).reduce((sum, w) => sum + w + 4, 4);
      Animated.spring(tabPosition, {
        toValue: targetX,
        tension: 400,
        friction: 28,
        useNativeDriver: true,
      }).start();
    }
  }, [activeTab, tabWidths, tabPosition]);

  const categoriesQuery = useQuery({ queryKey: ['home-categories'], queryFn: fetchCategories, ...CACHE_CONFIG });
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
  const sellers = useQuery({
    queryKey: ['manufacturers-directory'],
    queryFn: () => fetchSellers({ limit: 30, sort: 'verified' }),
    ...CACHE_CONFIG,
  });
  const products = useInfiniteQuery({
    queryKey: ['home-products-feed'],
    queryFn: ({ pageParam }) => fetchProducts({ page: Number(pageParam), limit: 18, sort: 'latest' }),
    initialPageParam: 1,
    ...CACHE_CONFIG,
    getNextPageParam: (lastPage: any) => {
      const p = lastPage.pagination;
      return p?.page && p.totalPages && p.page < p.totalPages ? p.page + 1 : undefined;
    },
  });

  const categories = useMemo(
    () =>
      (categoriesQuery.data ?? []).filter(
        (cat: Category, i: number, list: Category[]) =>
          list.findIndex((c: Category) => getStableKey(c) === getStableKey(cat)) === i,
      ),
    [categoriesQuery.data],
  );

  const productFeed = useMemo(
    () => products.data?.pages?.flatMap((p: any) => p.products as Product[]) ?? [],
    [products.data],
  );

  const manufacturers = useMemo(() => {
    if (sellers.data?.sellers?.length) return sellers.data.sellers as SellerSummary[];
    return collectSellers(productFeed);
  }, [productFeed, sellers.data]);

  const handleTabChange = useCallback((tab: HomeTab) => setActiveTab(tab), []);
  const openExplore = useCallback(
    (action: ExploreAction) => {
      if (action.tab) { setActiveTab(action.tab); return; }
      if (action.route) { navigation.navigate(action.route); return; }
    },
    [navigation],
  );

  const refreshAll = useCallback(() => {
    Promise.allSettled([
      categoriesQuery.refetch(),
      featuredProducts.refetch(),
      latestProducts.refetch(),
      sellers.refetch(),
    ]);
  }, [categoriesQuery, featuredProducts, latestProducts, sellers]);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={PALETTE.surface} />

      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.brandRow}>
            <View style={styles.brandIcon}>
              <Icon name="shopping" size={20} color="#fff" />
            </View>
            <Text style={styles.brand}>EsyGlob</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable onPress={() => navigation.navigate('Notifications')} style={styles.iconBtn}>
              <Icon name="bell-outline" size={20} color={PALETTE.text} />
            </Pressable>
            <Pressable onPress={() => navigation.navigate('Messages')} style={styles.iconBtn}>
              <Icon name="message-text-outline" size={20} color={PALETTE.text} />
            </Pressable>
          </View>
        </View>

        <Pressable style={styles.searchBar} onPress={() => setShowSearch(true)}>
          <Icon name="magnify" size={18} color={PALETTE.muted} />
          <Text style={styles.searchPlaceholder}>Search products, suppliers...</Text>
          <View style={styles.searchCamera}>
            <Icon name="camera-outline" size={16} color={PALETTE.primary} />
          </View>
        </Pressable>

        <View style={styles.tabTrack}>
          {tabWidths.length === TABS.length && (
            <Animated.View
              style={[
                styles.tabIndicator,
                {
                  transform: [{ translateX: tabPosition }],
                  width: (tabWidths[TABS.indexOf(activeTab)] || 80) - 8,
                },
              ]}
            />
          )}
          {TABS.map((tab, index) => (
            <Pressable
              key={tab}
              onPress={() => handleTabChange(tab)}
              onLayout={e => {
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

      <View style={styles.content}>
        {activeTab === 'AI' && <AIChatBot />}

        {activeTab === 'Products' && (
          <FlashList
            data={productFeed}
            keyExtractor={(item: Product) => getId(item)}
            numColumns={2}
            contentContainerStyle={styles.gridContent}
            refreshControl={
              <RefreshControl
                refreshing={products.isRefetching && !products.isFetchingNextPage}
                onRefresh={() => products.refetch()}
                tintColor={PALETTE.primary}
              />
            }
            onEndReachedThreshold={0.4}
            onEndReached={() => {
              if (products.hasNextPage && !products.isFetchingNextPage) products.fetchNextPage();
            }}
            ListHeaderComponent={
              <View>
                <ExploreShortcuts actions={EXPLORE_ACTIONS} onPress={openExplore} />
                <CategorySlider categories={categories} loading={categoriesQuery.isLoading} navigation={navigation} />
                <ProductSection
                  title="Featured Products"
                  products={featuredProducts.data?.products ?? []}
                  loading={featuredProducts.isLoading}
                  navigation={navigation}
                />
                <SectionHeader title="All Products" />
              </View>
            }
            ListEmptyComponent={
              products.isLoading ? (
                <LoadingState label="Discovering products..." />
              ) : (
                <EmptyState title="No products found" />
              )
            }
            ListFooterComponent={
              products.isFetchingNextPage ? (
                <ActivityIndicator color={PALETTE.primary} style={styles.footerLoader} />
              ) : null
            }
            renderItem={({ item }: { item: Product }) => (
              <View style={styles.gridItem}>
                <ProductCard product={item} variant="grid" />
              </View>
            )}
          />
        )}

        {activeTab === 'Manufacturers' && (
          <FlashList
            data={manufacturers}
            keyExtractor={(item: SellerSummary) => getStableKey(item)}
            
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={sellers.isRefetching}
                onRefresh={refreshAll}
                tintColor={PALETTE.primary}
              />
            }
            ListHeaderComponent={<SectionHeader title="Verified Manufacturers" />}
            ListEmptyComponent={
              sellers.isLoading ? (
                <LoadingState label="Loading manufacturers..." />
              ) : (
                <EmptyState title="No manufacturers" />
              )
            }
            renderItem={({ item }: { item: SellerSummary }) => (
              <SellerCard seller={item} navigation={navigation} />
            )}
          />
        )}
      </View>

      <LiveSearchDropdown visible={showSearch} onClose={() => setShowSearch(false)} navigation={navigation} />
    </View>
  );
}

// ─── Explore ────────────────────────────────────────────────────────────────

const ExploreShortcuts = React.memo(
  ({ actions, onPress }: { actions: ExploreAction[]; onPress: (a: ExploreAction) => void }) => (
    <View style={styles.exploreSection}>
      <FlatList
        data={actions}
        horizontal
        keyExtractor={item => item.title}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.exploreRail}
        renderItem={({ item }) => (
          <Pressable onPress={() => onPress(item)}>
            <View style={styles.exploreItem}>
              <View style={[styles.exploreIconWrap, { backgroundColor: item.bg }]}>
                <Icon name={item.icon} size={20} color={item.color} />
              </View>
              <Text style={styles.exploreItemText} numberOfLines={1}>{item.title}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  ),
);

// ─── Category Slider ────────────────────────────────────────────────────────

const CategorySlider = React.memo(({ categories, loading, navigation }: any) => {
  if (loading && !categories.length) {
    return (
      <View style={styles.sectionWrap}>
        <Text style={styles.sectionTitle}>Categories</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRail}>
          {[0, 1, 2, 3, 4, 5].map(i => (
            <View key={i} style={styles.categorySkeleton} />
          ))}
        </ScrollView>
      </View>
    );
  }
  if (!categories.length) return null;

  return (
    <View style={styles.sectionWrap}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Categories</Text>
        <Pressable onPress={() => navigation.navigate('Categories')}>
          <Text style={styles.seeAll}>See all</Text>
        </Pressable>
      </View>
      <FlatList
        data={categories.slice(0, 8)}
        horizontal
        keyExtractor={(item: Category) => getStableKey(item)}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryRail}
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              navigation.navigate('ProductListing', { category: item.slug ?? item.name, categoryName: item.name })
            }
            style={styles.categoryItem}>
            <View style={styles.categoryIconWrap}>
              {item.image ? (
                <RemoteImage uri={item.image} width={64} height={64} style={styles.categoryIcon} />
              ) : (
                <Icon name="view-grid-outline" size={22} color={PALETTE.primary} />
              )}
            </View>
            <Text style={styles.categoryName} numberOfLines={2}>{item.name ?? item.slug}</Text>
          </Pressable>
        )}
      />
    </View>
  );
});

// ─── Product Section ────────────────────────────────────────────────────────

const ProductSection = React.memo(({ title, products: items, loading, navigation }: any) => {
  if (loading && !items?.length) {
    return (
      <View style={styles.sectionWrap}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.productRail}>
          {[0, 1, 2, 3].map(i => <View key={i} style={styles.productSkeleton} />)}
        </ScrollView>
      </View>
    );
  }
  if (!items?.length) return null;

  return (
    <View style={styles.sectionWrap}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Pressable onPress={() => navigation.navigate('ProductListing')}>
          <Text style={styles.seeAll}>View all</Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.productRail}
        decelerationRate="fast"
        snapToInterval={SCREEN_WIDTH * 0.45 + spacing.sm}
        snapToAlignment="start">
        {items.map((product: Product) => (
          <ProductCard key={getId(product)} product={product} />
        ))}
      </ScrollView>
    </View>
  );
});

// ─── Seller Card ────────────────────────────────────────────────────────────

const SellerCard = React.memo(({ seller, navigation }: any) => {
  const verified = seller.isVerified || seller.verificationStatus === 'verified';
  const title = seller.companyName ?? seller.businessName ?? seller.displayName ?? 'Supplier';
  const location = [seller.address?.city, seller.address?.country ?? seller.country].filter(Boolean).join(', ') || 'Worldwide';
  const sellerId = getStableKey(seller);
  const sellerImage = firstImage(seller.logo, seller.companyLogo, seller.logoUrl, seller.factoryImages);
  const previewImages: string[] = (seller.factoryImages ?? []).filter(Boolean).slice(0, 3);

  return (
    <Pressable
      onPress={() => navigation.navigate('SellerDetails', { sellerId, sellerName: title })}
      style={({ pressed }) => [styles.sellerCard, pressed && styles.pressed]}>
      <View style={styles.sellerTop}>
        <RemoteImage
          uri={sellerImage}
          width={52}
          height={52}
          style={styles.sellerLogo}
          fallback={
            <View style={styles.sellerLogoFallback}>
              <Text style={styles.sellerLogoText}>{title.slice(0, 2).toUpperCase()}</Text>
            </View>
          }
        />
        <View style={styles.sellerInfo}>
          <View style={styles.sellerNameRow}>
            <Text style={styles.sellerName} numberOfLines={1}>{title}</Text>
            {verified && <Icon name="check-decagram" size={15} color={PALETTE.primary} />}
          </View>
          <View style={styles.locationRow}>
            <Icon name="map-marker-outline" size={10} color={PALETTE.muted} />
            <Text style={styles.sellerLocation} numberOfLines={1}>{location}</Text>
          </View>
          <Text style={styles.sellerMeta}>
            {seller.businessType ?? 'Supplier'}{seller.yearsInBusiness ? ` · ${seller.yearsInBusiness} yrs` : ''}
          </Text>
        </View>
        <SavedHeartButton type="supplier" itemId={sellerId} target={seller} size={16} iconColor={PALETTE.muted} savedColor={PALETTE.rose} />
      </View>

      {previewImages.length > 0 && (
        <View style={styles.factoryStrip}>
          {previewImages.map((uri: string, i: number) => (
            <RemoteImage key={`${uri}-${i}`} uri={uri} width={200} height={140} style={styles.factoryImage} />
          ))}
        </View>
      )}

      <View style={styles.sellerStats}>
        {seller.rating && (
          <View style={styles.statPill}>
            <Icon name="star" size={10} color={PALETTE.amber} />
            <Text style={styles.statText}>{Number(seller.rating).toFixed(1)}</Text>
          </View>
        )}
        {seller.productCount && (
          <View style={styles.statPill}>
            <Icon name="package-variant-closed" size={10} color={PALETTE.violet} />
            <Text style={styles.statText}>{seller.productCount} products</Text>
          </View>
        )}
        {seller.responseRate && (
          <View style={styles.statPill}>
            <Icon name="timer-outline" size={10} color={PALETTE.emerald} />
            <Text style={styles.statText}>{seller.responseRate}</Text>
          </View>
        )}
      </View>

      <View style={styles.sellerActions}>
        <Pressable onPress={() => navigation.navigate('Messages')} style={styles.chatBtn}>
          <Icon name="message-text-outline" size={14} color="#fff" />
          <Text style={styles.actionBtnText}>Chat</Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate('RFQCreate', { prefill: { sellerId, supplierName: title } })} style={styles.rfqBtn}>
          <Icon name="bullseye-arrow" size={14} color="#fff" />
          <Text style={styles.actionBtnText}>Send RFQ</Text>
        </Pressable>
      </View>
    </Pressable>
  );
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function collectSellers(productsList: Product[]): SellerSummary[] {
  const sellersMap = new Map<string, SellerSummary>();
  productsList.forEach(product => {
    const seller = product.seller ?? product.sellerId;
    if (!seller || typeof seller === 'string') return;
    const id = getStableKey(seller);
    const existing = sellersMap.get(id);
    sellersMap.set(id, {
      ...existing,
      ...seller,
      productCount: (existing?.productCount ?? 0) + 1,
      mainCategories: Array.from(new Set([...(existing?.mainCategories ?? []), product.category].filter(Boolean) as string[])),
    });
  });
  return Array.from(sellersMap.values());
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PALETTE.bg },
  header: {
    backgroundColor: PALETTE.surface,
    paddingTop: Platform.OS === 'ios' ? 56 : 44,
    paddingBottom: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: PALETTE.faint,
    zIndex: 10,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: PALETTE.primary, alignItems: 'center', justifyContent: 'center' },
  brand: { fontSize: 20, fontWeight: '800', color: PALETTE.ink, letterSpacing: -0.4 },
  headerActions: { flexDirection: 'row', gap: 4 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: PALETTE.cardMuted, borderRadius: 12, paddingHorizontal: 14, height: 44,
    borderWidth: 1, borderColor: PALETTE.faint,
  },
  searchPlaceholder: { flex: 1, fontSize: 13, fontWeight: '500', color: PALETTE.muted },
  searchCamera: { width: 32, height: 32, borderRadius: 8, backgroundColor: PALETTE.primaryLight, alignItems: 'center', justifyContent: 'center' },
  tabTrack: { flexDirection: 'row', marginTop: 10, backgroundColor: PALETTE.cardMuted, borderRadius: 10, padding: 4, position: 'relative' },
  tabIndicator: {
    position: 'absolute', top: 4, bottom: 4, backgroundColor: PALETTE.surface, borderRadius: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 3,
  },
  tabButton: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, zIndex: 1 },
  tabText: { fontSize: 13, fontWeight: '600', color: PALETTE.muted },
  tabTextActive: { color: PALETTE.primary, fontWeight: '700' },
  content: { flex: 1 },
  gridContent: { paddingHorizontal: 8, paddingBottom: 100 },
  gridItem: { flex: 1, margin: 4, minWidth: 0 },
  listContent: { paddingHorizontal: 12, paddingBottom: 100 },
  footerLoader: { padding: 20 },
  exploreSection: { paddingVertical: 12 },
  exploreRail: { paddingHorizontal: 12, gap: 8 },
  exploreItem: { alignItems: 'center', width: 68, paddingVertical: 4 },
  exploreIconWrap: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  exploreItemText: { fontSize: 10, fontWeight: '600', color: PALETTE.text, textAlign: 'center' },
  sectionWrap: { paddingBottom: 16 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: PALETTE.ink, letterSpacing: -0.2, paddingHorizontal: 16, paddingBottom: 10 },
  seeAll: { fontSize: 12, fontWeight: '600', color: PALETTE.primary },
  categoryRail: { paddingHorizontal: 12, gap: 10 },
  categoryItem: { alignItems: 'center', width: 68 },
  categoryIconWrap: { width: 56, height: 56, borderRadius: 16, backgroundColor: PALETTE.primaryLight, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 6 },
  categoryIcon: { width: 56, height: 56, borderRadius: 16 },
  categoryName: { fontSize: 10, fontWeight: '600', color: PALETTE.text, textAlign: 'center', lineHeight: 12 },
  categorySkeleton: { width: 56, height: 56, borderRadius: 16, backgroundColor: PALETTE.cardMuted },
  productRail: { paddingHorizontal: 12, gap: 10 },
  productSkeleton: { width: SCREEN_WIDTH * 0.45, height: 200, borderRadius: 12, backgroundColor: PALETTE.cardMuted },
  sellerCard: {
    backgroundColor: PALETTE.surface, borderRadius: 14, padding: 14, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
    borderWidth: 1, borderColor: PALETTE.faint,
  },
  pressed: { opacity: 0.97, transform: [{ scale: 0.99 }] },
  sellerTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sellerLogo: { width: 52, height: 52, borderRadius: 12, backgroundColor: PALETTE.cardMuted },
  sellerLogoFallback: { width: 52, height: 52, borderRadius: 12, backgroundColor: PALETTE.primaryLight, alignItems: 'center', justifyContent: 'center' },
  sellerLogoText: { fontSize: 16, fontWeight: '800', color: PALETTE.primary },
  sellerInfo: { flex: 1 },
  sellerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sellerName: { fontSize: 14, fontWeight: '700', color: PALETTE.ink, flex: 1 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  sellerLocation: { fontSize: 11, fontWeight: '500', color: PALETTE.muted, flex: 1 },
  sellerMeta: { fontSize: 10, fontWeight: '500', color: PALETTE.muted, marginTop: 1 },
  factoryStrip: { flexDirection: 'row', gap: 6, marginTop: 12 },
  factoryImage: { flex: 1, height: 60, borderRadius: 8, backgroundColor: PALETTE.cardMuted },
  sellerStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  statPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: PALETTE.cardMuted, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  statText: { fontSize: 10, fontWeight: '600', color: PALETTE.text },
  sellerActions: { flexDirection: 'row', gap: 10, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: PALETTE.faint },
  chatBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: PALETTE.primary, borderRadius: 10, paddingVertical: 10 },
  rfqBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: PALETTE.accent, borderRadius: 10, paddingVertical: 10 },
  actionBtnText: { fontSize: 11, fontWeight: '700', color: '#fff' },
});

export default React.memo(HomeScreen);