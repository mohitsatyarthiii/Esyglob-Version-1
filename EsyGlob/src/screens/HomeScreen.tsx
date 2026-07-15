/* eslint-disable react-native/no-inline-styles */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
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
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchCategories } from '../api/categories';
import { fetchSellers } from '../api/marketplace';
import { fetchProducts } from '../api/products';
import { Category, Product, SellerSummary } from '../api/types';
import LiveSearchDropdown from '../components/LiveSearchDropdown';
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

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Palette ────────────────────────────────────────────────────────────────

const P = {
  bg: '#F5F5F5',
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
  faint: '#E8ECF2',
  cardMuted: '#F1F5F9',
  aiBg: '#F0F4FF',
  aiBubbleAI: '#FFFFFF',
  aiBubbleUser: '#2563EB',
  aiBorder: '#E2E8F0',
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
  { icon: 'grid', title: 'Explore\nCategories', color: '#10B981', bg: '#ECFDF5', route: 'Categories' },
  { icon: 'qrcode-scan', title: 'QR / Image\nSearch', color: '#F26A21', bg: '#FFF7ED', route: 'ImageSearch' },
  { icon: 'calculator-variant-outline', title: 'Esy\nCalculator', color: '#6366F1', bg: '#EEF2FF', route: 'EsyCalculator' },
];

const CACHE_CONFIG = { staleTime: 5 * 60_000, gcTime: 30 * 60_000, retry: 2 };

// ─── AI Types ───────────────────────────────────────────────────────────────

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
};

type SSEChunk =
  | { type: 'token'; content: string }
  | { type: 'done'; chatId?: string }
  | { type: 'error'; message?: string };

const API_BASE = 'https://api.esyglob.com/api';
let AUTH_TOKEN = '';

export function setAIChatToken(token: string) {
  AUTH_TOKEN = token;
}

// ─── AI Streaming ───────────────────────────────────────────────────────────

export async function* streamAIResponse(message: string, chatId?: string): AsyncGenerator<SSEChunk> {
  const xhr = new XMLHttpRequest();
  let lastIndex = 0;
  let buffer = '';
  const chunkQueue: SSEChunk[] = [];

  xhr.open('POST', `${API_BASE}/ai-chat/stream`);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.setRequestHeader('Authorization', `Bearer ${AUTH_TOKEN}`);

  xhr.onprogress = () => {
    const newData = xhr.responseText.substring(lastIndex);
    lastIndex = xhr.responseText.length;
    buffer += newData;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      try {
        const data = JSON.parse(trimmed.slice(6)) as SSEChunk;
        chunkQueue.push(data);
      } catch {}
    }
  };

  xhr.onload = () => {
    if (buffer.trim()?.startsWith('data: ')) {
      try { chunkQueue.push(JSON.parse(buffer.trim().slice(6))); } catch {}
    }
    chunkQueue.push({ type: 'done' });
  };

  xhr.onerror = () => chunkQueue.push({ type: 'error', message: 'Network error.' });
  xhr.ontimeout = () => chunkQueue.push({ type: 'error', message: 'Timeout.' });
  xhr.timeout = 60000;

  xhr.send(JSON.stringify({ message, chatId: chatId || undefined, role: 'buyer', conversationType: 'assistant' }));

  while (true) {
    await new Promise<void>(r => setTimeout(r, 50));
    while (chunkQueue.length > 0) {
      const chunk = chunkQueue.shift()!;
      yield chunk;
      if (chunk.type === 'done' || chunk.type === 'error') return;
    }
    if (xhr.readyState === 4) {
      while (chunkQueue.length > 0) yield chunkQueue.shift()!;
      return;
    }
  }
}

// ─── Quick Suggestions ──────────────────────────────────────────────────────

const SUGGESTIONS = [
  'Find electronics suppliers',
  'Calculate import duties',
  'Trending products this week',
  'How to verify a supplier?',
  'Shipping options to India',
];

// ─── Main Component ─────────────────────────────────────────────────────────

function HomeScreen() {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<HomeTab>('Products');
  const [showSearch, setShowSearch] = useState(false);
  const tabPosition = useRef(new Animated.Value(0)).current;
  const [tabWidths, setTabWidths] = useState<number[]>([]);

  // ── AI State ──────────────────────────────────────────────────────────

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "👋 Hello! I'm your EsyGlob AI assistant. I can help you find products, suppliers, calculate duties, and more. What would you like to explore today?",
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
    setMessages(prev => [...prev, userMsg]);
    const aiMsg: ChatMessage = { id: `a-${Date.now()}`, role: 'assistant', content: '', timestamp: Date.now(), isStreaming: true };
    setMessages(prev => [...prev, aiMsg]);
    scrollToBottom();
    setIsStreaming(true);
    let full = '';

    try {
      await streamAIChat({ message: trimmed, displayMessage: trimmed, chatId, role: 'buyer', conversationType: 'assistant', context: { feature: 'Home AI', sourcePath: '/mobile/home/ai' } }, chunk => {
        if (chunk.type === 'token') { full += String(chunk.content ?? ''); setMessages(prev => { const u = [...prev]; const l = u[u.length - 1]; if (l?.isStreaming) u[u.length - 1] = { ...l, content: full }; return u; }); }
        if ((chunk.type === 'start' || chunk.type === 'done') && typeof chunk.chatId === 'string') { setChatId(chunk.chatId); setActiveAIChatId('buyer', chunk.chatId); }
        if (chunk.type === 'error') full = String(chunk.message ?? 'AI response failed.');
      });
    } catch (e: any) { full = `❌ ${e.message}`; }

    setMessages(prev => { const u = [...prev]; const l = u[u.length - 1]; if (l?.isStreaming) u[u.length - 1] = { ...l, content: full || 'No response.', isStreaming: false }; return u; });
    setIsStreaming(false);
  }, [isStreaming, chatId, scrollToBottom]);

  const resetChat = useCallback(() => {
    setMessages([{ id: 'welcome', role: 'assistant', content: "👋 Hello! I'm your EsyGlob AI assistant. How can I help you today?", timestamp: Date.now() }]);
    setChatId(undefined);
    setActiveAIChatId('buyer');
  }, []);

  const showSuggestions = messages.length === 1 && !isStreaming;

  // ── AI Chat Render ────────────────────────────────────────────────────

