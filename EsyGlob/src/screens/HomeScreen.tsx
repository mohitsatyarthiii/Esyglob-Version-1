/* eslint-disable react-native/no-inline-styles */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchCategories } from '../api/categories';
import { fetchNotifications, fetchSellers } from '../api/marketplace';
import { fetchProducts } from '../api/products';
import { Category, Product, SellerSummary } from '../api/types';
import LiveSearchDropdown from '../components/LiveSearchDropdown';
import CompactAIStatus from '../components/CompactAIStatus';
import ProductCard from '../components/ProductCard';
import RemoteImage from '../components/RemoteImage';
import SavedHeartButton from '../components/SavedHeartButton';
import SectionHeader from '../components/SectionHeader';
import { EmptyState, LoadingState } from '../components/StateViews';
import { spacing } from '../theme';
import { getId, getStableKey } from '../utils/format';
import { firstImage } from '../utils/images';
import { streamAIChat } from '../api/ai';
import { getActiveAIChatId, setActiveAIChatId } from '../ai/aiSession';
import { useAuth } from '../auth/AuthContext';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Design System ──────────────────────────────────────────────────────────

const D = {
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  primary: '#2563EB',
  primaryLight: '#EFF6FF',
  primaryDark: '#1D4ED8',
  accent: '#F97316',
  accentLight: '#FFF7ED',
  success: '#10B981',
  successLight: '#ECFDF5',
  warning: '#F59E0B',
  warningLight: '#FFFBEB',
  danger: '#EF4444',
  violet: '#7C3AED',
  violetLight: '#F5F3FF',
  text: '#0F172A',
  textSecondary: '#475569',
  textTertiary: '#94A3B8',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
};

// ─── Types ──────────────────────────────────────────────────────────────────

type HomeTab = 'AI' | 'Products' | 'Manufacturers';
const TABS: HomeTab[] = ['AI', 'Products', 'Manufacturers'];

type ExploreAction = {
  icon: string;
  title: string;
  color: string;
  bg: string;
  route?: string;
};

const EXPLORE_ACTIONS: ExploreAction[] = [
  { icon: 'bullseye-arrow', title: 'Create\nRFQ', color: '#F59E0B', bg: '#FFFBEB', route: 'RFQCreate' },
  { icon: 'view-grid-outline', title: 'Explore\nCategories', color: '#10B981', bg: '#ECFDF5', route: 'Categories' },
  { icon: 'qrcode-scan', title: 'QR / Image\nSearch', color: '#F97316', bg: '#FFF7ED', route: 'ImageSearch' },
  { icon: 'calculator-variant', title: 'Trade\nCalculator', color: '#6366F1', bg: '#EEF2FF', route: 'EsyCalculator' },
];

const CACHE_CONFIG = { staleTime: 5 * 60_000, gcTime: 30 * 60_000, retry: 2 };

// ─── AI Types ───────────────────────────────────────────────────────────────

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
};

// ─── Main Component ─────────────────────────────────────────────────────────

