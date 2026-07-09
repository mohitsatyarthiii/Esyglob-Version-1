import React from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Share,
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
import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchProductDetails, fetchProducts } from '../api/products';
import { createProductEnquiry, startProductChat } from '../api/marketplace';
import { Product } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import ProductCard from '../components/ProductCard';
import RemoteImage from '../components/RemoteImage';
import ReviewsPanel from '../components/ReviewsPanel';
import SavedHeartButton from '../components/SavedHeartButton';
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
  cardMuted: '#F8F9FB',
} as const;

function ProductDetailsScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { status } = useAuth();
  const { productId } = route.params as { productId: string };
  const queryClient = useQueryClient();
  const [enquiryOpen, setEnquiryOpen] = React.useState(false);
  const [quantity, setQuantity] = React.useState('');
  const [targetPrice, setTargetPrice] = React.useState('');
  const [destinationCountry, setDestinationCountry] = React.useState('India');
  const [additionalNotes, setAdditionalNotes] = React.useState('');
  const [selectedImage, setSelectedImage] = React.useState(0);
  const flatListRef = React.useRef<FlatList>(null);
  const fade = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, []);

  const product = useQuery({
    queryKey: ['product', productId],
    queryFn: () => fetchProductDetails(productId),
    enabled: Boolean(productId),
    initialData: () => findCachedProduct(queryClient, productId),
    staleTime: 2 * 60_000,
  });

  const related = useQuery({
    queryKey: ['related-products', product.data?.category, product.data?.subcategory],
    queryFn: () => fetchProducts({ category: product.data?.category, subcategory: product.data?.subcategory, limit: 8 }),
    enabled: Boolean(product.data?.category || product.data?.subcategory),
  });

  const item = product.data;

  const seller = item && typeof item.sellerId === 'object' ? item.sellerId as any : item && typeof item.seller === 'object' ? item.seller as any : undefined;
  const sellerRouteId = seller?._id ?? seller?.id;
  const sellerUser = typeof seller?.userId === 'object' ? seller.userId : undefined;
  const sellerUserId = typeof seller?.userId === 'string' ? seller.userId : sellerUser?._id ?? sellerUser?.id ?? (item as any)?.sellerUserId;

  const chatNow = useMutation({
    mutationFn: () => {
      if (!item || !sellerUserId) throw new Error('Cannot start chat.');
      return startProductChat({ otherUserId: sellerUserId, productId: getId(item), role: 'buyer', enquiry: false });
    },
    onSuccess: (result) => {
      if (result.chat) navigation.navigate('ChatDetails', { chatId: getId(result.chat), title: getSellerName(item!) });
    },
    onError: (error: any) => Alert.alert('Error', error?.message ?? 'Failed to open chat'),
  });

  const sendEnquiry = useMutation({
    mutationFn: () => {
      if (!item || !sellerUserId) throw new Error('Cannot send enquiry.');
      return createProductEnquiry({
        productId: getId(item), sellerUserId, productName: item.name ?? item.title,
        quantity: Number(quantity) || Number(item.minimumOrderQuantity ?? 100),
        unit: (item as any).unit ?? 'pcs', targetPrice: targetPrice ? Number(targetPrice) : undefined,
        destinationCountry, additionalNotes, attachments: [],
      });
    },
    onSuccess: (result) => {
      setEnquiryOpen(false);
      if (result.chat) navigation.navigate('ChatDetails', { chatId: getId(result.chat), title: getSellerName(item!) });
    },
    onError: (error: any) => Alert.alert('Error', error?.message ?? 'Failed to send enquiry'),
  });

  if (product.isLoading) return <LoadingState label="Loading product" />;
  if (product.isError || !item) return <ErrorState message={(product.error as any)?.message ?? 'Not found'} onRetry={() => product.refetch()} />;

  const image = getProductImage(item);
  const gallery = Array.from(new Set([image, ...(item.images ?? [])].filter(Boolean))) as string[];
  const sellerVerified = isVerifiedProduct(item);
  const location = getProductLocation(item);
  const directOrderEnabled = Boolean((item.directOrderEnabled || item.orderEnabled) && (seller?.trustedSeller || seller?.isTrusted || sellerVerified));
  const relatedProducts = (related.data?.products ?? []).filter(next => getId(next) !== getId(item)).slice(0, 6);

  const onMainImageScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (index !== selectedImage) setSelectedImage(index);
  };

  const scrollToImage = (index: number) => {
    flatListRef.current?.scrollToIndex({ index, animated: true });
    setSelectedImage(index);
  };

  const shareProduct = () => Share.share({ message: `${item.name ?? 'Product'}\n${formatProductPrice(item)}` });

  const isAuth = status === 'authenticated';
  const canChat = isAuth && Boolean(sellerUserId);
  const canEnquire = isAuth && Boolean(sellerUserId);

  React.useEffect(() => {
    if (!quantity && item) {
      setQuantity(String(item.minimumOrderQuantity ?? item.moq ?? 100));
    }
  }, [item]);

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.xs }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.headerBtn}>
          <Icon name="arrow-left" size={20} color={PALETTE.ink} />
        </Pressable>
        <Text numberOfLines={1} style={styles.headerTitle}>{item.name ?? item.title ?? 'Product'}</Text>
        <Pressable onPress={shareProduct} hitSlop={10} style={styles.headerBtn}>
          <Icon name="share-variant-outline" size={18} color={PALETTE.ink} />
        </Pressable>
      </View>

      <Animated.ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} style={{ opacity: fade }}>
        {/* Swipeable Gallery */}
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
              <Pressable onPress={() => {/* optional fullscreen later */}} style={styles.gallerySlide}>
                <RemoteImage uri={uri} width={SCREEN_WIDTH} height={SCREEN_WIDTH} style={styles.galleryImage} fallback={<Icon name="image-off" size={40} color={PALETTE.muted} />} />
              </Pressable>
            )}
          />
          <SavedHeartButton type="product" itemId={getId(item)} target={item} size={18} style={styles.heartBtn} iconColor={PALETTE.ink} />
          {gallery.length > 1 && (
            <View style={styles.paginationRow}>
              {gallery.map((_, i) => (
                <Pressable key={i} onPress={() => scrollToImage(i)} style={[styles.dot, selectedImage === i && styles.dotActive]} />
              ))}
            </View>
          )}
          {sellerVerified && <View style={styles.verifiedTag}><Icon name="check-decagram" size={12} color={PALETTE.emerald} /><Text style={styles.verifiedTagText}>Verified</Text></View>}
        </View>

        {/* Compact Summary */}
        <View style={styles.compactCard}>
          <Text style={styles.productTitle} numberOfLines={2}>{item.name ?? item.title}</Text>
          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatProductPrice(item)}</Text>
            <Text style={styles.moq}>{formatMoq(item)}</Text>
          </View>
          <View style={styles.metaRow}>
            {item.averageRating ? <Text style={styles.metaText}>★ {Number(item.averageRating).toFixed(1)}</Text> : null}
            {item.totalOrders ? <Text style={styles.metaText}>· {item.totalOrders} orders</Text> : null}
            {location ? <Text style={styles.metaText}>· {location}</Text> : null}
          </View>
        </View>

        {/* Supplier Strip */}
        <Pressable
          disabled={!sellerRouteId}
          onPress={() => sellerRouteId && navigation.navigate('SellerDetails', { sellerId: sellerRouteId, sellerName: getSellerName(item) })}
          style={styles.supplierStrip}>
          <View style={styles.supplierAvatar}>
            <Icon name="store-outline" size={18} color={PALETTE.primary} />
          </View>
          <View style={styles.supplierInfo}>
            <Text style={styles.supplierName} numberOfLines={1}>{getSellerName(item)}</Text>
            <Text style={styles.supplierMeta}>{sellerVerified ? 'Verified' : 'Supplier'}{location ? ` · ${location}` : ''}</Text>
          </View>
          <Icon name="chevron-right" size={18} color={PALETTE.muted} />
        </Pressable>

        {/* Quantity Picker */}
        <View style={styles.compactCard}>
          <Text style={styles.sectionLabel}>QUANTITY</Text>
          <View style={styles.qtyRow}>
            {[item.minimumOrderQuantity ?? 100, 500, 1000].filter(Boolean).map(q => (
              <Pressable
                key={q}
                onPress={() => setQuantity(String(q))}
                style={[styles.qtyChip, quantity === String(q) && styles.qtyChipActive]}>
                <Text style={[styles.qtyChipText, quantity === String(q) && styles.qtyChipTextActive]}>{q} {(item as any).unit ?? 'pcs'}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Description */}
        {item.description ? (
          <View style={styles.compactCard}>
            <Text style={styles.sectionLabel}>DETAILS</Text>
            <Text style={styles.descText} numberOfLines={3}>{item.description}</Text>
          </View>
        ) : null}

        {/* Reviews */}
        <ReviewsPanel productId={getId(item)} sellerId={sellerRouteId} showForm title="Reviews" />

        {/* Related */}
        {relatedProducts.length > 0 && (
          <View style={styles.relatedWrap}>
            <Text style={styles.relatedTitle}>Related Products</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.relatedList}>
              {relatedProducts.map(p => <ProductCard key={getId(p)} product={p} />)}
            </ScrollView>
          </View>
        )}

        <View style={{ height: 100 }} />
      </Animated.ScrollView>

      {/* Bottom Bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.xs }]}>
        <Pressable
          disabled={!canChat || chatNow.isPending}
          onPress={() => chatNow.mutate()}
          style={[styles.bottomBtn, styles.bottomBtnOutline]}>
          <Icon name="message-text-outline" size={16} color={PALETTE.primary} />
          <Text style={styles.bottomBtnOutlineText}>Chat</Text>
        </Pressable>
        <Pressable
          disabled={!canEnquire || sendEnquiry.isPending}
          onPress={() => setEnquiryOpen(true)}
          style={[styles.bottomBtn, styles.bottomBtnPrimary]}>
          <Icon name="send-outline" size={16} color="#fff" />
          <Text style={styles.bottomBtnPrimaryText}>Send Inquiry</Text>
        </Pressable>
      </View>

      {/* Enquiry Modal */}
      <Modal visible={enquiryOpen} animationType="slide" transparent onRequestClose={() => setEnquiryOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + spacing.md }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Send Inquiry</Text>
              <Pressable onPress={() => setEnquiryOpen(false)} hitSlop={10}>
                <Icon name="close" size={22} color={PALETTE.ink} />
              </Pressable>
            </View>
            <Text style={styles.modalProductName} numberOfLines={1}>{item.name ?? item.title}</Text>
            <ModalField label="Quantity" value={quantity} onChangeText={setQuantity} keyboardType="numeric" />
            <ModalField label="Target Price" value={targetPrice} onChangeText={setTargetPrice} keyboardType="numeric" />
            <ModalField label="Destination" value={destinationCountry} onChangeText={setDestinationCountry} />
            <ModalField label="Notes" value={additionalNotes} onChangeText={setAdditionalNotes} multiline />
            <Pressable
              disabled={sendEnquiry.isPending || !destinationCountry.trim()}
              onPress={() => sendEnquiry.mutate()}
              style={[styles.modalSubmit, (sendEnquiry.isPending || !destinationCountry.trim()) && styles.disabled]}>
              <Text style={styles.modalSubmitText}>{sendEnquiry.isPending ? 'Sending...' : 'Create RFQ & Open Chat'}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ModalField({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput placeholderTextColor={PALETTE.muted} style={[styles.fieldInput, props.multiline && styles.fieldTextarea]} {...props} />
    </View>
  );
}

// ── Styles ──
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PALETTE.background },
  header: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: PALETTE.surface,
    paddingHorizontal: spacing.sm, paddingBottom: spacing.xs, gap: spacing.sm, ...shadow,
  },
  headerBtn: {
    width: 38, height: 38, alignItems: 'center', justifyContent: 'center',
    borderRadius: radii.pill, backgroundColor: PALETTE.cardMuted,
  },
  headerTitle: { flex: 1, fontSize: 14, fontWeight: '800', color: PALETTE.ink, textAlign: 'center' },
  scrollContent: { paddingBottom: 20 },

  // Gallery
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
  dot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  dotActive: { backgroundColor: PALETTE.primary, width: 8, height: 8, borderRadius: 4 },
  verifiedTag: {
    position: 'absolute', top: spacing.sm, left: spacing.sm,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,181,120,0.9)', borderRadius: radii.pill,
    paddingHorizontal: spacing.sm, paddingVertical: 3,
  },
  verifiedTagText: { color: '#fff', fontSize: 10, fontWeight: '800' },

  // Compact Card
  compactCard: { backgroundColor: PALETTE.surface, marginHorizontal: spacing.sm, marginTop: spacing.sm, padding: spacing.sm, borderRadius: radii.md, ...shadow },
  productTitle: { fontSize: 15, fontWeight: '800', color: PALETTE.ink, lineHeight: 20 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, marginTop: 4 },
  price: { fontSize: 20, fontWeight: '900', color: PALETTE.primaryDark },
  moq: { fontSize: 11, fontWeight: '700', color: PALETTE.muted },
  metaRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  metaText: { fontSize: 11, fontWeight: '600', color: PALETTE.muted },

  // Supplier Strip
  supplierStrip: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: PALETTE.surface, marginHorizontal: spacing.sm, marginTop: spacing.sm,
    padding: spacing.sm, borderRadius: radii.md, ...shadow,
  },
  supplierAvatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: PALETTE.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  supplierInfo: { flex: 1 },
  supplierName: { fontSize: 13, fontWeight: '800', color: PALETTE.ink },
  supplierMeta: { fontSize: 10, fontWeight: '600', color: PALETTE.muted, marginTop: 1 },

  // Quantity
  sectionLabel: { fontSize: 10, fontWeight: '800', color: PALETTE.muted, letterSpacing: 0.5, marginBottom: spacing.sm },
  qtyRow: { flexDirection: 'row', gap: spacing.sm },
  qtyChip: {
    flex: 1, paddingVertical: spacing.sm, borderRadius: radii.sm,
    backgroundColor: PALETTE.cardMuted, alignItems: 'center',
    borderWidth: 1, borderColor: 'transparent',
  },
  qtyChipActive: { backgroundColor: PALETTE.primaryLight, borderColor: PALETTE.primary },
  qtyChipText: { fontSize: 12, fontWeight: '700', color: PALETTE.text },
  qtyChipTextActive: { color: PALETTE.primaryDark },

  // Description
  descText: { fontSize: 12, fontWeight: '500', color: PALETTE.text, lineHeight: 18 },

  // Related
  relatedWrap: { marginTop: spacing.md, paddingLeft: spacing.sm },
  relatedTitle: { fontSize: 13, fontWeight: '800', color: PALETTE.ink, marginBottom: spacing.sm },
  relatedList: { gap: spacing.sm, paddingRight: spacing.sm },

  // Bottom Bar
  bottomBar: {
    flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingTop: spacing.xs,
    backgroundColor: PALETTE.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: PALETTE.faint,
  },
  bottomBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, height: 44, borderRadius: radii.md,
  },
  bottomBtnOutline: { borderWidth: 1.5, borderColor: PALETTE.primary },
  bottomBtnOutlineText: { fontSize: 13, fontWeight: '800', color: PALETTE.primary },
  bottomBtnPrimary: { backgroundColor: PALETTE.primary },
  bottomBtnPrimaryText: { fontSize: 13, fontWeight: '800', color: '#fff' },

  // Modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: PALETTE.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.md },
  modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  modalTitle: { flex: 1, fontSize: 16, fontWeight: '900', color: PALETTE.ink },
  modalProductName: { fontSize: 12, fontWeight: '700', color: PALETTE.muted, marginBottom: spacing.md },
  fieldWrap: { marginBottom: spacing.md },
  fieldLabel: { fontSize: 10, fontWeight: '800', color: PALETTE.muted, marginBottom: 4, textTransform: 'uppercase' },
  fieldInput: {
    backgroundColor: PALETTE.cardMuted, borderRadius: radii.sm,
    height: 40, paddingHorizontal: spacing.sm, fontSize: 13, fontWeight: '700', color: PALETTE.ink,
  },
  fieldTextarea: { height: 70, paddingTop: spacing.sm, textAlignVertical: 'top' },
  modalSubmit: {
    backgroundColor: PALETTE.primary, borderRadius: radii.md,
    height: 46, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm,
  },
  modalSubmitText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.45 },
});

export default React.memo(ProductDetailsScreen);

// ── Cached product lookup (unchanged) ──
function findCachedProduct(queryClient: QueryClient, productId: string) {
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
    return record as Product;
  }
  for (const key of ['product', 'products', 'featuredProducts', 'latestProducts', 'trendingProducts', 'recommendedProducts', 'pages']) {
    const found = scanForProduct(record[key], productId, depth + 1);
    if (found) return found;
  }
  return undefined;
}