const renderAI = () => (
  <KeyboardAvoidingView
    style={styles.aiScreen}
    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}>
    {/* ── Compact Premium Header ── */}
    <View style={styles.aiHeader}>
      <View style={styles.aiHeaderLeft}>
        <View style={styles.aiAvatar}>
          <Icon name="robot-excited" size={18} color="#FFF" />
        </View>
        <View>
          <Text style={styles.aiHeaderTitle}>EsyGlob AI</Text>
          <View style={styles.aiStatusRow}>
            <View style={[styles.aiStatusDot, { backgroundColor: isStreaming ? P.amber : P.emerald }]} />
            <Text style={styles.aiHeaderSub}>
              {isStreaming ? 'Replying...' : 'Online'}
            </Text>
          </View>
        </View>
      </View>
      <TouchableOpacity onPress={resetChat} style={styles.aiResetBtn}>
        <Icon name="plus" size={18} color={P.muted} />
      </TouchableOpacity>
    </View>

    {/* ── Messages ── */}
    <FlatList
      ref={flatListRef}
      data={messages}
      keyExtractor={item => item.id}
      contentContainerStyle={styles.aiList}
      onContentSizeChange={scrollToBottom}
      showsVerticalScrollIndicator={false}
      renderItem={({ item, index }) => {
        const isUser = item.role === 'user';
        const time = new Date(item.timestamp).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });
        const showAvatar = !isUser && (index === 0 || messages[index - 1]?.role !== 'assistant');

        return (
          <View style={[styles.aiRow, isUser ? styles.aiRowUser : styles.aiRowAI]}>
            {/* AI Avatar — only show for first consecutive AI message */}
            {!isUser && (
              <View style={[styles.aiBubbleAvatar, !showAvatar && styles.aiBubbleAvatarHidden]}>
                {showAvatar && <Icon name="robot-excited" size={13} color={P.primary} />}
              </View>
            )}

            <View style={[styles.aiBubble, isUser ? styles.aiBubbleUser : styles.aiBubbleAI]}>
              <Text style={[styles.aiBubbleText, isUser && styles.aiBubbleTextUser]}>
                {item.content}
                {item.isStreaming && (
                  <View style={styles.typingDots}>
                    <View style={[styles.typingDot, styles.typingDot1]} />
                    <View style={[styles.typingDot, styles.typingDot2]} />
                    <View style={[styles.typingDot, styles.typingDot3]} />
                  </View>
                )}
              </Text>
              <View style={styles.aiBubbleFooter}>
                <Text style={[styles.aiTime, isUser && styles.aiTimeUser]}>{time}</Text>
                {isUser && <Icon name="check-all" size={11} color="rgba(255,255,255,0.5)" />}
              </View>
            </View>

            {/* User Avatar */}
            {isUser && (
              <View style={[styles.aiBubbleAvatar, styles.aiBubbleAvatarUser]}>
                <Icon name="account" size={13} color="#FFF" />
              </View>
            )}
          </View>
        );
      }}
      ListFooterComponent={
        showSuggestions ? (
          <View style={styles.aiSuggestions}>
            <Text style={styles.aiSugTitle}>✨ Try asking about</Text>
            <View style={styles.aiSugGrid}>
              {SUGGESTIONS.map((s, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.aiSugChip}
                  onPress={() => sendMessage(s)}
                  activeOpacity={0.7}>
                  <Text style={styles.aiSugIcon}>
                    {['🔍', '🧮', '📈', '🛡️', '🚢'][i]}
                  </Text>
                  <Text style={styles.aiSugText}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          <View style={{ height: 8 }} />
        )
      }
    />

    {/* ── Input Bar ── */}
    <View style={[styles.aiInputBar, { paddingBottom: Math.max(insets.bottom, 8) + 72 }]}>
      <View style={styles.aiInputRow}>
        <TouchableOpacity style={styles.aiInputEmoji}>
          <Text style={styles.aiEmojiText}>😊</Text>
        </TouchableOpacity>
        <TextInput
          value={inputText}
          onChangeText={setInputText}
          placeholder="Message EsyGlob AI..."
          placeholderTextColor={P.muted}
          style={styles.aiInput}
          multiline
          maxLength={500}
          returnKeyType="send"
          blurOnSubmit
          onSubmitEditing={() => sendMessage(inputText)}
        />
        <TouchableOpacity
          onPress={() => sendMessage(inputText)}
          disabled={!inputText.trim() || isStreaming}
          style={[styles.aiSendBtn, (!inputText.trim() || isStreaming) && styles.aiSendDisabled]}>
          <Icon name="send" size={16} color="#FFF" />
        </TouchableOpacity>
      </View>
    </View>
  </KeyboardAvoidingView>
);

  // ── Main Render ───────────────────────────────────────────────────────

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={P.surface} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.brandRow}>
            <View style={styles.brandIcon}><Icon name="shopping" size={18} color="#fff" /></View>
            <Text style={styles.brand}>EsyGlob</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable onPress={() => navigation.navigate('Notifications')} style={styles.iconBtn}><Icon name="bell-outline" size={20} color={P.text} /></Pressable>
            <Pressable onPress={() => navigation.navigate('Messages')} style={styles.iconBtn}><Icon name="message-text-outline" size={20} color={P.text} /></Pressable>
          </View>
        </View>

        {/* Tabs */}
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

        {/* Search Bar (non-AI tabs) */}
        {activeTab !== 'AI' && (
          <Pressable style={styles.searchBar} onPress={() => setShowSearch(true)}>
            <Icon name="magnify" size={18} color={P.muted} />
            <Text style={styles.searchPlaceholder}>Search anything...</Text>
            <View style={styles.searchCamera}><Icon name="camera-outline" size={16} color={P.primary} /></View>
          </Pressable>
        )}
      </View>

      {/* Content */}
      <View style={styles.content}>
        {activeTab === 'AI' && renderAI()}

        {activeTab === 'Products' && (
          <FlashList
            data={productFeed}
            keyExtractor={(item: Product) => getId(item) || Math.random().toString()}
            numColumns={2}
            contentContainerStyle={styles.gridContent}
            refreshControl={<RefreshControl refreshing={products.isRefetching && !products.isFetchingNextPage} onRefresh={() => products.refetch()} tintColor={P.primary} />}
            onEndReachedThreshold={0.4}
            onEndReached={() => { if (products.hasNextPage && !products.isFetchingNextPage) products.fetchNextPage(); }}
            ListHeaderComponent={
              <View>
                <ExploreShortcuts actions={EXPLORE_ACTIONS} onPress={openExplore} />
                <CategorySlider categories={categories} loading={categoriesQuery.isLoading} navigation={navigation} />
                <ProductSection title="Featured" products={featuredProducts.data?.products ?? []} loading={featuredProducts.isLoading} navigation={navigation} />
                <SectionHeader title="All Products" />
              </View>
            }
            ListEmptyComponent={products.isLoading ? <LoadingState label="Discovering..." /> : <EmptyState title="No products" />}
            ListFooterComponent={products.isFetchingNextPage ? <ActivityIndicator color={P.primary} style={styles.footerLoader} /> : null}
            renderItem={({ item }: { item: Product }) => <View style={styles.gridItem}><ProductCard product={item} variant="grid" /></View>}
          />
        )}

        {activeTab === 'Manufacturers' && (
          <FlashList
            data={manufacturers}
            keyExtractor={(item: SellerSummary) => getStableKey(item)}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={sellers.isRefetching} onRefresh={refreshAll} tintColor={P.primary} />}
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
  <View style={styles.exploreSection}>
    <FlatList
      data={actions}
      horizontal
      keyExtractor={item => item.title}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.exploreRail}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => onPress(item)}
          style={({ pressed }) => [
            styles.exploreCard,
            pressed && styles.exploreCardPressed
          ]}
        >
          {/* Left - Icon Box */}
          <View style={[styles.exploreIconBox, { backgroundColor: item.bg }]}>
            <Icon name={item.icon} size={20} color={item.color} />
          </View>
          {/* Right - Text (2 lines allowed) */}
          <Text style={styles.exploreCardText} numberOfLines={2}>
            {item.title}
          </Text>
        </Pressable>
      )}
    />
  </View>
));