function HomeScreen() {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { status } = useAuth();

  const [activeTab, setActiveTab] = useState<HomeTab>('Products');
  const [showSearch, setShowSearch] = useState(false);
  const tabPosition = useRef(new Animated.Value(0)).current;
  const [tabWidths, setTabWidths] = useState<number[]>([]);

  // ── AI State ──────────────────────────────────────────────────────────

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Hello! I'm your EsyGlob AI trade assistant. I can help you find products, compare suppliers, calculate duties, and navigate international trade. What would you like to explore?",
      timestamp: Date.now(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [chatId, setChatId] = useState<string | undefined>(() => getActiveAIChatId('buyer'));
  const [isStreaming, setIsStreaming] = useState(false);
  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  // ── Prefetch ──────────────────────────────────────────────────────────

  useEffect(() => {
    Promise.allSettled([
      queryClient.prefetchQuery({ queryKey: ['home-categories'], queryFn: fetchCategories, ...CACHE_CONFIG }),
      queryClient.prefetchQuery({ queryKey: ['home-featured-products'], queryFn: () => fetchProducts({ limit: 12, sort: 'latest', verifiedOnly: true }), ...CACHE_CONFIG }),
      queryClient.prefetchQuery({ queryKey: ['home-latest-products'], queryFn: () => fetchProducts({ limit: 30, sort: 'latest' }), ...CACHE_CONFIG }),
      queryClient.prefetchQuery({ queryKey: ['manufacturers-directory'], queryFn: () => fetchSellers({ limit: 30, sort: 'verified' }), ...CACHE_CONFIG }),
    ]);
  }, [queryClient]);

  // ── Notification Query ────────────────────────────────────────────────

  const notifQuery = useQuery({
    queryKey: ['home-notif'],
    queryFn: fetchNotifications,
    enabled: status === 'authenticated',
    ...CACHE_CONFIG,
    select: (d: any) => ({
      unread: Array.isArray(d) ? d.filter((i: any) => !i.isRead).length : 0,
    }),
  });

  const unread = notifQuery.data?.unread ?? 0;

  // ── Tab Animation ─────────────────────────────────────────────────────

  const handleTabChange = useCallback((tab: HomeTab) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveTab(tab);
  }, []);

  useEffect(() => {
    const index = TABS.indexOf(activeTab);
    if (tabWidths.length === TABS.length) {
      const gap = 4;
      const xOffset = tabWidths.slice(0, index).reduce((sum, w) => sum + w + gap, gap);
      Animated.spring(tabPosition, { toValue: xOffset, tension: 150, friction: 20, useNativeDriver: true }).start();
    }
  }, [activeTab, tabWidths, tabPosition]);

  // ── Queries ───────────────────────────────────────────────────────────

  const categoriesQuery = useQuery({ queryKey: ['home-categories'], queryFn: fetchCategories, ...CACHE_CONFIG });
  const featuredProducts = useQuery({ queryKey: ['home-featured-products'], queryFn: () => fetchProducts({ limit: 12, sort: 'latest', verifiedOnly: true }), ...CACHE_CONFIG });
  const latestProducts = useQuery({ queryKey: ['home-latest-products'], queryFn: () => fetchProducts({ limit: 30, sort: 'latest' }), ...CACHE_CONFIG });
  const sellers = useQuery({ queryKey: ['manufacturers-directory'], queryFn: () => fetchSellers({ limit: 30, sort: 'verified' }), ...CACHE_CONFIG });
  const products = useInfiniteQuery({
    queryKey: ['home-products-feed'],
    queryFn: ({ pageParam = 1 }) => fetchProducts({ page: Number(pageParam), limit: 18, sort: 'latest' }),
    initialPageParam: 1,
    ...CACHE_CONFIG,
    getNextPageParam: (lastPage: any) => {
      const p = lastPage.pagination;
      return p?.page && p.totalPages && p.page < p.totalPages ? p.page + 1 : undefined;
    },
  });

  const categories = useMemo(() => (categoriesQuery.data ?? []).filter((cat: Category, i: number, list: Category[]) => list.findIndex((c: Category) => getStableKey(c) === getStableKey(cat)) === i), [categoriesQuery.data]);
  const productFeed = useMemo(() => products.data?.pages?.flatMap((p: any) => p.products as Product[]) ?? [], [products.data]);
  const manufacturers = useMemo(() => sellers.data?.sellers?.length ? sellers.data.sellers : collectSellers(productFeed), [productFeed, sellers.data]);

  const openExplore = useCallback((action: ExploreAction) => { if (action.route) navigation.navigate(action.route); }, [navigation]);
  const refreshAll = useCallback(() => { Promise.allSettled([categoriesQuery.refetch(), featuredProducts.refetch(), latestProducts.refetch(), sellers.refetch()]); }, [categoriesQuery, featuredProducts, latestProducts, sellers]);

  // ── AI Chat Logic ─────────────────────────────────────────────────────

  const scrollToBottom = useCallback(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    setInputText('');

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: trimmed, timestamp: Date.now() };
    const assistantMsg: ChatMessage = { id: `a-${Date.now()}`, role: 'assistant', content: '', timestamp: Date.now(), isStreaming: true };
    setMessages(prev => [...prev, userMsg, assistantMsg]);
    scrollToBottom();
    
    setIsStreaming(true);
    let full = '';

    try {
      await streamAIChat({ 
        message: trimmed, 
        displayMessage: trimmed, 
        chatId, 
        role: 'buyer', 
        conversationType: 'assistant', 
        context: { feature: 'Home AI', sourcePath: '/mobile/home/ai' } 
      }, chunk => {
        if (chunk.type === 'token') {
          full += String(chunk.content ?? '');
          setMessages(prev => {
            const u = [...prev];
            const l = u[u.length - 1];
            if (l?.role === 'assistant' && l.isStreaming) {
              u[u.length - 1] = { ...l, content: full };
            }
            return u;
          });
        }
        if ((chunk.type === 'start' || chunk.type === 'done') && typeof chunk.chatId === 'string') {
          setChatId(chunk.chatId);
          setActiveAIChatId('buyer', chunk.chatId);
        }
        if (chunk.type === 'error') {
          full = chunk.message ?? 'AI response failed.';
        }
      });
    } catch (e: any) { 
      full = `Unable to process request. Please try again.`;
    }

    setMessages(prev => {
      const u = [...prev];
      const l = u[u.length - 1];
      if (l?.role === 'assistant' && l.isStreaming) {
        u[u.length - 1] = { ...l, content: full || 'No response.', isStreaming: false };
      }
      return u;
    });
    setIsStreaming(false);
    scrollToBottom();
  }, [isStreaming, chatId, scrollToBottom]);

  const resetChat = useCallback(() => {
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content: "Hello! I'm your EsyGlob AI trade assistant. How can I help you today?",
      timestamp: Date.now(),
    }]);
    setChatId(undefined);
    setActiveAIChatId('buyer');
  }, []);

  const showSuggestions = messages.length === 1 && !isStreaming;

  // ── AI Chat Tab ───────────────────────────────────────────────────────

  const renderAI = () => (
    <KeyboardAvoidingView
      style={aiStyles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
    >
      <View style={aiStyles.header}>
        <View style={aiStyles.headerRow}>
          <View style={aiStyles.headerLeft}>
            <View style={aiStyles.avatarBox}>
              <Icon name="robot" size={18} color="#FFF" />
            </View>
            <View>
              <Text style={aiStyles.headerTitle}>Esy AI</Text>
              <Text style={aiStyles.headerStatus}>
                {isStreaming ? 'Typing...' : 'Online'}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={resetChat} style={aiStyles.newBtn}>
            <Icon name="plus" size={16} color="#2563EB" />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        contentContainerStyle={aiStyles.list}
        onContentSizeChange={scrollToBottom}
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => {
          const isUser = item.role === 'user';
          const time = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const showAvatar = !isUser && (index === 0 || messages[index - 1]?.role !== 'assistant');

          return (
            <View style={[aiStyles.msgRow, isUser && aiStyles.msgRowUser]}>
              {!isUser && (
                <View style={[aiStyles.msgAvatar, !showAvatar && aiStyles.msgAvatarHidden]}>
                  {showAvatar && <Icon name="robot" size={12} color="#2563EB" />}
                </View>
              )}
              <View style={[aiStyles.bubble, isUser ? aiStyles.bubbleUser : aiStyles.bubbleAI]}>
                {!isUser && item.isStreaming && !item.content && (
                  <View style={aiStyles.typing}>
                    <View style={aiStyles.typingDot} />
                    <View style={aiStyles.typingDot} />
                    <View style={aiStyles.typingDot} />
                  </View>
                )}
                <Text style={[aiStyles.bubbleText, isUser && aiStyles.bubbleTextUser]} selectable>
                  {item.content}
                </Text>
                <Text style={[aiStyles.time, isUser && aiStyles.timeUser]}>{time}</Text>
              </View>
            </View>
          );
        }}
        ListFooterComponent={
          showSuggestions ? (
            <View style={aiStyles.suggestions}>
              <Text style={aiStyles.suggTitle}>Try asking</Text>
              {[
                { icon: 'magnify', text: 'Find electronics suppliers' },
                { icon: 'calculator', text: 'Calculate import duties' },
                { icon: 'trending-up', text: 'Trending products now' },
                { icon: 'shield-check', text: 'How to verify supplier' },
                { icon: 'truck-delivery', text: 'Shipping to India' },
              ].map((s, i) => (
                <TouchableOpacity key={i} style={aiStyles.suggChip} onPress={() => sendMessage(s.text)} activeOpacity={0.7}>
                  <Icon name={s.icon} size={14} color="#2563EB" />
                  <Text style={aiStyles.suggText}>{s.text}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null
        }
      />

      <View style={[aiStyles.inputBar, { paddingBottom: Math.max(insets.bottom, 8) + 72 }]}>
        <View style={aiStyles.inputRow}>
          <TextInput
            value={inputText}
            onChangeText={setInputText}
            placeholder="Ask anything..."
            placeholderTextColor={D.textTertiary}
            style={aiStyles.input}
            multiline
            maxLength={500}
            onSubmitEditing={() => sendMessage(inputText)}
          />
          <TouchableOpacity
            onPress={() => sendMessage(inputText)}
            disabled={!inputText.trim() || isStreaming}
            style={[aiStyles.sendBtn, (!inputText.trim() || isStreaming) && aiStyles.sendDisabled]}
          >
            <Icon name="arrow-up" size={16} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );

  // ── Main Render ───────────────────────────────────────────────────────

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={D.surface} />

      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.brandRow}>
            <Image 
              source={require('../../esyglob-logo.jpeg')} 
              resizeMode="contain" 
              style={styles.logoImg}
            />
            <Text style={styles.brand}>EsyGlob</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable onPress={() => navigation.navigate('Notifications')} style={styles.iconBtn}>
              <Icon name="bell-outline" size={20} color={D.textSecondary} />
              {unread > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>{unread > 99 ? '99+' : unread}</Text>
                </View>
              )}
            </Pressable>
            <Pressable onPress={() => navigation.navigate('Messages')} style={styles.iconBtn}>
              <Icon name="message-text-outline" size={20} color={D.textSecondary} />
            </Pressable>
          </View>
        </View>

        <View style={styles.tabTrack}>
          {tabWidths.length === TABS.length && (
            <Animated.View style={[styles.tabIndicator, { transform: [{ translateX: tabPosition }], width: (tabWidths[TABS.indexOf(activeTab)] || 80) - 8 }]} />
          )}
          {TABS.map((tab, index) => (
            <Pressable key={tab} onPress={() => handleTabChange(tab)} onLayout={e => { const w = e.nativeEvent.layout.width; setTabWidths(prev => { const n = [...prev]; n[index] = w; return n; }); }} style={styles.tabButton}>
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
            </Pressable>
          ))}
        </View>

        {activeTab !== 'AI' && (
          <Pressable style={styles.searchBar} onPress={() => setShowSearch(true)}>
            <Icon name="magnify" size={18} color={D.textTertiary} />
            <Text style={styles.searchPlaceholder}>Search products, suppliers...</Text>
            <Pressable onPress={event => { event.stopPropagation(); navigation.navigate('ImageSearch'); }} style={styles.searchCamera}>
              <Icon name="camera-outline" size={16} color="#2563EB" />
            </Pressable>
          </Pressable>
        )}
      </View>

      <View style={styles.content}>
        {activeTab === 'AI' && renderAI()}

        {activeTab === 'Products' && (
          <FlashList
            data={productFeed}
            keyExtractor={(item: Product) => getId(item) || Math.random().toString()}
            numColumns={2}
            estimatedItemSize={280}
            contentContainerStyle={styles.gridContent}
            refreshControl={<RefreshControl refreshing={products.isRefetching && !products.isFetchingNextPage} onRefresh={() => products.refetch()} tintColor={D.primary} />}
            onEndReachedThreshold={0.4}
            onEndReached={() => { if (products.hasNextPage && !products.isFetchingNextPage) products.fetchNextPage(); }}
            ListHeaderComponent={
              <View>
                <ExploreShortcuts actions={EXPLORE_ACTIONS} onPress={openExplore} />
                <CategorySlider categories={categories} loading={categoriesQuery.isLoading} navigation={navigation} />
                <ProductSection title="Featured Products" products={featuredProducts.data?.products ?? []} loading={featuredProducts.isLoading} navigation={navigation} />
                <SectionHeader title="All Products" />
              </View>
            }
            ListEmptyComponent={products.isLoading ? <LoadingState label="Discovering..." /> : <EmptyState title="No products" />}
            ListFooterComponent={products.isFetchingNextPage ? <ActivityIndicator color={D.primary} style={{ padding: 20 }} /> : null}
            renderItem={({ item }: { item: Product }) => <View style={styles.gridItem}><ProductCard product={item} variant="grid" /></View>}
          />
        )}

        {activeTab === 'Manufacturers' && (
          <FlashList
            data={manufacturers}
            keyExtractor={(item: SellerSummary) => getStableKey(item)}
            estimatedItemSize={350}
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 100 }}
            refreshControl={<RefreshControl refreshing={sellers.isRefetching} onRefresh={refreshAll} tintColor={D.primary} />}
            ListHeaderComponent={<SectionHeader title="Verified Manufacturers" />}
            ListEmptyComponent={sellers.isLoading ? <LoadingState label="Loading..." /> : <EmptyState title="No manufacturers" />}
            renderItem={({ item }: { item: SellerSummary }) => <SellerCard seller={item} navigation={navigation} />}
          />
        )}
      </View>

      <LiveSearchDropdown visible={showSearch} onClose={() => setShowSearch(false)} navigation={navigation} />
    </View>
  );
}

