import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  View,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchProductDetails, fetchProducts } from '../api/products';
import {
  createProductEnquiry,
  startProductChat,
  trackProductView,
} from '../api/marketplace';
import { Product } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import ProductCard from '../components/ProductCard';
import RemoteImage from '../components/RemoteImage';
import ReviewsPanel from '../components/ReviewsPanel';
import SavedHeartButton from '../components/SavedHeartButton';
import TradeAssurance from '../components/TradeAssurance';
import QuickInfo from '../components/QuickInfo';
import MoqSelector from '../components/MoqSelector';
import EnquiryModal from '../components/EnquiryModal';
import { ErrorState, LoadingState } from '../components/StateViews';
import { radii, shadow, spacing } from '../theme';
import {
  formatMoq,
  formatProductPrice,
  getId,
  getProductImage,
  getProductLocation,
  getSellerName,
  isVerifiedProduct,
} from '../utils/format';

// ─── Types ──────────────────────────────────────────────────────────────────

type MoqTier = {
  minQty: number;
  maxQty: number | null;
  price: number;
  unit: string;
};

type Attachment = {
  uri: string;
  name: string;
  type: string;
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const P = {
  primary: '#FF6A00',
  primaryLight: '#FFF3E8',
  primaryDark: '#E05500',
  emerald: '#00B578',
  ink: '#1A1A1A',
  text: '#333333',
  muted: '#8C8C8C',
  faint: '#E8E8E8',
  surface: '#FFFFFF',
  background: '#F5F5F5',
  cardMuted: '#F8F9FB',
} as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

function resolveSellerUserId(item: Product): string | undefined {
  const seller = (
    (typeof item.sellerId === 'object' && item.sellerId ? item.sellerId : null) ??
    (typeof item.seller === 'object' && item.seller ? item.seller : null)
  ) as Record<string, any> | null;
  if (!seller) return undefined;
  if (typeof seller.userId === 'string') return seller.userId;
  if (typeof seller.userId === 'object' && seller.userId) {
    return (seller.userId as Record<string, any>)._id ?? (seller.userId as Record<string, any>).id;
  }
  return seller._id ?? seller.id;
}

function buildMoqTiers(item: Product): MoqTier[] {
  const tiers: MoqTier[] = [];
  if (item.priceTiers && item.priceTiers.length > 0) {
    for (const t of item.priceTiers) {
      tiers.push({
        minQty: Number((t as any).minQuantity ?? (t as any).minimumQuantity ?? 1),
        maxQty: (t as any).maxQuantity != null ? Number((t as any).maxQuantity) : null,
        price: Number((t as any).price ?? (t as any).unitPrice ?? item.price ?? 0),
        unit: (t as any).unit ?? (item as any).unit ?? 'pcs',
      });
    }
  }
  if (tiers.length === 0) {
    tiers.push({
      minQty: Number((item as any).minimumOrderQuantity ?? item.moq ?? 100),
      maxQty: null,
      price: Number(item.price ?? 0),
      unit: (item as any).unit ?? 'pcs',
    });
  }
  return tiers;
}

function findCachedProduct(queryClient: any, productId: string): Product | undefined {
  const groups = [
    queryClient.getQueriesData({ queryKey: ['home'] }),
    queryClient.getQueriesData({ queryKey: ['home-products-feed'] }),
    queryClient.getQueriesData({ queryKey: ['products'] }),
    queryClient.getQueriesData({ queryKey: ['related-products'] }),
  ];
  for (const queries of groups) {
    for (const [, data] of queries) {
      const found = scanForProduct(data, productId);
      if (found) return found;
    }
  }
  return undefined;
}

function scanForProduct(value: unknown, productId: string, depth = 0): Product | undefined {
  if (!value || depth > 5) return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = scanForProduct(item, productId, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if ((record._id === productId || record.id === productId) && (record.name || record.title)) {
    return record as unknown as Product;
  }
  for (const key of ['product', 'products', 'featuredProducts', 'latestProducts', 'trendingProducts', 'recommendedProducts', 'pages']) {
    const found = scanForProduct(record[key], productId, depth + 1);
    if (found) return found;
  }
  return undefined;
}

// ─── Component ──────────────────────────────────────────────────────────────

function ProductDetailsScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { status } = useAuth();
  const { productId } = route.params as { productId: string };
  const queryClient = useQueryClient();

  // ── State ──────────────────────────────────────────────────────────────

  const [enquiryOpen, setEnquiryOpen] = useState(false);
  const [quantity, setQuantity] = useState('100');
  const [targetPrice, setTargetPrice] = useState('');
  const [destinationCountry, setDestinationCountry] = useState('India');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [selectedImage, setSelectedImage] = useState(0);
  const flatListRef = React.useRef<FlatList>(null);
  const fade = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [fade]);

  // ── Queries ────────────────────────────────────────────────────────────

  const productQuery = useQuery({
    queryKey: ['product', productId],
    queryFn: () => fetchProductDetails(productId),
    enabled: Boolean(productId),
    initialData: () => findCachedProduct(queryClient, productId),
    staleTime: 2 * 60_000,
  });

  const relatedQuery = useQuery({
    queryKey: ['related-products', (productQuery.data as any)?.category],
    queryFn: () => fetchProducts({ category: (productQuery.data as any)?.category, limit: 8 }),
    enabled: Boolean((productQuery.data as any)?.category),
  });

  const item = productQuery.data as Product | undefined;
  const sellerUserId = item ? resolveSellerUserId(item) : undefined;

  // ── Track view ─────────────────────────────────────────────────────────

  React.useEffect(() => {
    if (item && status === 'authenticated') {
      trackProductView(getId(item) ?? '').catch(() => {});
    }
  }, [item, status]);

  // ── Derived data ───────────────────────────────────────────────────────

  const seller: Record<string, any> | undefined =
    item && typeof item.sellerId === 'object'
      ? (item.sellerId as Record<string, any>)
      : undefined;
  const sellerRouteId = seller?._id ?? seller?.id;
  const sellerVerified = item ? isVerifiedProduct(item) : false;

  const canStartOrder = Boolean(
    seller?.isTrustedSeller &&
    seller?.trustedSellerBadge === 'active' &&
    (item as any)?.directOrderEnabled &&
    seller?.isActive !== false &&
    seller?.isSuspended !== true
  );

  const moqTiers: MoqTier[] = useMemo(() => {
    if (!item) return [];
    return buildMoqTiers(item);
  }, [item]);

  // ── Mutations ──────────────────────────────────────────────────────────

  const chatNow = useMutation({
    mutationFn: async () => {
      if (!item) throw new Error('Product not loaded.');
      if (!sellerUserId) throw new Error('Seller contact not available.');
      return startProductChat({
        otherUserId: sellerUserId,
        productId: getId(item) ?? '',
        role: 'buyer',
        enquiry: false,
      });
    },
    onSuccess: (result: any) => {
      if (result.chat) {
        navigation.navigate('ChatDetails', {
          chatId: getId(result.chat),
          title: getSellerName(item!),
        });
      }
    },
    onError: (error: any) =>
      Alert.alert('Error', error?.message ?? 'Failed to start chat.'),
  });

  const sendEnquiry = useMutation({
    mutationFn: async () => {
      if (!item) throw new Error('Product not loaded.');
      if (!sellerUserId) throw new Error('Seller information missing.');
      return createProductEnquiry({
        productId: getId(item) ?? '',
        sellerUserId,
        productName: item.name ?? item.title ?? 'Product',
        quantity: Number(quantity) || 100,
        unit: (item as any).unit ?? 'pcs',
        targetPrice: targetPrice ? Number(targetPrice) : undefined,
        destinationCountry: destinationCountry.trim() || 'India',
        additionalNotes: additionalNotes.trim() || undefined,
        attachments: attachments.map(a => ({
          filename: a.name,
          type: a.type,
        })),
      });
    },
    onSuccess: (result: any) => {
      setEnquiryOpen(false);
      setAttachments([]);
      if (result.chat) {
        navigation.navigate('ChatDetails', {
          chatId: getId(result.chat),
          title: getSellerName(item!),
        });
      } else if (result.rfq) {
        Alert.alert('✓ Enquiry Sent', 'The supplier will respond shortly.');
      }
    },
    onError: (error: any) =>
      Alert.alert('Enquiry Failed', error?.message ?? 'Unable to send enquiry.'),
  });

  // ── Navigation ─────────────────────────────────────────────────────────

  const goToStore = useCallback(() => {
    if (!sellerRouteId || !item) return;
    navigation.navigate('SellerDetails', {
      sellerId: sellerRouteId,
      sellerName: getSellerName(item),
    });
  }, [sellerRouteId, item, navigation]);

  const goToStartOrder = useCallback(() => {
    if (!item) return;
    navigation.navigate('OrderCheckout', {
      mode: 'trade',
      productId: getId(item),
    });
  }, [item, navigation]);

  // ── Loading / Error ────────────────────────────────────────────────────

  if (productQuery.isLoading) return <LoadingState label="Loading product..." />;
  if (productQuery.isError || !item)
    return (
      <ErrorState
        message={(productQuery.error as any)?.message ?? 'Product not found'}
        onRetry={() => productQuery.refetch()}
      />
    );

  const image = getProductImage(item);
  const gallery: string[] = Array.from(new Set([image, ...(item.images ?? [])].filter(Boolean))) as string[];
  const location = getProductLocation(item);
  const relatedProducts: Product[] = (relatedQuery.data?.products ?? [])
    .filter((p: Product) => getId(p) !== getId(item))
    .slice(0, 6);
  const isAuth = status === 'authenticated';
  const canAct = isAuth && Boolean(sellerUserId);

  const onMainImageScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (index !== selectedImage) setSelectedImage(index);
  };

  const scrollToImage = (index: number) => {
    flatListRef.current?.scrollToIndex({ index, animated: true });
    setSelectedImage(index);
  };

  const shareProduct = () =>
    Share.share({ message: `${item.name ?? 'Product'}\n${formatProductPrice(item)}` });

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={P.surface} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.xs }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.headerBtn}>
          <Icon name="arrow-left" size={20} color={P.ink} />
        </Pressable>
        <Text numberOfLines={1} style={styles.headerTitle}>{item.name ?? 'Product'}</Text>
        <Pressable onPress={shareProduct} hitSlop={10} style={styles.headerBtn}>
          <Icon name="share-variant-outline" size={18} color={P.ink} />
        </Pressable>
      </View>

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={{ opacity: fade }}>

        {/* ── 1. Gallery ── */}
        <View style={styles.galleryWrap}>
          <FlatList
            ref={flatListRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            data={gallery}
            keyExtractor={(uri, i) => `${uri}-${i}`}
            onMomentumScrollEnd={onMainImageScroll}
            getItemLayout={(_, index) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * index, index })}
            renderItem={({ item: uri }) => (
              <View style={styles.gallerySlide}>
                <RemoteImage uri={uri} width={SCREEN_WIDTH} height={SCREEN_WIDTH} style={styles.galleryImage} fallback={<Icon name="image-off" size={40} color={P.muted} />} />
              </View>
            )}
          />
          <SavedHeartButton type="product" itemId={getId(item) ?? ''} target={item} size={18} style={styles.heartBtn} iconColor={P.ink} />
          {gallery.length > 1 && (
            <View style={styles.paginationRow}>
              {gallery.map((_, i) => (
                <Pressable key={i} onPress={() => scrollToImage(i)} style={[styles.dot, selectedImage === i && styles.dotActive]} />
              ))}
            </View>
          )}
          {sellerVerified && (
            <View style={styles.verifiedTag}>
              <Icon name="check-decagram" size={12} color="#FFF" />
              <Text style={styles.verifiedTagText}>Verified</Text>
            </View>
          )}
        </View>

        {/* ── 2. Product Title + Rating ── */}
        <View style={styles.card}>
          <Text style={styles.productName}>{item.name ?? item.title}</Text>
          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatProductPrice(item)}</Text>
            <Text style={styles.moq}>{formatMoq(item)}</Text>
          </View>
          <View style={styles.metaRow}>
            {item.averageRating ? <Text style={styles.metaText}>★ {Number(item.averageRating).toFixed(1)} ({item.reviewCount ?? 0})</Text> : null}
            {item.totalOrders ? <Text style={styles.metaText}>· {item.totalOrders} orders</Text> : null}
            {location ? <Text style={styles.metaText}>· {location}</Text> : null}
          </View>
        </View>

        {/* ── 3. MOQ Selector ── */}
        <MoqSelector tiers={moqTiers} selectedQty={Number(quantity)} onSelect={(qty: number) => setQuantity(String(qty))} />

        {/* ── 4. Variants (if any) ── */}
        {(item as any).variants?.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>VARIANTS</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.variantRow}>
              {((item as any).variants as any[]).map((v: any, i: number) => (
                <View key={i} style={styles.variantChip}>
                  <Text style={styles.variantText}>{v.name ?? v.label ?? `Option ${i + 1}`}</Text>
                  {v.price && <Text style={styles.variantPrice}>+{formatProductPrice(v)}</Text>}
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── 5. Seller Card ── */}
        {seller && (
          <Pressable onPress={goToStore} style={styles.sellerCard}>
            <View style={styles.sellerAvatar}>
              <Icon name="store-outline" size={22} color={P.primary} />
            </View>
            <View style={styles.sellerInfo}>
              <View style={styles.sellerNameRow}>
                <Text style={styles.sellerName}>{getSellerName(item)}</Text>
                {sellerVerified && <Icon name="check-decagram" size={14} color={P.emerald} />}
              </View>
              <Text style={styles.sellerMeta}>
                {sellerVerified ? 'Verified Supplier' : 'Supplier'}
                {location ? ` · ${location}` : ''}
                {seller.rating ? ` · ★ ${Number(seller.rating).toFixed(1)}` : ''}
              </Text>
              {seller.productCount ? <Text style={styles.sellerProducts}>{seller.productCount} products</Text> : null}
            </View>
            <Icon name="chevron-right" size={20} color={P.muted} />
          </Pressable>
        )}

        {/* ── 6. Trade Assurance ── */}
        <TradeAssurance />

        {/* ── 7. Quick Info ── */}
        <QuickInfo />

        {/* ── 8. Description ── */}
        {item.description ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>DETAILS</Text>
            <Text style={styles.descText}>{item.description}</Text>
          </View>
        ) : null}

        {/* ── 9. Reviews ── */}
        <ReviewsPanel productId={getId(item) ?? ''} sellerId={sellerRouteId} showForm title="Reviews" />

        {/* ── 10. Related Products ── */}
        {relatedProducts.length > 0 && (
          <View style={styles.relatedWrap}>
            <Text style={styles.relatedTitle}>Related Products</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.relatedList}>
              {relatedProducts.map((p: Product) => <ProductCard key={getId(p)} product={p} />)}
            </ScrollView>
          </View>
        )}

        <View style={{ height: 120 }} />
      </Animated.ScrollView>

      {/* ── BOTTOM BAR ── */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 8 }]}>
        {!isAuth ? (
          <Pressable onPress={() => navigation.navigate('Auth', { initialMode: 'login' })} style={styles.authBtn}>
            <Icon name="login" size={18} color="#FFF" />
            <Text style={styles.authBtnText}>Sign In to Continue</Text>
          </Pressable>
        ) : (
          <>
            {/* Store */}
            <Pressable disabled={!sellerRouteId} onPress={goToStore} style={styles.storeBtn}>
              <Icon name="store-outline" size={20} color={P.ink} />
            </Pressable>

            {/* Start Order (conditional) */}
            {canStartOrder && (
              <Pressable onPress={goToStartOrder} style={styles.startOrderBtn}>
                <Icon name="rocket-launch" size={16} color="#FFF" />
                <Text style={styles.startOrderBtnText}>Start Order</Text>
              </Pressable>
            )}

            {/* Chat Now */}
            <Pressable disabled={!canAct || chatNow.isPending} onPress={() => chatNow.mutate()} style={styles.outlineBtn}>
              <Icon name="message-text-outline" size={18} color={P.primary} />
              <Text style={styles.outlineBtnText}>{chatNow.isPending ? '...' : 'Chat Now'}</Text>
            </Pressable>

            {/* Send Enquiry */}
            <Pressable disabled={!canAct} onPress={() => setEnquiryOpen(true)} style={styles.primaryBtn}>
              <Icon name="send-outline" size={18} color="#FFF" />
              <Text style={styles.primaryBtnText}>Send Enquiry</Text>
            </Pressable>
          </>
        )}
      </View>

      {/* ── Enquiry Modal ── */}
      <EnquiryModal
        visible={enquiryOpen}
        productName={item.name ?? item.title ?? 'Product'}
        defaultQuantity={quantity}
        defaultUnit={(item as any).unit ?? 'pcs'}
        pending={sendEnquiry.isPending}
        quantity={quantity}
        targetPrice={targetPrice}
        destinationCountry={destinationCountry}
        additionalNotes={additionalNotes}
        attachments={attachments}
        onQuantityChange={setQuantity}
        onTargetPriceChange={setTargetPrice}
        onDestinationChange={setDestinationCountry}
        onNotesChange={setAdditionalNotes}
        onAttachmentsChange={setAttachments}
        onClose={() => setEnquiryOpen(false)}
        onSubmit={() => sendEnquiry.mutate()}
      />
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: P.background },
  header: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: P.surface,
    paddingHorizontal: spacing.sm, paddingBottom: spacing.xs, gap: spacing.sm, ...shadow,
  },
  headerBtn: {
    width: 38, height: 38, borderRadius: radii.pill,
    backgroundColor: P.cardMuted, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { flex: 1, fontSize: 14, fontWeight: '800', color: P.ink, textAlign: 'center' },
  scrollContent: { paddingBottom: 20 },
  galleryWrap: { position: 'relative', backgroundColor: P.surface },
  gallerySlide: { width: SCREEN_WIDTH, height: SCREEN_WIDTH },
  galleryImage: { width: SCREEN_WIDTH, height: SCREEN_WIDTH, backgroundColor: P.cardMuted },
  heartBtn: {
    position: 'absolute', top: spacing.sm, right: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: radii.pill,
    width: 34, height: 34, alignItems: 'center', justifyContent: 'center',
  },
  paginationRow: { position: 'absolute', bottom: spacing.sm, alignSelf: 'center', flexDirection: 'row', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  dotActive: { backgroundColor: P.primary, width: 8, height: 8, borderRadius: 4 },
  verifiedTag: {
    position: 'absolute', top: spacing.sm, left: spacing.sm,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,181,120,0.9)', borderRadius: radii.pill,
    paddingHorizontal: spacing.sm, paddingVertical: 3,
  },
  verifiedTagText: { color: '#FFF', fontSize: 10, fontWeight: '800' },
  card: {
    backgroundColor: P.surface, marginHorizontal: 8, marginTop: 8,
    padding: 14, borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9',
  },
  productName: { fontSize: 16, fontWeight: '700', color: P.ink, lineHeight: 22 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, marginTop: 6 },
  price: { fontSize: 22, fontWeight: '800', color: P.primaryDark },
  moq: { fontSize: 12, fontWeight: '600', color: P.muted },
  metaRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  metaText: { fontSize: 11, fontWeight: '600', color: P.muted },
  sectionTitle: { fontSize: 10, fontWeight: '800', color: P.muted, letterSpacing: 0.5, marginBottom: 8 },
  descText: { fontSize: 13, fontWeight: '400', color: P.text, lineHeight: 20 },
  variantRow: { gap: 8 },
  variantChip: {
    backgroundColor: P.cardMuted, borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: P.faint, minWidth: 100, alignItems: 'center',
  },
  variantText: { fontSize: 12, fontWeight: '600', color: P.text },
  variantPrice: { fontSize: 11, fontWeight: '700', color: P.primary, marginTop: 2 },
  sellerCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: P.surface,
    marginHorizontal: 8, marginTop: 8, padding: 14, borderRadius: 16,
    borderWidth: 1, borderColor: '#F1F5F9', gap: 12,
  },
  sellerAvatar: { width: 44, height: 44, borderRadius: 12, backgroundColor: P.primaryLight, alignItems: 'center', justifyContent: 'center' },
  sellerInfo: { flex: 1 },
  sellerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sellerName: { fontSize: 14, fontWeight: '700', color: P.ink },
  sellerMeta: { fontSize: 11, color: P.muted, marginTop: 2 },
  sellerProducts: { fontSize: 10, color: P.primary, fontWeight: '600', marginTop: 2 },
  relatedWrap: { marginTop: 16, paddingLeft: 8 },
  relatedTitle: { fontSize: 13, fontWeight: '700', color: P.ink, marginBottom: 10 },
  relatedList: { gap: 10, paddingRight: 8 },

  // Bottom Bar
  bottomBar: {
    flexDirection: 'row', gap: 6, paddingHorizontal: 8, paddingTop: 8,
    backgroundColor: P.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: P.faint, alignItems: 'center',
  },
  authBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: P.primary, borderRadius: 12, height: 44 },
  authBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  storeBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: P.cardMuted, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: P.faint },
  startOrderBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: P.ink, borderRadius: 12, paddingHorizontal: 14, height: 40 },
  startOrderBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  outlineBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1.5, borderColor: P.primary, borderRadius: 12, height: 40 },
  outlineBtnText: { fontSize: 12, fontWeight: '700', color: P.primary },
  primaryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: P.primary, borderRadius: 12, height: 40 },
  primaryBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
});

export default React.memo(ProductDetailsScreen);