const CategorySlider = React.memo(({ categories, loading, navigation }: any) => {
  if (loading && !categories.length) return <View style={styles.sectionWrap}><Text style={styles.sectionTitle}>Categories</Text><ScrollView horizontal contentContainerStyle={styles.categoryRail}>{[0,1,2,3,4,5].map(i => <View key={i} style={styles.categorySkeleton} />)}</ScrollView></View>;
  if (!categories.length) return null;
  return (
    <View style={styles.sectionWrap}>
      <View style={styles.sectionHeaderRow}><Text style={styles.sectionTitle}>Categories</Text><Pressable onPress={() => navigation.navigate('Categories')}><Text style={styles.seeAll}>See all</Text></Pressable></View>
      <FlatList data={categories.slice(0, 30)} horizontal initialNumToRender={10} maxToRenderPerBatch={8} windowSize={5} keyExtractor={(item: Category) => getStableKey(item)} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRail}
        renderItem={({ item }) => (
          <Pressable onPress={() => navigation.navigate('ProductListing', { category: item.name ?? item.slug, categoryName: item.name })} style={styles.categoryItem}>
            <View style={styles.categoryIconWrap}>{firstImage(item.image, item.icon) ? <RemoteImage uri={firstImage(item.image, item.icon)} width={64} height={64} style={styles.categoryIcon} /> : <Icon name="view-grid-outline" size={20} color={P.primary} />}</View>
            <Text style={styles.categoryName} numberOfLines={1}>{item.name ?? item.slug}</Text>
          </Pressable>
        )} />
    </View>
  );
});

const ProductSection = React.memo(({ title, products: items, loading, navigation }: any) => {
  if (loading && !items?.length) return <View style={styles.sectionWrap}><Text style={styles.sectionTitle}>{title}</Text><ScrollView horizontal contentContainerStyle={styles.productRail}>{[0,1,2,3].map(i => <View key={i} style={styles.productSkeleton} />)}</ScrollView></View>;
  if (!items?.length) return null;
  return (
    <View style={styles.sectionWrap}>
      <View style={styles.sectionHeaderRow}><Text style={styles.sectionTitle}>{title}</Text><Pressable onPress={() => navigation.navigate('ProductListing')}><Text style={styles.seeAll}>View all</Text></Pressable></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.productRail} decelerationRate="fast" snapToInterval={SCREEN_WIDTH * 0.45 + spacing.sm} snapToAlignment="start">
        {items.map((product: Product) => <ProductCard key={getId(product)} product={product} />)}
      </ScrollView>
    </View>
  );
});

// ─── SellerCard Component (Replace karo existing SellerCard se) ─────────────