// ─── Sub-Components ─────────────────────────────────────────────────────────

const ExploreShortcuts = React.memo(({ actions, onPress }: { actions: ExploreAction[]; onPress: (a: ExploreAction) => void }) => (
  <View style={{ paddingVertical: 12 }}>
    <FlatList
      data={actions}
      horizontal
      keyExtractor={item => item.title}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => onPress(item)}
          style={({ pressed }) => [
            { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, gap: 10, borderWidth: 1, borderColor: D.border, minWidth: 130 },
            pressed && { backgroundColor: '#FAFAFA', transform: [{ scale: 0.97 }] },
          ]}
        >
          <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: item.bg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={item.icon} size={20} color={item.color} />
          </View>
          <Text style={{ fontSize: 11, fontWeight: '600', color: D.text, lineHeight: 14 }} numberOfLines={2}>{item.title}</Text>
        </Pressable>
      )}
    />
  </View>
));

const CategorySlider = React.memo(({ categories, loading, navigation }: any) => {
  if (loading && !categories.length) return null;
  if (!categories.length) return null;
  return (
    <View style={{ paddingBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: D.text }}>Categories</Text>
        <Pressable onPress={() => navigation.navigate('Categories')}><Text style={{ fontSize: 12, fontWeight: '600', color: '#2563EB' }}>See all</Text></Pressable>
      </View>
      <FlatList data={categories.slice(0, 30)} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 12 }}
        renderItem={({ item }) => (
          <Pressable onPress={() => navigation.navigate('ProductListing', { category: item.name ?? item.slug, categoryName: item.name })} style={{ alignItems: 'center', width: 68 }}>
            <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: D.primaryLight, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 6 }}>
              {firstImage(item.image, item.icon) ? <RemoteImage uri={firstImage(item.image, item.icon)} width={64} height={64} style={{ width: 58, height: 58, borderRadius: 29 }} /> : <Icon name="view-grid-outline" size={20} color="#2563EB" />}
            </View>
            <Text style={{ fontSize: 10, fontWeight: '600', color: D.text, textAlign: 'center' }} numberOfLines={1}>{item.name ?? item.slug}</Text>
          </Pressable>
        )} />
    </View>
  );
});

