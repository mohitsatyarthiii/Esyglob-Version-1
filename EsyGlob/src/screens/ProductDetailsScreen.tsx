import React, { useCallback, useMemo } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const PALETTE = {
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
  const [enquiryOpen, setEnquiryOpen] = React.useState(false);
  const [quantity, setQuantity] = React.useState('100');
  const [targetPrice, setTargetPrice] = React.useState('');
  const [destinationCountry, setDestinationCountry] = React.useState('India');
  const [additionalNotes, setAdditionalNotes] = React.useState('');
  const [selectedImage, setSelectedImage] = React.useState(0);
  const flatListRef = React.useRef<FlatList>(null);
  const fade = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [fade]);

  const productQuery = useQuery({
    queryKey: ['product', productId],
    queryFn: () => fetchProductDetails(productId),
    enabled: Boolean(productId),
    initialData: () => findCachedProduct(queryClient, productId),
    staleTime: 2 * 60_000,
  });

  const relatedQuery = useQuery({
    queryKey: ['related-products', (productQuery.data as any)?.category],
    queryFn: () =>
      fetchProducts({
        category: (productQuery.data as any)?.category,
        limit: 8,
      }),
    enabled: Boolean((productQuery.data as any)?.category),
  });

  const item = productQuery.data as Product | undefined;
  const sellerUserId = item ? resolveSellerUserId(item) : undefined;

  React.useEffect(() => {
    if (item && status === 'authenticated') {
      trackProductView(getId(item) ?? '').catch(() => {});
    }
  }, [item, status]);

  const seller: Record<string, any> | undefined =
    item && typeof item.sellerId === 'object'
      ? (item.sellerId as Record<string, any>)
      : item && typeof item.seller === 'object'
      ? (item.seller as Record<string, any>)
      : undefined;
  const sellerRouteId = seller?._id ?? seller?.id;
  const sellerVerified = item ? isVerifiedProduct(item) : false;

  const moqTiers: MoqTier[] = useMemo(() => {
    if (!item) return [];
    return buildMoqTiers(item);
  }, [item]);

  // ── Mutations ─────────────────────────────────────────────────────────

  const chatNow = useMutation({
    mutationFn: () => {
      if (!item) throw new Error('Product not loaded.');
      if (!sellerUserId) throw new Error('Seller not available.');
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
    mutationFn: () => {
      if (!item) throw new Error('Product not loaded.');
      if (!sellerUserId) throw new Error('Seller not available.');
      return createProductEnquiry({
        productId: getId(item) ?? '',
        sellerUserId,
        productName: item.name ?? item.title ?? 'Product',
        quantity: Number(quantity) || 100,
        unit: (item as any).unit ?? 'pcs',
        targetPrice: targetPrice ? Number(targetPrice) : undefined,
        destinationCountry: destinationCountry.trim() || 'India',
        additionalNotes: additionalNotes.trim() || undefined,
        attachments: [],
      });
    },
    onSuccess: (result: any) => {
      setEnquiryOpen(false);
      if (result.chat) {
        navigation.navigate('ChatDetails', {
          chatId: getId(result.chat),
          title: getSellerName(item!),
        });
      }
    },
    onError: (error: any) =>
      Alert.alert('Error', error?.message ?? 'Failed to send enquiry.'),
  });

  const handleGetSample = useCallback(() => {
    if (!item) return;
    navigation.navigate('OrderCheckout', {
      mode: 'sample',
      productId: getId(item),
    });
  }, [item, navigation]);

  // ── Loading / Error ──────────────────────────────────────────────────

  if (productQuery.isLoading) return <LoadingState label="Loading product..." />;
  if (productQuery.isError || !item)
    return (
      <ErrorState
        message={(productQuery.error as any)?.message ?? 'Product not found'}
        onRetry={() => productQuery.refetch()}
      />
    );

  const image = getProductImage(item);
  const gallery: string[] = Array.from(
    new Set([image, ...(item.images ?? [])].filter(Boolean)),
  ) as string[];
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
    Share.share({
      message: `${item.name ?? 'Product'}\n${formatProductPrice(item)}`,
    });

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={PALETTE.surface} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.xs }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.headerBtn}>
          <Icon name="arrow-left" size={20} color={PALETTE.ink} />
        </Pressable>
        <Text numberOfLines={1} style={styles.headerTitle}>
          {item.name ?? 'Product'}
        </Text>
        <Pressable onPress={shareProduct} hitSlop={10} style={styles.headerBtn}>
          <Icon name="share-variant-outline" size={18} color={PALETTE.ink} />
        </Pressable>
      </View>

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={{ opacity: fade }}>
        {/* Gallery */}
        <View style={styles.galleryWrap}>
          <FlatList
            ref={flatListRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            data={gallery}
            keyExtractor={(uri, i) => `${uri}-${i}`}
            onMomentumScrollEnd={onMainImageScroll}
            getItemLayout={(_, index) => ({
              length: SCREEN_WIDTH,
              offset: SCREEN_WIDTH * index,
              index,
            })}
            renderItem={({ item: uri }) => (
              <View style={styles.gallerySlide}>
                <RemoteImage
                  uri={uri}
                  width={SCREEN_WIDTH}
                  height={SCREEN_WIDTH}
                  style={styles.galleryImage}
                  fallback={<Icon name="image-off" size={40} color={PALETTE.muted} />}
                />
              </View>
            )}
          />
          <SavedHeartButton
            type="product"
            itemId={getId(item) ?? ''}
            target={item}
            size={18}
            style={styles.heartBtn}
            iconColor={PALETTE.ink}
          />
          {gallery.length > 1 && (
            <View style={styles.paginationRow}>
              {gallery.map((_, i) => (
                <Pressable
                  key={i}
                  onPress={() => scrollToImage(i)}
                  style={[styles.dot, selectedImage === i && styles.dotActive]}
                />
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

        {/* Product Info */}
        <View style={styles.card}>
          <Text style={styles.productName}>{item.name ?? item.title}</Text>
          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatProductPrice(item)}</Text>
            <Text style={styles.moq}>{formatMoq(item)}</Text>
          </View>
          <View style={styles.metaRow}>
            {item.averageRating ? (
              <Text style={styles.metaText}>
                ★ {Number(item.averageRating).toFixed(1)} ({item.reviewCount ?? 0})
              </Text>
            ) : null}
            {item.totalOrders ? (
              <Text style={styles.metaText}>· {item.totalOrders} orders</Text>
            ) : null}
            {location ? <Text style={styles.metaText}>· {location}</Text> : null}
          </View>
        </View>

        {/* MOQ Selector */}
        <MoqSelector
          tiers={moqTiers}
          selectedQty={Number(quantity)}
          onSelect={(qty: number) => setQuantity(String(qty))}
        />

        {/* Seller Card */}
        {seller && (
          <Pressable
            onPress={() =>
              sellerRouteId &&
              navigation.navigate('SellerDetails', {
                sellerId: sellerRouteId,
                sellerName: getSellerName(item),
              })
            }
            style={styles.sellerCard}>
            <View style={styles.sellerAvatar}>
              <Icon name="store-outline" size={22} color={PALETTE.primary} />
            </View>
            <View style={styles.sellerInfo}>
              <View style={styles.sellerNameRow}>
                <Text style={styles.sellerName}>{getSellerName(item)}</Text>
                {sellerVerified && (
                  <Icon name="check-decagram" size={14} color={PALETTE.emerald} />
                )}
              </View>
              <Text style={styles.sellerMeta}>
                {sellerVerified ? 'Verified Supplier' : 'Supplier'}
                {location ? ` · ${location}` : ''}
                {seller.rating ? ` · ★ ${Number(seller.rating).toFixed(1)}` : ''}
              </Text>
              {seller.productCount ? (
                <Text style={styles.sellerProducts}>
                  {seller.productCount} products
                </Text>
              ) : null}
            </View>
            <Icon name="chevron-right" size={20} color={PALETTE.muted} />
          </Pressable>
        )}

        {/* Trade Assurance */}
        <TradeAssurance />

        {/* Quick Info */}
        <QuickInfo />

        {/* Description */}
        {item.description ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>DETAILS</Text>
            <Text style={styles.descText}>{item.description}</Text>
          </View>
        ) : null}

        {/* Reviews */}
        <ReviewsPanel
          productId={getId(item) ?? ''}
          sellerId={sellerRouteId}
          showForm
          title="Reviews"
        />

        {/* Related Products */}
        {relatedProducts.length > 0 && (
          <View style={styles.relatedWrap}>
            <Text style={styles.relatedTitle}>Related Products</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.relatedList}>
              {relatedProducts.map((p: Product) => (
                <ProductCard key={getId(p)} product={p} />
              ))}
            </ScrollView>
          </View>
        )}

        <View style={{ height: 120 }} />
      </Animated.ScrollView>

      {/* Bottom Bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 8 }]}>
        {!isAuth ? (
          <Pressable
            onPress={() => navigation.navigate('Auth', { initialMode: 'login' })}
            style={styles.authBtn}>
            <Icon name="login" size={18} color="#FFF" />
            <Text style={styles.authBtnText}>Sign In to Continue</Text>
          </Pressable>
        ) : (
          <>
            <Pressable
              disabled={!canAct || chatNow.isPending}
              onPress={() => chatNow.mutate()}
              style={styles.outlineBtn}>
              <Icon name="message-text-outline" size={18} color={PALETTE.primary} />
              <Text style={styles.outlineBtnText}>Chat Now</Text>
            </Pressable>
            <Pressable
              disabled={!canAct}
              onPress={() => setEnquiryOpen(true)}
              style={styles.primaryBtn}>
              <Icon name="send-outline" size={18} color="#FFF" />
              <Text style={styles.primaryBtnText}>Send Enquiry</Text>
            </Pressable>
            <Pressable
              disabled={!canAct}
              onPress={handleGetSample}
              style={styles.sampleBtn}>
              <Icon name="package-variant-closed" size={18} color="#FFF" />
              <Text style={styles.sampleBtnText}>Get Sample</Text>
            </Pressable>
          </>
        )}
      </View>

      {/* Enquiry Modal */}
      <Modal
        visible={enquiryOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setEnquiryOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Send Enquiry</Text>
              <Pressable onPress={() => setEnquiryOpen(false)} hitSlop={10}>
                <Icon name="close" size={22} color={PALETTE.ink} />
              </Pressable>
            </View>
            <Text style={styles.modalProductName}>{item.name ?? item.title}</Text>
            <Field label="Quantity" value={quantity} onChangeText={setQuantity} keyboardType="numeric" />
            <Field label="Target Price (optional)" value={targetPrice} onChangeText={setTargetPrice} keyboardType="numeric" placeholder="Enter target price" />
            <Field label="Destination Country" value={destinationCountry} onChangeText={setDestinationCountry} />
            <Field label="Additional Notes" value={additionalNotes} onChangeText={setAdditionalNotes} multiline placeholder="Any special requirements..." />
            <Pressable
              disabled={sendEnquiry.isPending || !destinationCountry.trim()}
              onPress={() => sendEnquiry.mutate()}
              style={[styles.modalSubmit, (sendEnquiry.isPending || !destinationCountry.trim()) && styles.disabled]}>
              <Text style={styles.modalSubmitText}>
                {sendEnquiry.isPending ? 'Sending...' : 'Submit Enquiry'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Field Component ────────────────────────────────────────────────────────

function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={PALETTE.muted}
        style={[styles.fieldInput, props.multiline && styles.fieldTextarea]}
        {...props}
      />
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PALETTE.background },
  header: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: PALETTE.surface,
    paddingHorizontal: spacing.sm, paddingBottom: spacing.xs, gap: spacing.sm, ...shadow,
  },
  headerBtn: {
    width: 38, height: 38, borderRadius: radii.pill,
    backgroundColor: PALETTE.cardMuted, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { flex: 1, fontSize: 14, fontWeight: '800', color: PALETTE.ink, textAlign: 'center' },
  scrollContent: { paddingBottom: 20 },
  galleryWrap: { position: 'relative', backgroundColor: PALETTE.surface },
  gallerySlide: { width: SCREEN_WIDTH, height: SCREEN_WIDTH },
  galleryImage: { width: SCREEN_WIDTH, height: SCREEN_WIDTH, backgroundColor: PALETTE.cardMuted },
  heartBtn: {
    position: 'absolute', top: spacing.sm, right: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: radii.pill,
    width: 34, height: 34, alignItems: 'center', justifyContent: 'center',
  },
  paginationRow: {
    position: 'absolute', bottom: spacing.sm, alignSelf: 'center',
    flexDirection: 'row', gap: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  dotActive: { backgroundColor: PALETTE.primary, width: 8, height: 8, borderRadius: 4 },
  verifiedTag: {
    position: 'absolute', top: spacing.sm, left: spacing.sm,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,181,120,0.9)', borderRadius: radii.pill,
    paddingHorizontal: spacing.sm, paddingVertical: 3,
  },
  verifiedTagText: { color: '#FFF', fontSize: 10, fontWeight: '800' },
  card: {
    backgroundColor: PALETTE.surface, marginHorizontal: 8, marginTop: 8,
    padding: 14, borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9',
  },
  productName: { fontSize: 16, fontWeight: '700', color: PALETTE.ink, lineHeight: 22 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, marginTop: 6 },
  price: { fontSize: 22, fontWeight: '800', color: PALETTE.primaryDark },
  moq: { fontSize: 12, fontWeight: '600', color: PALETTE.muted },
  metaRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  metaText: { fontSize: 11, fontWeight: '600', color: PALETTE.muted },
  sectionTitle: { fontSize: 10, fontWeight: '800', color: PALETTE.muted, letterSpacing: 0.5, marginBottom: 8 },
  descText: { fontSize: 13, fontWeight: '400', color: PALETTE.text, lineHeight: 20 },
  sellerCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: PALETTE.surface,
    marginHorizontal: 8, marginTop: 8, padding: 14, borderRadius: 16,
    borderWidth: 1, borderColor: '#F1F5F9', gap: 12,
  },
  sellerAvatar: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: PALETTE.primaryLight, alignItems: 'center', justifyContent: 'center',
  },
  sellerInfo: { flex: 1 },
  sellerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sellerName: { fontSize: 14, fontWeight: '700', color: PALETTE.ink },
  sellerMeta: { fontSize: 11, color: PALETTE.muted, marginTop: 2 },
  sellerProducts: { fontSize: 10, color: PALETTE.primary, fontWeight: '600', marginTop: 2 },
  relatedWrap: { marginTop: 16, paddingLeft: 8 },
  relatedTitle: { fontSize: 13, fontWeight: '700', color: PALETTE.ink, marginBottom: 10 },
  relatedList: { gap: 10, paddingRight: 8 },
  bottomBar: {
    flexDirection: 'row', gap: 6, paddingHorizontal: 8, paddingTop: 8,
    backgroundColor: PALETTE.surface, borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: PALETTE.faint,
  },
  authBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: PALETTE.primary, borderRadius: 12, height: 48,
  },
  authBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  outlineBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, borderWidth: 1.5, borderColor: PALETTE.primary, borderRadius: 12, height: 48,
  },
  outlineBtnText: { fontSize: 13, fontWeight: '700', color: PALETTE.primary },
  primaryBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: PALETTE.primary, borderRadius: 12, height: 48,
  },
  primaryBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  sampleBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: PALETTE.primaryDark, borderRadius: 12, height: 48,
  },
  sampleBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: PALETTE.surface, borderTopLeftRadius: 20,
    borderTopRightRadius: 20, padding: 20,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  modalTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: PALETTE.ink },
  modalProductName: { fontSize: 13, fontWeight: '600', color: PALETTE.muted, marginBottom: 16 },
  fieldWrap: { marginBottom: 14 },
  fieldLabel: {
    fontSize: 10, fontWeight: '700', color: PALETTE.muted,
    marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  fieldInput: {
    backgroundColor: PALETTE.cardMuted, borderRadius: 10, height: 44,
    paddingHorizontal: 12, fontSize: 14, fontWeight: '600', color: PALETTE.ink,
    borderWidth: 1, borderColor: PALETTE.faint,
  },
  fieldTextarea: { height: 80, paddingTop: 12, textAlignVertical: 'top' },
  modalSubmit: {
    backgroundColor: PALETTE.primary, borderRadius: 12, height: 48,
    alignItems: 'center', justifyContent: 'center', marginTop: 4,
  },
  modalSubmitText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.45 },
});

export default React.memo(ProductDetailsScreen);