const SellerCard = React.memo(({ seller, navigation }: any) => {
  const verified = seller.isVerified || seller.verificationStatus === 'verified';
  const title = seller.companyName ?? seller.businessName ?? seller.displayName ?? 'Supplier';
  const location = [seller.address?.city, seller.address?.country ?? seller.country]
    .filter(Boolean)
    .join(', ') || '🌍 Worldwide';
  const sellerId = getStableKey(seller);
  const sellerImage = firstImage(
    seller.logo,
    seller.companyLogo,
    seller.logoUrl,
    seller.factoryImages,
  );
  const previewImages: string[] = (seller.factoryImages ?? []).filter(Boolean).slice(0, 2);
  const rating = seller.rating ? Number(seller.rating).toFixed(1) : null;
  const trustScore = seller.trustScore ?? null;
  const categories = (seller.mainCategories ?? []).slice(0, 4);
  const description = seller.companyIntroduction ?? seller.description ?? '';
  const responseTime = seller.responseTime ?? seller.averageResponseTimeHours
    ? `${seller.averageResponseTimeHours}h response`
    : seller.responseRate
    ? `${seller.responseRate} rate`
    : null;
  const productCount = seller.productCount ?? seller.totalProducts ?? 0;
  const yearsInBusiness = seller.yearsInBusiness ?? seller.establishedYear 
    ? new Date().getFullYear() - (seller.establishedYear || new Date().getFullYear())
    : null;

  // Blue shades for card theming
  const blueShades = [
    { primary: '#1E40AF', light: '#EFF6FF', accent: '#3B82F6', dark: '#1E3A5F' },
    { primary: '#1D4ED8', light: '#EEF2FF', accent: '#4F46E5', dark: '#1E3A8A' },
    { primary: '#2563EB', light: '#F0F4FF', accent: '#60A5FA', dark: '#1E40AF' },
    { primary: '#3730A3', light: '#F5F3FF', accent: '#6366F1', dark: '#312E81' },
  ];
  const hash = sellerId.split('').reduce((s: number, c: string) => s + c.charCodeAt(0), 0);
  const theme = blueShades[hash % blueShades.length];

  return (
    <Pressable
      onPress={() => navigation.navigate('SellerDetails', { sellerId, sellerName: title })}
      style={({ pressed }) => [
        sellerStyles.card,
        pressed && sellerStyles.cardPressed,
      ]}
    >
      {/* ── Top Blue Header Section ── */}
      <View style={[sellerStyles.blueHeader, { backgroundColor: theme.primary }]}>
        {/* Background pattern dots */}
        <View style={sellerStyles.headerPattern}>
          <View style={[sellerStyles.patternDot, { backgroundColor: 'rgba(255,255,255,0.15)' }]} />
          <View style={[sellerStyles.patternDot, { backgroundColor: 'rgba(255,255,255,0.1)' }]} />
          <View style={[sellerStyles.patternDot, { backgroundColor: 'rgba(255,255,255,0.08)' }]} />
        </View>

        {/* Logo + Company Info */}
        <View style={sellerStyles.headerContent}>
          <View style={sellerStyles.logoContainer}>
            <RemoteImage
              uri={sellerImage}
              width={60}
              height={60}
              style={sellerStyles.logo}
              fallback={
                <View style={[sellerStyles.logoFallback, { backgroundColor: theme.dark }]}>
                  <Text style={sellerStyles.logoFallbackText}>
                    {title.slice(0, 2).toUpperCase()}
                  </Text>
                </View>
              }
            />
            {verified && (
              <View style={sellerStyles.verifiedBadge}>
                <Icon name="check-decagram" size={14} color="#10B981" />
              </View>
            )}
          </View>

          <View style={sellerStyles.companyInfo}>
            <Text style={sellerStyles.companyName} numberOfLines={2}>{title}</Text>
            <View style={sellerStyles.locationRow}>
              <Icon name="map-marker" size={11} color="rgba(255,255,255,0.8)" />
              <Text style={sellerStyles.locationText} numberOfLines={1}>{location}</Text>
            </View>
            
            {/* Quick badges */}
            <View style={sellerStyles.quickBadges}>
              {verified && (
                <View style={[sellerStyles.miniBadge, { backgroundColor: 'rgba(16,185,129,0.2)' }]}>
                  <Text style={[sellerStyles.miniBadgeText, { color: '#6EE7B7' }]}>✓ Verified</Text>
                </View>
              )}
              {seller.isTrustedSeller && (
                <View style={[sellerStyles.miniBadge, { backgroundColor: 'rgba(245,158,11,0.2)' }]}>
                  <Text style={[sellerStyles.miniBadgeText, { color: '#FBBF24' }]}>★ Trusted</Text>
                </View>
              )}
              {seller.factoryVerified && (
                <View style={[sellerStyles.miniBadge, { backgroundColor: 'rgba(167,139,250,0.2)' }]}>
                  <Text style={[sellerStyles.miniBadgeText, { color: '#C4B5FD' }]}>Factory</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </View>

      {/* ── Stats Strip ── */}
      <View style={sellerStyles.statsStrip}>
        <View style={sellerStyles.statItem}>
          <Icon name="star" size={15} color="#F59E0B" />
          <Text style={sellerStyles.statValue}>{rating || '—'}</Text>
          <Text style={sellerStyles.statLabel}>Rating</Text>
        </View>
        <View style={sellerStyles.statDivider} />
        <View style={sellerStyles.statItem}>
          <Icon name="shield-check" size={15} color="#10B981" />
          <Text style={sellerStyles.statValue}>{trustScore ? `${trustScore}%` : '—'}</Text>
          <Text style={sellerStyles.statLabel}>Trust</Text>
        </View>
        <View style={sellerStyles.statDivider} />
        <View style={sellerStyles.statItem}>
          <Icon name="package-variant" size={15} color="#3B82F6" />
          <Text style={sellerStyles.statValue}>{productCount || '—'}</Text>
          <Text style={sellerStyles.statLabel}>Products</Text>
        </View>
        <View style={sellerStyles.statDivider} />
        <View style={sellerStyles.statItem}>
          <Icon name="clock-outline" size={15} color="#8B5CF6" />
          <Text style={sellerStyles.statValue}>{yearsInBusiness ? `${yearsInBusiness}Y` : '—'}</Text>
          <Text style={sellerStyles.statLabel}>Experience</Text>
        </View>
      </View>

      {/* ── Key Info Points ── */}
      <View style={sellerStyles.infoGrid}>
        {/* Response Time */}
        <View style={sellerStyles.infoPoint}>
          <View style={[sellerStyles.infoIconCircle, { backgroundColor: '#EFF6FF' }]}>
            <Icon name="flash" size={13} color={theme.primary} />
          </View>
          <View style={sellerStyles.infoTextWrap}>
            <Text style={sellerStyles.infoLabel}>Response</Text>
            <Text style={sellerStyles.infoValue}>{responseTime || 'N/A'}</Text>
          </View>
        </View>

        {/* Employee Count */}
        <View style={sellerStyles.infoPoint}>
          <View style={[sellerStyles.infoIconCircle, { backgroundColor: '#F5F3FF' }]}>
            <Icon name="account-group" size={13} color="#7C3AED" />
          </View>
          <View style={sellerStyles.infoTextWrap}>
            <Text style={sellerStyles.infoLabel}>Team</Text>
            <Text style={sellerStyles.infoValue}>
              {seller.employeeCount ? `${seller.employeeCount}` : '—'}
            </Text>
          </View>
        </View>

        {/* Annual Revenue */}
        <View style={sellerStyles.infoPoint}>
          <View style={[sellerStyles.infoIconCircle, { backgroundColor: '#ECFDF5' }]}>
            <Icon name="chart-bar" size={13} color="#10B981" />
          </View>
          <View style={sellerStyles.infoTextWrap}>
            <Text style={sellerStyles.infoLabel}>Revenue</Text>
            <Text style={sellerStyles.infoValue}>
              {seller.annualRevenue || seller.revenue || '—'}
            </Text>
          </View>
        </View>

        {/* Export Percentage */}
        <View style={sellerStyles.infoPoint}>
          <View style={[sellerStyles.infoIconCircle, { backgroundColor: '#FFF7ED' }]}>
            <Icon name="earth" size={13} color="#F97316" />
          </View>
          <View style={sellerStyles.infoTextWrap}>
            <Text style={sellerStyles.infoLabel}>Export</Text>
            <Text style={sellerStyles.infoValue}>
              {seller.exportPercentage ? `${seller.exportPercentage}%` : '—'}
            </Text>
          </View>
        </View>
      </View>

      {/* ── About Section (if exists) ── */}
      {description ? (
        <View style={sellerStyles.aboutSection}>
          <Text style={sellerStyles.aboutText} numberOfLines={2}>
            {description}
          </Text>
        </View>
      ) : null}

      {/* ── Categories ── */}
      {categories.length > 0 && (
        <View style={sellerStyles.categoriesRow}>
          {categories.map((cat: string, i: number) => (
            <View key={i} style={[sellerStyles.categoryChip, { backgroundColor: theme.light }]}>
              <Text style={[sellerStyles.categoryText, { color: theme.primary }]}>{cat}</Text>
            </View>
          ))}
          {seller.mainCategories?.length > 4 && (
            <View style={[sellerStyles.categoryChip, { backgroundColor: '#F1F5F9' }]}>
              <Text style={[sellerStyles.categoryText, { color: '#64748B' }]}>
                +{seller.mainCategories.length - 4}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* ── Factory Images ── */}
      {previewImages.length > 0 && (
        <View style={sellerStyles.factoryRow}>
          {previewImages.map((uri: string, i: number) => (
            <View key={`${uri}-${i}`} style={sellerStyles.factoryImageWrap}>
              <RemoteImage
                uri={uri}
                width={200}
                height={120}
                style={sellerStyles.factoryImage}
              />
              {i === 0 && (
                <View style={sellerStyles.factoryTag}>
                  <Icon name="factory" size={8} color="#FFF" />
                  <Text style={sellerStyles.factoryTagText}>Factory</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      )}

      {/* ── Action Footer ── */}
      <View style={sellerStyles.footer}>
        <SavedHeartButton
          type="supplier"
          itemId={sellerId}
          target={seller}
          size={18}
          iconColor="#94A3B8"
          savedColor="#EF4444"
        />
        <Pressable 
          style={({ pressed }) => [
            sellerStyles.viewButton,
            { backgroundColor: theme.primary },
            pressed && { opacity: 0.9 },
          ]}
          onPress={() => navigation.navigate('SellerDetails', { sellerId, sellerName: title })}
        >
          <Text style={sellerStyles.viewButtonText}>View Profile</Text>
          <Icon name="arrow-right" size={14} color="#FFF" />
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
  screen: { flex: 1, backgroundColor: P.bg },
  header: { backgroundColor: P.surface, paddingTop: Platform.OS === 'ios' ? 56 : 44, paddingBottom: 8, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: P.faint, zIndex: 10 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: P.primary, alignItems: 'center', justifyContent: 'center' },
  brand: { fontSize: 18, fontWeight: '800', color: P.ink, letterSpacing: -0.4 },
  headerActions: { flexDirection: 'row', gap: 4 },
  iconBtn: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tabTrack: { flexDirection: 'row', backgroundColor: P.cardMuted, borderRadius: 14, padding: 4, position: 'relative', marginBottom: 10 },
  tabIndicator: { position: 'absolute', top: 4, bottom: 4, backgroundColor: P.surface, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  tabButton: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, zIndex: 1 },
  tabText: { fontSize: 13, fontWeight: '600', color: P.muted },
  tabTextActive: { color: P.primary, fontWeight: '700' },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: P.cardMuted, borderRadius: 24, paddingHorizontal: 16, height: 44, marginBottom: 4 },
  searchPlaceholder: { flex: 1, fontSize: 13, fontWeight: '500', color: P.muted },
  searchCamera: { width: 32, height: 32, borderRadius: 24, backgroundColor: P.primaryLight, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1 },
  gridContent: { paddingHorizontal: 8, paddingBottom: 100 },
  gridItem: { flex: 1, margin: 4, minWidth: 0 },
  listContent: { paddingHorizontal: 12, paddingBottom: 100 },
  footerLoader: { padding: 20 },
  
  // ── Explore Section (Horizontal Swipeable Rectangular Cards) ─────────
  exploreSection: {
    paddingVertical: 12,
  },
  exploreRail: {
    paddingHorizontal: 12,
    gap: 8,
  },
  exploreCard: {
    flexDirection: 'row', // Icon LEFT + Text RIGHT
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
    minWidth: 130, // Rectangular shape
  },
  exploreCardPressed: {
    backgroundColor: '#FAFAFA',
    borderColor: '#E5E5E5',
    transform: [{ scale: 0.97 }],
  },
  exploreIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10, // Slightly rounded corners
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  exploreCardText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1E293B',
    lineHeight: 14,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  
  sectionWrap: { paddingBottom: 16 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: P.ink, letterSpacing: -0.2, paddingHorizontal: 16, paddingBottom: 10 },
  seeAll: { fontSize: 12, fontWeight: '600', color: P.primary },
  categoryRail: { paddingHorizontal: 12, gap: 12 },
  categoryItem: { alignItems: 'center', width: 68 },
  categoryIconWrap: { width: 58, height: 58, borderRadius: 29, backgroundColor: P.primaryLight, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 6 },
  categoryIcon: { width: 58, height: 58, borderRadius: 29 },
  categoryName: { fontSize: 10, fontWeight: '600', color: P.text, textAlign: 'center', lineHeight: 12 },
  categorySkeleton: { width: 56, height: 56, borderRadius: 24, backgroundColor: P.cardMuted },
  productRail: { paddingHorizontal: 12, gap: 10 },
  productSkeleton: { width: SCREEN_WIDTH * 0.45, height: 200, borderRadius: 20, backgroundColor: P.cardMuted },
sellerCard: {
  backgroundColor: '#FFFFFF',
  borderRadius: 20,
  marginBottom: 12,
  marginHorizontal: 12,
  overflow: 'hidden',
  borderWidth: 1,
  borderColor: '#E8ECF2',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.04,
  shadowRadius: 12,
  elevation: 3,
},
pressed: {
  transform: [{ scale: 0.985 }],
},
accentLine: {
  height: 3,
  width: '100%',
  borderTopLeftRadius: 20,
  borderTopRightRadius: 20,
},

// ── Header ─────────────────────────────────────────────────────────────
// ─── Seller Card Styles ────────────────────────────────────────────────────

sellerCard: {
  backgroundColor: '#FFFFFF',
  borderRadius: 16,
  marginBottom: 14,
  marginHorizontal: 12,
  overflow: 'hidden',
  borderWidth: 1,
  borderColor: '#E2E8F0',
  shadowColor: '#1E40AF',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.08,
  shadowRadius: 16,
  elevation: 4,
},
cardPressed: {
  transform: [{ scale: 0.985 }],
  shadowOpacity: 0.04,
  elevation: 2,
},

// ── Blue Header Section ─────────────────────────────────────────────────
blueHeader: {
  padding: 14,
  position: 'relative',
  overflow: 'hidden',
},
headerPattern: {
  position: 'absolute',
  top: -20,
  right: -20,
  flexDirection: 'row',
  gap: 8,
  transform: [{ rotate: '15deg' }],
},
patternDot: {
  width: 60,
  height: 60,
  borderRadius: 30,
},
headerContent: {
  flexDirection: 'row',
  gap: 12,
},
logoContainer: {
  position: 'relative',
  flexShrink: 0,
},
logo: {
  width: 60,
  height: 60,
  borderRadius: 14,
  borderWidth: 2,
  borderColor: 'rgba(255,255,255,0.4)',
  backgroundColor: 'rgba(255,255,255,0.1)',
},
logoFallback: {
  width: 60,
  height: 60,
  borderRadius: 14,
  alignItems: 'center',
  justifyContent: 'center',
  borderWidth: 2,
  borderColor: 'rgba(255,255,255,0.4)',
},
logoFallbackText: {
  fontSize: 20,
  fontWeight: '800',
  color: '#FFF',
},
verifiedBadge: {
  position: 'absolute',
  bottom: -4,
  right: -4,
  width: 22,
  height: 22,
  borderRadius: 11,
  backgroundColor: '#FFF',
  alignItems: 'center',
  justifyContent: 'center',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.15,
  shadowRadius: 4,
  elevation: 3,
},
companyInfo: {
  flex: 1,
  justifyContent: 'center',
},
companyName: {
  fontSize: 15,
  fontWeight: '700',
  color: '#FFFFFF',
  lineHeight: 19,
  marginBottom: 3,
  letterSpacing: -0.2,
},
locationRow: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 3,
  marginBottom: 6,
},
locationText: {
  fontSize: 10,
  color: 'rgba(255,255,255,0.85)',
  fontWeight: '500',
  flex: 1,
},
quickBadges: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: 4,
},
miniBadge: {
  borderRadius: 4,
  paddingHorizontal: 6,
  paddingVertical: 2,
},
miniBadgeText: {
  fontSize: 8.5,
  fontWeight: '700',
},

// ── Stats Strip ─────────────────────────────────────────────────────────
statsStrip: {
  flexDirection: 'row',
  backgroundColor: '#F8FAFC',
  paddingVertical: 12,
  paddingHorizontal: 4,
  borderBottomWidth: 1,
  borderBottomColor: '#E2E8F0',
},
statItem: {
  flex: 1,
  alignItems: 'center',
  gap: 2,
},
statValue: {
  fontSize: 13,
  fontWeight: '700',
  color: '#0F172A',
},
statLabel: {
  fontSize: 8.5,
  fontWeight: '600',
  color: '#94A3B8',
  textTransform: 'uppercase',
  letterSpacing: 0.3,
},
statDivider: {
  width: 1,
  height: 30,
  backgroundColor: '#E2E8F0',
  alignSelf: 'center',
},

// ── Key Info Grid ───────────────────────────────────────────────────────
infoGrid: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  paddingHorizontal: 12,
  paddingVertical: 10,
  gap: 8,
},
infoPoint: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
  width: '47%',
  backgroundColor: '#F8FAFC',
  borderRadius: 10,
  padding: 8,
  borderWidth: 1,
  borderColor: '#F1F5F9',
},
infoIconCircle: {
  width: 30,
  height: 30,
  borderRadius: 8,
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
},
infoTextWrap: {
  flex: 1,
},
infoLabel: {
  fontSize: 9,
  fontWeight: '600',
  color: '#94A3B8',
  textTransform: 'uppercase',
  letterSpacing: 0.3,
  marginBottom: 1,
},
infoValue: {
  fontSize: 11,
  fontWeight: '700',
  color: '#0F172A',
},

// ── About Section ───────────────────────────────────────────────────────
aboutSection: {
  paddingHorizontal: 14,
  paddingBottom: 8,
},
aboutText: {
  fontSize: 11.5,
  color: '#64748B',
  lineHeight: 16,
  fontWeight: '500',
},

// ── Categories ─────────────────────────────────────────────────────────
categoriesRow: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: 5,
  paddingHorizontal: 14,
  paddingVertical: 8,
},
categoryChip: {
  borderRadius: 6,
  paddingHorizontal: 8,
  paddingVertical: 3,
},
categoryText: {
  fontSize: 9.5,
  fontWeight: '700',
},

// ── Factory Images ─────────────────────────────────────────────────────
factoryRow: {
  flexDirection: 'row',
  gap: 6,
  paddingHorizontal: 14,
  paddingBottom: 8,
},
factoryImageWrap: {
  flex: 1,
  position: 'relative',
  borderRadius: 10,
  overflow: 'hidden',
  backgroundColor: '#F1F5F9',
},
factoryImage: {
  width: '100%',
  height: 80,
  borderRadius: 10,
},
factoryTag: {
  position: 'absolute',
  top: 6,
  left: 6,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 3,
  backgroundColor: 'rgba(0,0,0,0.65)',
  borderRadius: 4,
  paddingHorizontal: 6,
  paddingVertical: 2,
},
factoryTagText: {
  fontSize: 7,
  fontWeight: '700',
  color: '#FFF',
},

// ── Footer ─────────────────────────────────────────────────────────────
footer: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingHorizontal: 14,
  paddingVertical: 10,
  backgroundColor: '#F8FAFC',
  borderTopWidth: 1,
  borderTopColor: '#E2E8F0',
},
viewButton: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 4,
  borderRadius: 8,
  paddingHorizontal: 14,
  paddingVertical: 8,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.1,
  shadowRadius: 4,
  elevation: 2,
},
viewButtonText: {
  fontSize: 11,
  fontWeight: '700',
  color: '#FFF',
},

// ── Categories ─────────────────────────────────────────────────────────
chipScroll: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: 6,
  paddingHorizontal: 14,
  marginTop: 10,
},
catChip: {
  borderRadius: 8,
  paddingHorizontal: 10,
  paddingVertical: 5,
  borderWidth: 1,
},
catChipText: {
  fontSize: 10,
  fontWeight: '600',
},

// ── Factory Images ─────────────────────────────────────────────────────
factoryStrip: {
  flexDirection: 'row',
  gap: 6,
  paddingHorizontal: 14,
  marginTop: 10,
},
factoryImgWrap: {
  flex: 1,
  position: 'relative',
  borderRadius: 10,
  overflow: 'hidden',
},
factoryLabel: {
  position: 'absolute',
  top: 6,
  left: 6,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 3,
  backgroundColor: 'rgba(0,0,0,0.6)',
  borderRadius: 5,
  paddingHorizontal: 6,
  paddingVertical: 3,
},
factoryLabelText: {
  fontSize: 8,
  fontWeight: '700',
  color: '#FFF',
},

// ── Footer ─────────────────────────────────────────────────────────────
cardFooter: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingHorizontal: 14,
  paddingVertical: 12,
  marginTop: 10,
  backgroundColor: '#F8FAFC',
  borderTopWidth: 1,
  borderTopColor: '#E8ECF2',
},
viewProfileBtn: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 4,
  backgroundColor: '#0F172A',
  borderRadius: 10,
  paddingHorizontal: 14,
  paddingVertical: 8,
},
viewProfileText: {
  fontSize: 11,
  fontWeight: '700',
  color: '#FFF',
},

  // ── AI Chat ───────────────────────────────────────────────────────────
aiScreen: {
  flex: 1,
  backgroundColor: '#F8FAFC',
},
aiHeader: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingHorizontal: 14,
  paddingVertical: 10,
  backgroundColor: '#FFF',
  borderBottomWidth: StyleSheet.hairlineWidth,
  borderBottomColor: '#F1F5F9',
},
aiHeaderLeft: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 10,
},
aiAvatar: {
  width: 36,
  height: 36,
  borderRadius: 12,
  backgroundColor: P.primary,
  alignItems: 'center',
  justifyContent: 'center',
  shadowColor: P.primary,
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.2,
  shadowRadius: 4,
  elevation: 3,
},
aiHeaderTitle: {
  fontSize: 15,
  fontWeight: '700',
  color: P.ink,
},
aiStatusRow: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 5,
  marginTop: 1,
},
aiStatusDot: {
  width: 6,
  height: 6,
  borderRadius: 3,
},
aiHeaderSub: {
  fontSize: 10,
  color: P.muted,
  fontWeight: '500',
},
aiResetBtn: {
  width: 32,
  height: 32,
  borderRadius: 10,
  backgroundColor: '#F1F5F9',
  alignItems: 'center',
  justifyContent: 'center',
},