const ProductSection = React.memo(({ title, products: items, loading, navigation }: any) => {
  if (loading && !items?.length) return null;
  if (!items?.length) return null;
  return (
    <View style={{ paddingBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: D.text }}>{title}</Text>
        <Pressable onPress={() => navigation.navigate('ProductListing')}><Text style={{ fontSize: 12, fontWeight: '600', color: '#2563EB' }}>View all</Text></Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 10 }}>
        {items.map((product: Product) => <ProductCard key={getId(product)} product={product} />)}
      </ScrollView>
    </View>
  );
});

// ─── Seller Card ────────────────────────────────────────────────────────────

const SellerCard = React.memo(({ seller, navigation }: any) => {
  const sellerId = getStableKey(seller);
  
  const title = seller.companyName ?? seller.businessName ?? seller.displayName ?? 'Supplier';
  const companyType = seller.companyType;
  const description = seller.companyDescription ?? seller.companyIntroduction ?? seller.description ?? '';
  const yearEstablished = seller.yearEstablished ?? seller.establishedYear;
  const employeeCount = seller.employeeCount ?? seller.employees;
  
  const country = seller.address?.country ?? seller.country;
  const city = seller.address?.city;
  const location = [city, country].filter(Boolean).join(', ') || 'Worldwide';
  
  const verified = seller.isVerified || seller.verificationStatus === 'verified';
  const isTrusted = seller.isTrustedSeller;
  const verificationLevel = seller.verificationLevel ?? 0;
  const trustScore = seller.trustScore ?? 0;
  
  const sellerImage = firstImage(seller.logo, seller.companyLogo, seller.logoUrl, seller.factoryImages);
  const factoryImages = (seller.factoryImages ?? []).filter(Boolean).slice(0, 2);
  
  const rating = seller.rating ? Number(seller.rating).toFixed(1) : null;
  const reviewCount = seller.reviewCount ?? 0;
  const responseRate = seller.responseRate ?? 0;
  const responseTime = seller.averageResponseTimeHours;
  const onTimeDelivery = seller.onTimeDeliveryRate ?? 0;
  
  const totalProducts = seller.totalProducts ?? seller.productCount ?? 0;
  const totalOrders = seller.totalOrders ?? 0;
  const totalRevenue = seller.totalRevenue ?? seller.annualRevenue ?? seller.revenue;
  const repeatBuyerRate = seller.tradeHistorySummary?.repeatBuyerRate ?? 0;
  const countriesServed = seller.tradeHistorySummary?.countriesServed ?? 0;
  
  const exportMarkets = seller.exportMarkets ?? [];
  const productCategories = seller.productCategories ?? seller.mainCategories ?? [];
  const certifications = seller.certifications ?? [];
  
  const subscriptionPlan = seller.subscriptionPlan ?? 'free';
  const subscriptionStatus = seller.subscriptionStatus;
  
  const originPort = seller.shippingInfo?.originPort;
  const handlingTime = seller.shippingInfo?.handlingTime;
  
  const isCurrentlyOpen = useMemo(() => {
    if (!seller.businessHours) return null;
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const now = new Date();
    const day = days[now.getDay()];
    const hours = seller.businessHours[day];
    if (!hours?.open) return null;
    const currentTime = now.getHours() * 60 + now.getMinutes();
    const [openH, openM] = (hours.open || '00:00').split(':').map(Number);
    const [closeH, closeM] = (hours.close || '00:00').split(':').map(Number);
    const openTime = openH * 60 + openM;
    const closeTime = closeH * 60 + closeM;
    return currentTime >= openTime && currentTime <= closeTime;
  }, [seller.businessHours]);

  const yearsInBusiness = seller.yearsInBusiness ?? (yearEstablished ? new Date().getFullYear() - yearEstablished : null);

  const blueThemes = [
    { primary: '#1E40AF', light: '#EFF6FF', accent: '#3B82F6' },
    { primary: '#1D4ED8', light: '#EEF2FF', accent: '#4F46E5' },
    { primary: '#3730A3', light: '#F5F3FF', accent: '#6366F1' },
  ];
  const hash = sellerId.split('').reduce((s: number, c: string) => s + c.charCodeAt(0), 0);
  const theme = blueThemes[hash % blueThemes.length];

  const formatRevenue = (val: any): string => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    const num = Number(val);
    if (num >= 10000000) return `₹${(num / 10000000).toFixed(1)}Cr`;
    if (num >= 100000) return `₹${(num / 100000).toFixed(1)}L`;
    return `₹${num.toLocaleString('en-IN')}`;
  };

  const getCompanyTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      manufacturer: 'Manufacturer', wholesaler: 'Wholesaler',
      distributor: 'Distributor', trader: 'Trader', exporter: 'Exporter',
    };
    return labels[type] || type;
  };

  return (
    <Pressable
      onPress={() => navigation.navigate('SellerDetails', { sellerId, sellerName: title })}
      style={({ pressed }) => [sellerStyles.card, pressed && { transform: [{ scale: 0.985 }] }]}
    >
      <View style={[sellerStyles.header, { backgroundColor: theme.primary }]}>
        <View style={sellerStyles.headerContent}>
          <View style={sellerStyles.logoWrap}>
            <RemoteImage uri={sellerImage} width={60} height={60} style={sellerStyles.logo}
              fallback={
                <View style={[sellerStyles.logoFallback, { backgroundColor: theme.accent }]}>
                  <Text style={sellerStyles.logoFallbackText}>{title.slice(0, 2).toUpperCase()}</Text>
                </View>
              }
            />
            {verified && (
              <View style={sellerStyles.verifiedBadge}>
                <Icon name="check-decagram" size={16} color="#10B981" />
              </View>
            )}
          </View>
          <View style={sellerStyles.headerInfo}>
            <View style={sellerStyles.nameRow}>
              <Text style={sellerStyles.name} numberOfLines={2}>{title}</Text>
              {isCurrentlyOpen !== null && (
                <View style={[sellerStyles.openBadge, { backgroundColor: isCurrentlyOpen ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)' }]}>
                  <View style={[sellerStyles.openDot, { backgroundColor: isCurrentlyOpen ? '#10B981' : '#EF4444' }]} />
                  <Text style={[sellerStyles.openText, { color: isCurrentlyOpen ? '#6EE7B7' : '#FCA5A5' }]}>{isCurrentlyOpen ? 'Open' : 'Closed'}</Text>
                </View>
              )}
            </View>
            <View style={sellerStyles.locationRow}>
              <Icon name="map-marker" size={10} color="rgba(255,255,255,0.8)" />
              <Text style={sellerStyles.location} numberOfLines={1}>{location}</Text>
              {originPort && (
                <>
                  <View style={sellerStyles.locationDot} />
                  <Icon name="anchor" size={9} color="rgba(255,255,255,0.6)" />
                  <Text style={[sellerStyles.location, { color: 'rgba(255,255,255,0.6)' }]} numberOfLines={1}>{originPort}</Text>
                </>
              )}
            </View>
            <View style={sellerStyles.badgeRow}>
              {companyType && (
                <View style={[sellerStyles.miniBadge, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                  <Icon name="domain" size={7} color="rgba(255,255,255,0.8)" />
                  <Text style={[sellerStyles.miniBadgeText, { color: 'rgba(255,255,255,0.9)' }]}>{getCompanyTypeLabel(companyType)}</Text>
                </View>
              )}
              {verified && (
                <View style={[sellerStyles.miniBadge, { backgroundColor: 'rgba(16,185,129,0.2)' }]}>
                  <Text style={[sellerStyles.miniBadgeText, { color: '#6EE7B7' }]}>✓ Verified</Text>
                </View>
              )}
              {isTrusted && (
                <View style={[sellerStyles.miniBadge, { backgroundColor: 'rgba(245,158,11,0.2)' }]}>
                  <Text style={[sellerStyles.miniBadgeText, { color: '#FBBF24' }]}>★ Trusted</Text>
                </View>
              )}
              {verificationLevel > 3 && (
                <View style={[sellerStyles.miniBadge, { backgroundColor: 'rgba(167,139,250,0.2)' }]}>
                  <Text style={[sellerStyles.miniBadgeText, { color: '#C4B5FD' }]}>L{verificationLevel}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </View>

      <View style={sellerStyles.metricsRow}>
        <View style={sellerStyles.metric}>
          <Icon name="star" size={14} color="#F59E0B" />
          <Text style={sellerStyles.metricValue}>{rating || '—'}</Text>
          <Text style={sellerStyles.metricLabel}>{reviewCount > 0 ? `(${reviewCount})` : 'Rating'}</Text>
        </View>
        <View style={sellerStyles.metricDivider} />
        <View style={sellerStyles.metric}>
          <Icon name="shield-check" size={14} color="#10B981" />
          <Text style={sellerStyles.metricValue}>{trustScore > 0 ? `${trustScore}%` : '—'}</Text>
          <Text style={sellerStyles.metricLabel}>Trust</Text>
        </View>
        <View style={sellerStyles.metricDivider} />
        <View style={sellerStyles.metric}>
          <Icon name="package-variant" size={14} color={theme.primary} />
          <Text style={sellerStyles.metricValue}>{totalProducts || '—'}</Text>
          <Text style={sellerStyles.metricLabel}>Products</Text>
        </View>
        <View style={sellerStyles.metricDivider} />
        <View style={sellerStyles.metric}>
          <Icon name="clock-outline" size={14} color="#8B5CF6" />
          <Text style={sellerStyles.metricValue}>{yearsInBusiness ? `${yearsInBusiness}Y` : '—'}</Text>
          <Text style={sellerStyles.metricLabel}>Exp</Text>
        </View>
      </View>

      <View style={sellerStyles.infoGrid}>
        <View style={sellerStyles.infoItem}>
          <View style={[sellerStyles.infoIcon, { backgroundColor: '#EFF6FF' }]}>
            <Icon name="message-reply-text" size={13} color="#2563EB" />
          </View>
          <View>
            <Text style={sellerStyles.infoLabel}>Response</Text>
            <Text style={sellerStyles.infoValue}>{responseRate > 0 ? `${responseRate}%` : responseTime ? `${responseTime}h` : '—'}</Text>
          </View>
        </View>
        <View style={sellerStyles.infoItem}>
          <View style={[sellerStyles.infoIcon, { backgroundColor: '#ECFDF5' }]}>
            <Icon name="truck-check" size={13} color="#10B981" />
          </View>
          <View>
            <Text style={sellerStyles.infoLabel}>Delivery</Text>
            <Text style={sellerStyles.infoValue}>{onTimeDelivery > 0 ? `${onTimeDelivery}%` : '—'}</Text>
          </View>
        </View>
        {totalRevenue > 0 && (
          <View style={sellerStyles.infoItem}>
            <View style={[sellerStyles.infoIcon, { backgroundColor: '#FFF7ED' }]}>
              <Icon name="chart-bar" size={13} color="#F97316" />
            </View>
            <View>
              <Text style={sellerStyles.infoLabel}>Revenue</Text>
              <Text style={sellerStyles.infoValue}>{formatRevenue(totalRevenue)}</Text>
            </View>
          </View>
        )}
        {employeeCount && (
          <View style={sellerStyles.infoItem}>
            <View style={[sellerStyles.infoIcon, { backgroundColor: '#F5F3FF' }]}>
              <Icon name="account-group" size={13} color="#7C3AED" />
            </View>
            <View>
              <Text style={sellerStyles.infoLabel}>Team</Text>
              <Text style={sellerStyles.infoValue}>{employeeCount}</Text>
            </View>
          </View>
        )}
        {countriesServed > 0 && (
          <View style={sellerStyles.infoItem}>
            <View style={[sellerStyles.infoIcon, { backgroundColor: '#ECFEFF' }]}>
              <Icon name="earth" size={13} color="#0891B2" />
            </View>
            <View>
              <Text style={sellerStyles.infoLabel}>Countries</Text>
              <Text style={sellerStyles.infoValue}>{countriesServed}</Text>
            </View>
          </View>
        )}
        {repeatBuyerRate > 0 && (
          <View style={sellerStyles.infoItem}>
            <View style={[sellerStyles.infoIcon, { backgroundColor: '#FEFCE8' }]}>
              <Icon name="account-check" size={13} color="#CA8A04" />
            </View>
            <View>
              <Text style={sellerStyles.infoLabel}>Repeat</Text>
              <Text style={sellerStyles.infoValue}>{repeatBuyerRate}%</Text>
            </View>
          </View>
        )}
        {handlingTime && (
          <View style={sellerStyles.infoItem}>
            <View style={[sellerStyles.infoIcon, { backgroundColor: '#FDF2F8' }]}>
              <Icon name="clock-fast" size={13} color="#DB2777" />
            </View>
            <View>
              <Text style={sellerStyles.infoLabel}>Handling</Text>
              <Text style={sellerStyles.infoValue}>{handlingTime}</Text>
            </View>
          </View>
        )}
        {totalOrders > 0 && (
          <View style={sellerStyles.infoItem}>
            <View style={[sellerStyles.infoIcon, { backgroundColor: '#F0FDF4' }]}>
              <Icon name="shopping-outline" size={13} color="#16A34A" />
            </View>
            <View>
              <Text style={sellerStyles.infoLabel}>Orders</Text>
              <Text style={sellerStyles.infoValue}>{totalOrders.toLocaleString('en-IN')}</Text>
            </View>
          </View>
        )}
      </View>

      {description ? (
        <View style={sellerStyles.descSection}>
          <Icon name="information-outline" size={12} color={D.textTertiary} />
          <Text style={sellerStyles.descText} numberOfLines={2}>{description}</Text>
        </View>
      ) : null}

      {exportMarkets.length > 0 && (
        <View style={sellerStyles.marketsRow}>
          <Icon name="flag-outline" size={11} color={theme.primary} />
          <Text style={sellerStyles.marketsText} numberOfLines={1}>
            Exports to: {exportMarkets.slice(0, 5).join(', ')}{exportMarkets.length > 5 ? ` +${exportMarkets.length - 5}` : ''}
          </Text>
        </View>
      )}

      {productCategories.length > 0 && (
        <View style={sellerStyles.chipsRow}>
          {productCategories.slice(0, 4).map((cat: string, i: number) => (
            <View key={i} style={[sellerStyles.chip, { backgroundColor: theme.light }]}>
              <Text style={[sellerStyles.chipText, { color: theme.primary }]}>{cat}</Text>
            </View>
          ))}
          {productCategories.length > 4 && (
            <Text style={sellerStyles.chipMoreText}>+{productCategories.length - 4} more</Text>
          )}
        </View>
      )}

      {certifications.length > 0 && (
        <View style={sellerStyles.certRow}>
          <Icon name="certificate" size={12} color="#F59E0B" />
          <View style={sellerStyles.certList}>
            {certifications.slice(0, 3).map((cert: any, i: number) => (
              <View key={i} style={sellerStyles.certBadge}>
                <Text style={sellerStyles.certBadgeText}>{cert.name || cert}</Text>
              </View>
            ))}
            {certifications.length > 3 && <Text style={sellerStyles.certMoreText}>+{certifications.length - 3}</Text>}
          </View>
        </View>
      )}

      {factoryImages.length > 0 && (
        <View style={sellerStyles.factoryRow}>
          {factoryImages.map((uri: string, i: number) => (
            <View key={i} style={sellerStyles.factoryImg}>
              <RemoteImage uri={uri} width={200} height={120} style={{ width: '100%', height: 75, borderRadius: 8 }} />
              {i === 0 && (
                <View style={sellerStyles.factoryTag}>
                  <Icon name="factory" size={8} color="#FFF" />
                  <Text style={sellerStyles.factoryTagText}>Factory View</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      )}

      {subscriptionPlan !== 'free' && subscriptionStatus === 'active' && (
        <View style={sellerStyles.subscriptionStrip}>
          <Icon name="crown" size={12} color="#F59E0B" />
          <Text style={sellerStyles.subscriptionText}>{subscriptionPlan.charAt(0).toUpperCase() + subscriptionPlan.slice(1)} Plan</Text>
        </View>
      )}

      <View style={sellerStyles.footer}>
        <SavedHeartButton type="supplier" itemId={sellerId} target={seller} size={18} iconColor="#94A3B8" savedColor="#EF4444" />
        <Pressable style={({ pressed }) => [sellerStyles.viewBtn, { backgroundColor: theme.primary }, pressed && { opacity: 0.9 }]}
          onPress={() => navigation.navigate('SellerDetails', { sellerId, sellerName: title })}>
          <Text style={sellerStyles.viewBtnText}>View Profile</Text>
          <Icon name="arrow-right" size={13} color="#FFF" />
        </Pressable>
      </View>
    </Pressable>
  );
});

function collectSellers(productsList: Product[]): SellerSummary[] {
  const map = new Map<string, SellerSummary>();
  productsList.forEach(p => {
    const s = p.seller ?? p.sellerId;
    if (!s || typeof s === 'string') return;
    const id = getStableKey(s);
    const ex = map.get(id);
    map.set(id, { ...ex, ...s, productCount: (ex?.productCount ?? 0) + 1, mainCategories: [...new Set([...(ex?.mainCategories ?? []), p.category].filter(Boolean) as string[])] });
  });
  return Array.from(map.values());
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: D.bg },
  header: { backgroundColor: D.surface, paddingTop: Platform.OS === 'ios' ? 56 : 44, paddingBottom: 8, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: D.borderLight, zIndex: 10 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  logoImg: { width: 28, height: 28, borderRadius: 12 },
  brand: { fontSize: 15, fontWeight: '600', color: D.text, letterSpacing: -0.4 },
  headerActions: { flexDirection: 'row', gap: 4 },
  iconBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  notifBadge: { position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 1.5, borderColor: '#FFF' },
  notifBadgeText: { fontSize: 8, fontWeight: '800', color: '#FFF' },
  tabTrack: { flexDirection: 'row', backgroundColor: D.borderLight, borderRadius: 14, padding: 4, position: 'relative', marginBottom: 10 },
  tabIndicator: { position: 'absolute', top: 4, bottom: 4, backgroundColor: D.surface, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  tabButton: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, zIndex: 1 },
  tabText: { fontSize: 13, fontWeight: '600', color: D.textTertiary },
  tabTextActive: { color: '#2563EB', fontWeight: '700' },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: D.borderLight, borderRadius: 24, paddingHorizontal: 16, height: 44, marginBottom: 4 },
  searchPlaceholder: { flex: 1, fontSize: 13, fontWeight: '500', color: D.textTertiary },
  searchCamera: { width: 32, height: 32, borderRadius: 24, backgroundColor: D.primaryLight, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1 },
  gridContent: { paddingHorizontal: 8, paddingBottom: 100 },
  gridItem: { flex: 1, margin: 4, minWidth: 0 },
});

// ─── Seller Card Styles ─────────────────────────────────────────────────────

const sellerStyles = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: 16, marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: D.border, shadowColor: '#1E40AF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  header: { padding: 14 },
  headerContent: { flexDirection: 'row', gap: 12 },
  logoWrap: { position: 'relative', flexShrink: 0 },
  logo: { width: 60, height: 60, borderRadius: 14, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', backgroundColor: 'rgba(255,255,255,0.1)' },
  logoFallback: { width: 60, height: 60, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  logoFallbackText: { fontSize: 22, fontWeight: '800', color: '#FFF' },
  verifiedBadge: { position: 'absolute', bottom: -4, right: -4, width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 3 },
  headerInfo: { flex: 1, justifyContent: 'center', gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  name: { fontSize: 15, fontWeight: '700', color: '#FFF', lineHeight: 19, flex: 1 },
  openBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  openDot: { width: 5, height: 5, borderRadius: 3 },
  openText: { fontSize: 7, fontWeight: '700', textTransform: 'uppercase' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  location: { fontSize: 10, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },
  locationDot: { width: 2, height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.3)' },
  badgeRow: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  miniBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  miniBadgeText: { fontSize: 7.5, fontWeight: '700' },
  metricsRow: { flexDirection: 'row', backgroundColor: '#F8FAFC', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: D.borderLight },
  metric: { flex: 1, alignItems: 'center', gap: 2 },
  metricValue: { fontSize: 13, fontWeight: '700', color: D.text },
  metricLabel: { fontSize: 8.5, fontWeight: '600', color: D.textTertiary, textTransform: 'uppercase' },
  metricDivider: { width: 1, height: 28, backgroundColor: D.borderLight, alignSelf: 'center' },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 8 },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '47%', backgroundColor: '#F8FAFC', borderRadius: 10, padding: 8 },
  infoIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  infoLabel: { fontSize: 9, fontWeight: '600', color: D.textTertiary, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 1 },
  infoValue: { fontSize: 11, fontWeight: '700', color: D.text },
  descSection: { flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingBottom: 8, alignItems: 'flex-start' },
  descText: { fontSize: 11.5, color: D.textSecondary, lineHeight: 16, flex: 1 },
  marketsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingBottom: 6 },
  marketsText: { fontSize: 10, color: D.textSecondary, fontWeight: '500', flex: 1 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, paddingHorizontal: 14, paddingVertical: 6, alignItems: 'center' },
  chip: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontSize: 9.5, fontWeight: '700' },
  chipMoreText: { fontSize: 9, fontWeight: '700', color: D.textTertiary },
  certRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingHorizontal: 14, paddingVertical: 4 },
  certList: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignItems: 'center' },
  certBadge: { backgroundColor: '#FFFBEB', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: '#FDE68A' },
  certBadgeText: { fontSize: 8, fontWeight: '700', color: '#D97706' },
  certMoreText: { fontSize: 9, color: D.textTertiary, fontWeight: '600' },
  factoryRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingVertical: 8 },
  factoryImg: { flex: 1, position: 'relative', borderRadius: 8, overflow: 'hidden', backgroundColor: '#F1F5F9' },
  factoryTag: { position: 'absolute', top: 4, left: 4, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  factoryTagText: { fontSize: 7, fontWeight: '700', color: '#FFF' },
  subscriptionStrip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: '#FFFBEB', paddingVertical: 5, borderTopWidth: 1, borderTopColor: '#FDE68A' },
  subscriptionText: { fontSize: 9, fontWeight: '700', color: '#D97706' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#F8FAFC', borderTopWidth: 1, borderTopColor: D.borderLight },
  viewBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 2 },
  viewBtnText: { fontSize: 11, fontWeight: '700', color: '#FFF' },
});

// ─── AI Chat Styles ─────────────────────────────────────────────────────────

const aiStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { backgroundColor: '#FFF', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarBox: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  headerStatus: { fontSize: 9, color: '#94A3B8', fontWeight: '500' },
  newBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 10, paddingVertical: 8, flexGrow: 1 },
  msgRow: { flexDirection: 'row', marginBottom: 8, gap: 6, maxWidth: '85%' },
  msgRowUser: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  msgAvatar: { width: 24, height: 24, borderRadius: 8, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  msgAvatarHidden: { opacity: 0 },
  bubble: { padding: 9, paddingHorizontal: 12, borderRadius: 14 },
  bubbleAI: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E2E8F0', borderBottomLeftRadius: 4 },
  bubbleUser: { backgroundColor: '#2563EB', borderBottomRightRadius: 4 },
  bubbleText: { fontSize: 12.5, lineHeight: 18, color: '#0F172A' },
  bubbleTextUser: { color: '#FFF' },
  time: { fontSize: 8, color: '#94A3B8', marginTop: 3, textAlign: 'right' },
  timeUser: { color: 'rgba(255,255,255,0.5)' },
  typing: { flexDirection: 'row', gap: 3, paddingVertical: 2 },
  typingDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#CBD5E1' },
  suggestions: { paddingTop: 12 },
  suggTitle: { fontSize: 9, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center', marginBottom: 8 },
  suggChip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFF', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 5 },
  suggText: { fontSize: 12, fontWeight: '500', color: '#0F172A', flex: 1 },
  inputBar: { paddingHorizontal: 8, paddingTop: 6, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, backgroundColor: '#F1F5F9', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5, borderWidth: 1, borderColor: '#E2E8F0' },
  input: { flex: 1, fontSize: 13, color: '#0F172A', maxHeight: 80, paddingVertical: 3 },
  sendBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { backgroundColor: '#CBD5E1' },
});

export default React.memo(HomeScreen);