// ── Messages ──────────────────────────────────────────────────────────
aiList: {
  paddingHorizontal: 10,
  paddingVertical: 8,
  flexGrow: 1,
},
aiRow: {
  flexDirection: 'row',
  marginBottom: 6,
  gap: 5,
  maxWidth: '85%',
},
aiRowUser: {
  alignSelf: 'flex-end',
  flexDirection: 'row-reverse',
},
aiRowAI: {
  alignSelf: 'flex-start',
},
aiBubbleAvatar: {
  width: 26,
  height: 26,
  borderRadius: 9,
  backgroundColor: '#EEF2FF',
  alignItems: 'center',
  justifyContent: 'center',
  marginTop: 2,
},
aiBubbleAvatarHidden: {
  opacity: 0,
},
aiBubbleAvatarUser: {
  backgroundColor: P.primary,
},

// ── Bubbles ───────────────────────────────────────────────────────────
aiBubble: {
  padding: 9,
  paddingHorizontal: 12,
  borderRadius: 12,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.03,
  shadowRadius: 2,
  elevation: 1,
},
aiBubbleAI: {
  backgroundColor: '#FFF',
  borderWidth: 1,
  borderColor: '#E8ECF4',
  borderBottomLeftRadius: 4,
},
aiBubbleUser: {
  backgroundColor: P.primary,
  borderBottomRightRadius: 4,
},
aiBubbleText: {
  fontSize: 13.5,
  lineHeight: 19,
  color: P.ink,
},
aiBubbleTextUser: {
  color: '#FFF',
},

// ── Typing Dots ───────────────────────────────────────────────────────
typingDots: {
  flexDirection: 'row',
  gap: 3,
  marginTop: 6,
},
typingDot: {
  width: 5,
  height: 5,
  borderRadius: 3,
  backgroundColor: '#CBD5E1',
},
typingDot1: {
  opacity: 0.4,
},
typingDot2: {
  opacity: 0.6,
},
typingDot3: {
  opacity: 0.8,
},

// ── Footer ────────────────────────────────────────────────────────────
aiBubbleFooter: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: 3,
  marginTop: 3,
},
aiTime: {
  fontSize: 8.5,
  fontWeight: '500',
  color: '#94A3B8',
},
aiTimeUser: {
  color: 'rgba(255,255,255,0.5)',
},

// ── Suggestions ───────────────────────────────────────────────────────
aiSuggestions: {
  paddingTop: 12,
  paddingBottom: 4,
},
aiSugTitle: {
  fontSize: 10,
  fontWeight: '600',
  color: P.muted,
  textAlign: 'center',
  textTransform: 'uppercase',
  letterSpacing: 1.2,
  marginBottom: 8,
},
aiSugGrid: {
  gap: 6,
  paddingHorizontal: 4,
},
aiSugChip: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
  backgroundColor: '#FFF',
  borderRadius: 10,
  padding: 11,
  paddingHorizontal: 13,
  borderWidth: 1,
  borderColor: '#E8ECF4',
},
aiSugIcon: {
  fontSize: 16,
},
aiSugText: {
  fontSize: 12.5,
  fontWeight: '500',
  color: P.text,
  flex: 1,
},

// ── Input Bar ─────────────────────────────────────────────────────────
aiInputBar: {
  paddingHorizontal: 8,
  paddingTop: 6,
  backgroundColor: '#FFF',
  borderTopWidth: StyleSheet.hairlineWidth,
  borderTopColor: '#F1F5F9',
},
aiInputRow: {
  flexDirection: 'row',
  alignItems: 'flex-end',
  gap: 6,
  backgroundColor: '#F1F5F9',
  borderRadius: 22,
  paddingHorizontal: 12,
  paddingVertical: 5,
  borderWidth: 1,
  borderColor: '#E2E8F0',
},
aiInputEmoji: {
  width: 30,
  height: 30,
  borderRadius: 15,
  alignItems: 'center',
  justifyContent: 'center',
},
aiEmojiText: {
  fontSize: 16,
},
aiInput: {
  flex: 1,
  fontSize: 13.5,
  color: P.ink,
  maxHeight: 100,
  paddingVertical: 3,
},
aiSendBtn: {
  width: 34,
  height: 34,
  borderRadius: 17,
  backgroundColor: P.primary,
  alignItems: 'center',
  justifyContent: 'center',
  shadowColor: P.primary,
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.25,
  shadowRadius: 3,
  elevation: 2,
},
aiSendDisabled: {
  opacity: 0.35,
  shadowOpacity: 0,
},
});

export default React.memo(HomeScreen);