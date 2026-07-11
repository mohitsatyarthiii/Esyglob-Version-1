import React, { useCallback, useMemo, useState } from 'react';
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
import RemoteImage from '../components/RemoteImage';
import ReviewsPanel from '../components/ReviewsPanel';
import SavedHeartButton from '../components/SavedHeartButton';
import TradeAssurance from '../components/TradeAssurance';
import QuickInfo from '../components/QuickInfo';
import MoqSelector from '../components/MoqSelector';
import EnquiryModal from '../components/EnquiryModal';
import { ErrorState, LoadingState } from '../components/StateViews';
import {
  formatMoq,
  formatProductPrice,
  getId,
  getProductImage,
  getProductLocation,
  getSellerName,
  isVerifiedProduct,
} from '../utils/format';
import { firstImage } from '../utils/images';

// ─── Types ──────────────────────────────────────────────────────────────────

type MoqTier = {
  minQty: number;
  maxQty: number | null;
  price: number;
  unit: string;
  discount?: number;
  savings?: number;
  leadTime?: string;
  available?: boolean;
};

type Attachment = {
  uri: string;
  name: string;
  type: string;
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GALLERY_WIDTH = SCREEN_WIDTH - 24;

// ─── Palette ────────────────────────────────────────────────────────────────

const P = {
  bg: '#FAFAFA',
  surface: '#FFFFFF',
  primary: '#FF6A00',
  primaryLight: '#FFF3E8',
  primaryDark: '#E05500',
  emerald: '#00B578',
  ink: '#1A1A1A',
  text: '#333333',
  textSecondary: '#666666',
  muted: '#999999',
  faint: '#E8E8E8',
  border: 'rgba(0,0,0,0.05)',
  cardMuted: '#F8F9FB',
  amber: '#F59E0B',
  blue: '#3B82F6',
};

// ─── DEBUG ──────────────────────────────────────────────────────────────────

const DEBUG = __DEV__;
function log(...args: any[]) {
  if (DEBUG) console.log('[ProductDetails]', ...args);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function resolveSellerUserId(item: Product): string | undefined {
  log('resolveSellerUserId called');
  log('  item.sellerId type:', typeof item.sellerId);
  log('  item.seller type:', typeof item.seller);

  const sellerObj =
    (typeof item.sellerId === 'object' && item.sellerId ? item.sellerId : null) ??
    (typeof item.seller === 'object' && item.seller ? item.seller : null);

  if (!sellerObj) {
    log('  ❌ No seller object found on product');
    return undefined;
  }

  const seller = sellerObj as Record<string, any>;
  log('  seller keys:', Object.keys(seller));
  log('  seller._id:', seller._id);
  log('  seller.id:', seller.id);
  log('  seller.userId type:', typeof seller.userId);
  log('  seller.userId:', seller.userId);

  // Case 1: userId is a string (direct user ID)
  if (typeof seller.userId === 'string' && seller.userId) {
    log('  ✅ Found sellerUserId (string):', seller.userId);
    return seller.userId;
  }

  // Case 2: userId is a populated object
  if (typeof seller.userId === 'object' && seller.userId) {
    const uid = (seller.userId as Record<string, any>)._id ?? (seller.userId as Record<string, any>).id;
    log('  ✅ Found sellerUserId (populated):', uid);
    return uid;
  }

  // Case 3: Fallback to seller._id or seller.id
  const fallback = seller._id ?? seller.id;
  if (fallback) {
    log('  ⚠️ Using fallback seller ID as userId:', fallback);
    return undefined;
  }

  log('  ❌ Could not resolve sellerUserId');
  return undefined;
}

function buildMoqTiers(item: Product): MoqTier[] {
  const tiers: MoqTier[] = [];
  const basePrice = Number((item.priceTiers?.[0] as any)?.unitPrice ?? (item.priceTiers?.[0] as any)?.price ?? item.price ?? 0);
  const leadTime = typeof item.leadTime === 'string' ? item.leadTime : item.leadTime?.value ? `${item.leadTime.value} ${item.leadTime.unit ?? 'days'}` : undefined;
  if (item.priceTiers && item.priceTiers.length > 0) {
    for (const t of item.priceTiers) {
      const price = Number((t as any).price ?? (t as any).unitPrice ?? item.price ?? 0);
      tiers.push({
        minQty: Number((t as any).minQuantity ?? (t as any).minimumQuantity ?? 1),
        maxQty: (t as any).maxQuantity != null ? Number((t as any).maxQuantity) : null,
        price,
        unit: (t as any).unit ?? (item as any).unit ?? 'pcs',
        discount: basePrice > price ? ((basePrice - price) / basePrice) * 100 : 0,
        savings: Math.max(basePrice - price, 0),
        leadTime,
        available: Number((item as any).stockQuantity ?? 1) > 0,
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
  const { status, user, activeRole } = useAuth();
  const { productId } = route.params as { productId: string };
  const queryClient = useQueryClient();

  log('=== ProductDetailsScreen Mount ===');
  log('  productId:', productId);
  log('  auth status:', status);
  log('  user:', user ? `${user._id ?? user.id} (${user.roles?.join(',')})` : 'null');

  const [enquiryOpen, setEnquiryOpen] = useState(false);
  const [quantity, setQuantity] = useState('100');
  const [targetPrice, setTargetPrice] = useState('');
  const [destinationCountry, setDestinationCountry] = useState('India');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [customSpecifications, setCustomSpecifications] = useState('');
  const [packagingRequirements, setPackagingRequirements] = useState('');
  const [deliveryRequirements, setDeliveryRequirements] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [selectedImage, setSelectedImage] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState(0);
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
    queryFn: () => fetchProducts({ category: (productQuery.data as any)?.category, limit: 6 }),
    enabled: Boolean((productQuery.data as any)?.category),
  });

  const item = productQuery.data as Product | undefined;

  // ── Resolve seller info ─────────────────────────────────────────────────

  const sellerUserId = useMemo(() => {
    if (!item) return undefined;
    return resolveSellerUserId(item);
  }, [item]);

  const seller = useMemo(() => {
    if (!item) return undefined;
    return typeof item.sellerId === 'object' ? (item.sellerId as Record<string, any>) : undefined;
  }, [item]);

  const sellerRouteId = seller?._id ?? seller?.id;
  const sellerProductsQuery = useQuery({
    queryKey: ['seller-product-rail', sellerRouteId],
    queryFn: () => fetchProducts({ seller: sellerRouteId, limit: 8 }),
    enabled: Boolean(sellerRouteId),
    staleTime: 90_000,
  });
  const sellerVerified = item ? isVerifiedProduct(item) : false;
  const location = item ? getProductLocation(item) : '';

  const canStartOrder = Boolean(
    seller?.isTrustedSeller &&
    seller?.trustedSellerBadge === 'active' &&
    (item as any)?.directOrderEnabled &&
    seller?.isActive !== false &&
    seller?.isSuspended !== true
  );

  const isAuth = status === 'authenticated';
  const currentUserId = String(user?._id ?? user?.id ?? '');
  const isBuyer = isAuth && activeRole === 'buyer';
  const isSelfContact = Boolean(currentUserId && sellerUserId && currentUserId === String(sellerUserId));
  const canAct = isBuyer && Boolean(sellerUserId) && !isSelfContact;

  // ── DEBUG: Button state ─────────────────────────────────────────────────

  // ── Track view ──────────────────────────────────────────────────────────

  React.useEffect(() => {
    if (item && status === 'authenticated') {
      trackProductView(getId(item) ?? '').catch(() => {});
    }
  }, [item, status]);

  const moqTiers: MoqTier[] = useMemo(() => {
    if (!item) return [];
    return buildMoqTiers(item);
  }, [item]);

  React.useEffect(() => {
    if (!item || moqTiers.length === 0) return;
    setQuantity(String(moqTiers[0].minQty));
    setTargetPrice(moqTiers[0].price > 0 ? String(moqTiers[0].price) : '');
  }, [item, moqTiers]);

  const selectedTier = useMemo(() => {
    const qty = Number(quantity) || 0;
    return [...moqTiers].reverse().find(t => qty >= t.minQty) ?? moqTiers[0];
  }, [moqTiers, quantity]);

  // ── Mutations ──────────────────────────────────────────────────────────

  const chatNow = useMutation({
    mutationFn: async () => {
      log('=== Chat Now Clicked ===');
      log('  item:', item ? 'exists' : 'null');
      log('  sellerUserId:', sellerUserId);
      if (!item) throw new Error('Product not loaded.');
      if (!isBuyer) throw new Error('Switch to buyer mode to contact this supplier.');
      if (isSelfContact) throw new Error('You cannot start a chat with your own seller account.');
      if (!sellerUserId) throw new Error('Seller contact not available.');
      log('  Calling startProductChat with:', {
        otherUserId: sellerUserId,
        productId: getId(item) ?? '',
        role: 'buyer',
      });
      return startProductChat({
        otherUserId: sellerUserId,
        productId: getId(item) ?? '',
        role: 'buyer',
        enquiry: false,
      });
    },
    onSuccess: (result: any) => {
      log('  ✅ Chat Now success:', JSON.stringify(result));
      if (result.chat) {
        navigation.navigate('ChatDetails', {
          chatId: getId(result.chat),
          title: getSellerName(item!),
        });
      }
    },
    onError: (error: any) => {
      log('  ❌ Chat Now error:', error?.message);
      Alert.alert('Error', error?.message ?? 'Failed to start chat.');
    },
  });

  const sendEnquiry = useMutation({
    mutationFn: async () => {
      log('=== Send Enquiry Clicked ===');
      log('  item:', item ? 'exists' : 'null');
      log('  sellerUserId:', sellerUserId);
      if (!item) throw new Error('Product not loaded.');
      if (!isBuyer) throw new Error('Switch to buyer mode to send an enquiry.');
      if (isSelfContact) throw new Error('You cannot send an enquiry to your own seller account.');
      if (!sellerUserId) throw new Error('Seller information missing.');
      log('  Calling createProductEnquiry');
      return createProductEnquiry({
        productId: getId(item) ?? '',
        sellerUserId,
        productName: item.name ?? item.title ?? 'Product',
        quantity: Number(quantity) || 100,
        unit: (item as any).unit ?? 'pcs',
        targetPrice: targetPrice ? Number(targetPrice) : undefined,
        destinationCountry: destinationCountry.trim() || 'India',
        customSpecifications: customSpecifications.trim() || undefined,
        packagingRequirements: packagingRequirements.trim() || undefined,
        deliveryRequirements: deliveryRequirements.trim() || undefined,
        additionalNotes: additionalNotes.trim() || undefined,
        attachments: attachments.map(a => ({ filename: a.name, type: a.type })),
      });
    },
    onSuccess: (result: any) => {
      log('  ✅ Enquiry success:', JSON.stringify(result));
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
    onError: (error: any) => {
      log('  ❌ Enquiry error:', error?.message);
      Alert.alert('Enquiry Failed', error?.message ?? 'Unable to send enquiry.');
    },
  });

  const goToStore = useCallback(() => {
    log('=== Store Clicked ===');
    log('  sellerRouteId:', sellerRouteId);
    if (!sellerRouteId || !item) {
      Alert.alert('Error', 'Seller information not available.');
      return;
    }
    navigation.navigate('SellerDetails', { sellerId: sellerRouteId, sellerName: getSellerName(item) });
  }, [sellerRouteId, item, navigation]);

  const goToStartOrder = useCallback(() => {
    if (!item) return;
    navigation.navigate('OrderCheckout', { mode: 'trade', productId: getId(item) });
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
  const relatedProducts: Product[] = (relatedQuery.data?.products ?? [])
    .filter((p: Product) => getId(p) !== getId(item))
    .slice(0, 6);
  const sellerProducts: Product[] = (sellerProductsQuery.data?.products ?? [])
    .filter((p: Product) => getId(p) !== getId(item))
    .slice(0, 6);

  const onMainImageScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / GALLERY_WIDTH);
    if (index !== selectedImage) setSelectedImage(index);
  };

  const scrollToImage = (index: number) => {
    flatListRef.current?.scrollToIndex({ index, animated: true });
    setSelectedImage(index);
  };

  const shareProduct = () =>
    Share.share({ message: `${item.name ?? 'Product'}\n${formatProductPrice(item)}` });

  const sellerLogo = firstImage(seller?.companyLogo, seller?.logo, seller?.logoUrl);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={P.surface} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.headerBtn}>
          <Icon name="arrow-left" size={20} color={P.ink} />
        </Pressable>
        <Text numberOfLines={1} style={styles.headerTitle}>{item.name ?? 'Product'}</Text>
        <Pressable onPress={shareProduct} hitSlop={10} style={styles.headerBtn}>
          <Icon name="share-variant-outline" size={18} color={P.ink} />
        </Pressable>
      </View>

      <Animated.ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} style={{ opacity: fade }}>

        {/* Gallery */}
        <View style={styles.galleryWrap}>
          <FlatList
            ref={flatListRef} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
            data={gallery} keyExtractor={(uri, i) => `${uri}-${i}`}
            onMomentumScrollEnd={onMainImageScroll}
            getItemLayout={(_, index) => ({ length: GALLERY_WIDTH, offset: GALLERY_WIDTH * index, index })}
            renderItem={({ item: uri }) => (
              <Pressable onPress={() => setGalleryOpen(true)} style={styles.gallerySlide}>
                <RemoteImage uri={uri} width={900} height={700} resizeMode="contain" style={styles.galleryImage} fallback={<Icon name="image-off" size={40} color={P.muted} />} />
              </Pressable>
            )}
          />
          <SavedHeartButton type="product" itemId={getId(item) ?? ''} target={item} size={16} style={styles.heartBtn} iconColor={P.ink} />
          {gallery.length > 1 && (
            <View style={styles.paginationRow}>
              {gallery.map((_, i) => (<Pressable key={i} onPress={() => scrollToImage(i)} style={[styles.dot, selectedImage === i && styles.dotActive]} />))}
            </View>
          )}
          <View style={styles.imageCounter}><Icon name="image-multiple-outline" size={12} color="#FFF" /><Text style={styles.imageCounterText}>{selectedImage + 1}/{gallery.length}</Text></View>
          {sellerVerified && (
            <View style={styles.verifiedTag}><Icon name="check-decagram" size={10} color="#FFF" /><Text style={styles.verifiedTagText}>Verified</Text></View>
          )}
        </View>

        {/* Title Card */}
        <View style={styles.card}>
          <View style={styles.categoryRow}>
            {item.category && <View style={styles.categoryBadge}><Text style={styles.categoryBadgeText}>{typeof item.category === 'string' ? item.category : (item.category as any)?.name}</Text></View>}
            {item.averageRating ? <View style={styles.ratingRow}><Icon name="star" size={11} color={P.amber} /><Text style={styles.ratingText}>{Number(item.averageRating).toFixed(1)}</Text><Text style={styles.reviewCount}>({item.reviewCount ?? 0})</Text></View> : null}
          </View>
          <Text style={styles.productName}>{item.name ?? item.title}</Text>
        </View>

        {/* MOQ */}
        <MoqSelector tiers={moqTiers} currency={`${(item as any).currency ?? 'INR'} `} selectedQty={Number(quantity)} onSelect={(qty: number) => {
          setQuantity(String(qty));
          const tier = [...moqTiers].reverse().find(t => qty >= t.minQty) ?? moqTiers[0];
          setTargetPrice(tier?.price > 0 ? String(tier.price) : '');
        }} />

        {/* Price */}
        <View style={styles.card}>
          <View style={styles.priceRow}><Text style={styles.price}>{selectedTier?.price ? `${(item as any).currency ?? 'INR'} ${selectedTier.price.toLocaleString()}` : formatProductPrice(item)}</Text><Text style={styles.moq}>{formatMoq(item)}</Text></View>
          {item.totalOrders ? <Text style={styles.ordersText}>{item.totalOrders} orders</Text> : null}
          {location ? <Text style={styles.locationText}>{location}</Text> : null}
        </View>

        <TradeAssurance />

        {item.variants?.length ? (
          <View style={styles.card}>
            <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Available Variants</Text><View style={styles.sectionLine} /></View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.variantRow}>
              {item.variants.map((variant, index) => {
                const label = String((variant as any).name ?? (variant as any).label ?? (variant as any).value ?? `Option ${index + 1}`);
                return <Pressable key={`${label}-${index}`} onPress={() => setSelectedVariant(index)} style={[styles.variantChip, selectedVariant === index && styles.variantChipActive]}><Text style={[styles.variantText, selectedVariant === index && styles.variantTextActive]}>{label}</Text></Pressable>;
              })}
            </ScrollView>
          </View>
        ) : null}

        {(item as any).specifications && typeof (item as any).specifications === 'object' && Object.keys((item as any).specifications).length ? (
          <View style={styles.card}>
            <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Specifications</Text><View style={styles.sectionLine} /></View>
            {Object.entries((item as any).specifications).map(([key, value]) => <View key={key} style={styles.specRow}><Text style={styles.specLabel}>{key.replace(/([A-Z])/g, ' $1')}</Text><Text style={styles.specValue}>{String(value)}</Text></View>)}
          </View>
        ) : null}

        <View style={styles.card}>
          <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Trade Information</Text><View style={styles.sectionLine} /></View>
          <View style={styles.tradeGrid}>
            <InfoItem icon="clock-fast" label="Lead time" value={typeof item.leadTime === 'string' ? item.leadTime : item.leadTime?.value ? `${item.leadTime.value} ${item.leadTime.unit ?? 'days'}` : 'Contact supplier'} />
            <InfoItem icon="cash-check" label="Payment" value={Array.isArray(item.paymentTerms) ? item.paymentTerms.join(', ') : item.paymentTerms ?? 'Negotiable'} />
            <InfoItem icon="package-variant" label="Packaging" value={typeof item.packaging === 'string' ? item.packaging : item.packaging ? 'Supplier packaging available' : 'Confirm with supplier'} />
            <InfoItem icon="earth" label="Origin" value={(item.countryOfOrigin ?? item.originCountry ?? location) || 'Supplier location'} />
          </View>
        </View>

        {/* Seller */}
        {seller && (
          <Pressable onPress={goToStore} style={styles.sellerCard}>
            <View style={styles.sellerTopRow}>
              <View style={styles.sellerTopLeft}>
                <RemoteImage uri={sellerLogo} width={80} height={80} style={styles.sellerLogo} fallback={<Text style={styles.sellerLogoText}>{(seller.companyName ?? 'S')[0]}</Text>} />
                <View style={styles.sellerMainInfo}>
                  <View style={styles.sellerNameRow}><Text style={styles.sellerName} numberOfLines={1}>{seller.companyName}</Text>{sellerVerified && <Icon name="check-decagram" size={13} color={P.blue} />}</View>
                  <View style={styles.sellerBadges}>
                    {sellerVerified && <View style={styles.sellerBadge}><Icon name="check-decagram" size={9} color={P.blue} /><Text style={styles.sellerBadgeText}>Verified</Text></View>}
                    {seller.isTrustedSeller && <View style={[styles.sellerBadge, styles.trustedBadge]}><Icon name="shield-check" size={9} color={P.amber} /><Text style={[styles.sellerBadgeText, styles.trustedBadgeText]}>Trusted</Text></View>}
                  </View>
                  <View style={styles.sellerStats}>
                    {seller.rating ? <View style={styles.sellerStatItem}><Icon name="star" size={10} color={P.amber} /><Text style={styles.sellerStatText}>{Number(seller.rating).toFixed(1)}</Text></View> : null}
                    <Text style={styles.sellerStatSep}>·</Text><Text style={styles.sellerStatText}>{seller.totalProducts ?? 0} products</Text>
                  </View>
                </View>
              </View>
              <Icon name="chevron-right" size={18} color={P.muted} />
            </View>
            {seller.verificationLevel > 0 && <View style={styles.verificationLevelBanner}><Icon name="award" size={12} color={P.blue} /><Text style={styles.verificationLevelText}>Level {seller.verificationLevel} Verified Supplier</Text></View>}
            {location && <View style={styles.sellerLocationRow}><Icon name="map-marker-outline" size={11} color={P.muted} /><Text style={styles.sellerLocationText}>{location}</Text></View>}
            {seller.trustScore > 0 && <View style={styles.sellerLocationRow}><Icon name="trending-up" size={11} color={P.muted} /><Text style={styles.sellerLocationText}>Trust Score {seller.trustScore}%</Text></View>}
            <Text style={styles.sellerFooterText}>Contact via chat or RFQ for secure communication</Text>
          </Pressable>
        )}

        {/* Description */}
        {item.description && (
          <View style={styles.card}>
            <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Product Details</Text><View style={styles.sectionLine} /></View>
            <Text style={styles.descText}>{item.description}</Text>
          </View>
        )}

        <QuickInfo />

        {/* Related */}
        {sellerProducts.length > 0 && (
          <View style={styles.relatedSection}>
            <View style={styles.relatedHeader}><Text style={styles.relatedTitle}>More from this seller</Text>{sellerRouteId && <Pressable onPress={goToStore}><Text style={styles.viewAllText}>View All →</Text></Pressable>}</View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.relatedList}>
              {sellerProducts.map((p: Product) => (
                <Pressable key={getId(p)} onPress={() => navigation.push('ProductDetails', { productId: getId(p) })} style={styles.relatedCard}>
                  <RemoteImage uri={p.images?.[0] ?? (p as any).image} width={160} height={120} style={styles.relatedImage} fallback={<Icon name="package-variant" size={24} color={P.muted} />} />
                  <View style={styles.relatedInfo}>
                    <Text style={styles.relatedCategory} numberOfLines={1}>{typeof p.category === 'string' ? p.category : ''}</Text>
                    <Text style={styles.relatedName} numberOfLines={2}>{p.name ?? p.title}</Text>
                    <View style={styles.relatedBottom}>
                      <Text style={styles.relatedPrice}>{formatProductPrice(p)}</Text>
                      {p.averageRating ? <View style={styles.relatedRating}><Icon name="star" size={9} color={P.amber} /><Text style={styles.relatedRatingText}>{Number(p.averageRating).toFixed(1)}</Text></View> : null}
                    </View>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {relatedProducts.length > 0 && (
          <View style={styles.relatedSection}>
            <View style={styles.relatedHeader}><Text style={styles.relatedTitle}>Similar Products</Text></View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.relatedList}>
              {relatedProducts.map((product: Product) => <Pressable key={getId(product)} onPress={() => navigation.push('ProductDetails', { productId: getId(product) })} style={styles.relatedCard}><RemoteImage uri={getProductImage(product)} width={160} height={120} resizeMode="contain" style={styles.relatedImage} /><View style={styles.relatedInfo}><Text style={styles.relatedName} numberOfLines={2}>{product.name ?? product.title}</Text><Text style={styles.relatedPrice}>{formatProductPrice(product)}</Text></View></Pressable>)}
            </ScrollView>
          </View>
        )}

        {/* Reviews */}
        <View style={styles.reviewsSection}>
          <Text style={styles.reviewsTitle}>Reviews</Text>
          <Text style={styles.reviewsSubtitle}>Verified buyer feedback and ratings</Text>
          <ReviewsPanel productId={getId(item) ?? ''} sellerId={sellerRouteId} showForm title="" />
        </View>

        <View style={styles.bottomSpacer} />
      </Animated.ScrollView>

      {/* Bottom Bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 8 }]}>
        {!isAuth ? (
          <Pressable onPress={() => navigation.navigate('Auth', { initialMode: 'login' })} style={styles.authBtn}>
            <Icon name="login" size={18} color="#FFF" /><Text style={styles.authBtnText}>Sign In to Continue</Text>
          </Pressable>
        ) : !isBuyer ? (
          <Pressable disabled={!sellerRouteId} onPress={goToStore} style={styles.authBtn}>
            <Icon name="store-outline" size={18} color="#FFF" /><Text style={styles.authBtnText}>View Supplier Store</Text>
          </Pressable>
        ) : isSelfContact ? (
          <Pressable disabled style={[styles.authBtn, styles.disabledBtn]}>
            <Icon name="account-lock-outline" size={18} color="#FFF" /><Text style={styles.authBtnText}>Your Product</Text>
          </Pressable>
        ) : (
          <>
            <Pressable disabled={!sellerRouteId} onPress={goToStore} style={styles.storeBtn}>
              <Icon name="store-outline" size={20} color={P.ink} />
            </Pressable>
            <Pressable onPress={() => navigation.navigate('OrderCheckout', { mode: 'sample', productId: getId(item) })} style={styles.sampleBtn}>
              <Icon name="flask-outline" size={16} color={P.primary} /><Text style={styles.sampleBtnText}>Sample</Text>
            </Pressable>
            {canStartOrder && (
              <Pressable onPress={goToStartOrder} style={styles.startOrderBtn}>
                <Icon name="rocket-launch" size={16} color="#FFF" /><Text style={styles.startOrderBtnText}>Start Order</Text>
              </Pressable>
            )}
            <Pressable disabled={!canAct || chatNow.isPending} onPress={() => { log('Chat Now button pressed'); chatNow.mutate(); }} style={styles.outlineBtn}>
              <Icon name="message-text-outline" size={18} color={P.primary} /><Text style={styles.outlineBtnText}>{chatNow.isPending ? '...' : 'Chat Now'}</Text>
            </Pressable>
            <Pressable disabled={!canAct} onPress={() => { log('Send Enquiry button pressed'); setEnquiryOpen(true); }} style={styles.primaryBtn}>
              <Icon name="send-outline" size={18} color="#FFF" /><Text style={styles.primaryBtnText}>Send Enquiry</Text>
            </Pressable>
          </>
        )}
      </View>

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
        customSpecifications={customSpecifications}
        packagingRequirements={packagingRequirements}
        deliveryRequirements={deliveryRequirements}
        attachments={attachments}
        onQuantityChange={setQuantity}
        onTargetPriceChange={setTargetPrice}
        onDestinationChange={setDestinationCountry}
        onNotesChange={setAdditionalNotes}
        onSpecificationsChange={setCustomSpecifications}
        onPackagingChange={setPackagingRequirements}
        onDeliveryChange={setDeliveryRequirements}
        onAttachmentsChange={setAttachments}
        onClose={() => setEnquiryOpen(false)}
        onSubmit={() => { log('Enquiry modal submit'); sendEnquiry.mutate(); }}
      />
      <Modal visible={galleryOpen} animationType="fade" onRequestClose={() => setGalleryOpen(false)}>
        <View style={styles.lightbox}>
          <Pressable onPress={() => setGalleryOpen(false)} style={styles.lightboxClose}><Icon name="close" size={26} color="#FFF" /></Pressable>
          <FlatList horizontal pagingEnabled data={gallery} initialScrollIndex={selectedImage}
            keyExtractor={(uri, index) => `${uri}-full-${index}`}
            getItemLayout={(_, index) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * index, index })}
            renderItem={({ item: uri }) => <View style={styles.lightboxSlide}><RemoteImage uri={uri} width={1400} height={1400} resizeMode="contain" style={styles.lightboxImage} /></View>} />
        </View>
      </Modal>
    </View>
  );
}

// ─── Detail Chip ────────────────────────────────────────────────────────────

// ─── Styles ─────────────────────────────────────────────────────────────────

function InfoItem({ icon, label, value }: { icon: string; label: string; value: string }) {
  return <View style={styles.infoItem}><Icon name={icon} size={18} color={P.primary} /><View style={styles.infoBody}><Text style={styles.infoLabel}>{label}</Text><Text numberOfLines={2} style={styles.infoValue}>{value}</Text></View></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: P.bg },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: P.surface, paddingHorizontal: 12, paddingBottom: 8, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: P.border },
  headerBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: P.cardMuted, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: P.ink, textAlign: 'center' },
  scrollContent: { paddingBottom: 20 },
  galleryWrap: { position: 'relative', backgroundColor: P.surface, borderRadius: 16, overflow: 'hidden', marginHorizontal: 12, marginTop: 8 },
  gallerySlide: { width: GALLERY_WIDTH, height: GALLERY_WIDTH * 0.82 },
  galleryImage: { width: GALLERY_WIDTH, height: GALLERY_WIDTH * 0.82, backgroundColor: P.surface },
  imageCounter: { position: 'absolute', right: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  imageCounterText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  lightbox: { flex: 1, backgroundColor: '#050505', justifyContent: 'center' },
  lightboxClose: { position: 'absolute', right: 18, top: 46, zIndex: 2, width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  lightboxSlide: { width: SCREEN_WIDTH, flex: 1, alignItems: 'center', justifyContent: 'center' },
  lightboxImage: { width: SCREEN_WIDTH, height: '80%' },
  heartBtn: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 16, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  paginationRow: { position: 'absolute', bottom: 10, alignSelf: 'center', flexDirection: 'row', gap: 5 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  dotActive: { backgroundColor: P.primary, width: 7, height: 7, borderRadius: 4 },
  verifiedTag: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,181,120,0.9)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  verifiedTagText: { color: '#FFF', fontSize: 8, fontWeight: '800' },
  card: { backgroundColor: P.surface, marginHorizontal: 12, marginTop: 8, padding: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: P.border, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  categoryBadge: { backgroundColor: '#F1F5F9', borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
  categoryBadgeText: { fontSize: 9, fontWeight: '700', color: P.textSecondary, textTransform: 'uppercase' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ratingText: { fontSize: 10, fontWeight: '700', color: P.text },
  reviewCount: { fontSize: 9, color: P.muted },
  productName: { fontSize: 15, fontWeight: '700', color: P.ink, lineHeight: 20, letterSpacing: -0.2 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 4 },
  price: { fontSize: 20, fontWeight: '800', color: P.primaryDark },
  moq: { fontSize: 11, fontWeight: '600', color: P.muted },
  ordersText: { fontSize: 10, color: P.muted, fontWeight: '500' },
  locationText: { fontSize: 10, color: P.muted, fontWeight: '500', marginTop: 2 },
  sellerCard: { backgroundColor: P.surface, marginHorizontal: 12, marginTop: 8, padding: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: P.border },
  sellerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sellerTopLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  sellerLogo: { width: 40, height: 40, borderRadius: 10, backgroundColor: P.cardMuted },
  sellerLogoText: { fontSize: 18, fontWeight: '800', color: P.muted },
  sellerMainInfo: { flex: 1 },
  sellerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sellerName: { fontSize: 13, fontWeight: '700', color: P.ink, flex: 1 },
  sellerBadges: { flexDirection: 'row', gap: 5, marginTop: 4 },
  sellerBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#EFF6FF', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  sellerBadgeText: { fontSize: 8, fontWeight: '700', color: P.blue },
  trustedBadge: { backgroundColor: '#FFFBEB' },
  trustedBadgeText: { color: '#92400E' },
  sellerStats: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 },
  sellerStatItem: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  sellerStatText: { fontSize: 10, fontWeight: '600', color: P.textSecondary },
  sellerStatSep: { fontSize: 10, color: P.muted },
  verificationLevelBanner: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#EFF6FF', borderRadius: 8, padding: 8, marginTop: 10 },
  verificationLevelText: { fontSize: 10, fontWeight: '700', color: P.blue },
  sellerLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  sellerLocationText: { fontSize: 10, color: P.muted, fontWeight: '500' },
  sellerFooterText: { textAlign: 'center', fontSize: 9, color: P.muted, fontWeight: '600', backgroundColor: '#F8FAFC', borderRadius: 8, padding: 8, marginTop: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: P.ink },
  sectionLine: { flex: 1, height: 1, backgroundColor: P.border },
  descText: { fontSize: 12, color: P.textSecondary, lineHeight: 18, marginBottom: 12 },
  variantRow: { gap: 8, paddingRight: 8 },
  variantChip: { borderWidth: 1, borderColor: P.faint, backgroundColor: P.cardMuted, borderRadius: 9, paddingHorizontal: 13, paddingVertical: 9 },
  variantChipActive: { borderColor: P.primary, backgroundColor: P.primaryLight },
  variantText: { color: P.textSecondary, fontSize: 11, fontWeight: '600' },
  variantTextActive: { color: P.primaryDark, fontWeight: '700' },
  specRow: { flexDirection: 'row', paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: P.faint },
  specLabel: { width: '42%', color: P.muted, fontSize: 11, textTransform: 'capitalize' },
  specValue: { flex: 1, color: P.text, fontSize: 11, fontWeight: '600' },
  tradeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  infoItem: { width: '48%', flexDirection: 'row', gap: 8, padding: 10, backgroundColor: P.cardMuted, borderRadius: 10 },
  infoBody: { flex: 1 },
  infoLabel: { color: P.muted, fontSize: 9, fontWeight: '700', textTransform: 'uppercase' },
  infoValue: { color: P.text, fontSize: 10, fontWeight: '600', marginTop: 2 },
  relatedSection: { marginTop: 16, paddingLeft: 12 },
  relatedHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingRight: 12 },
  relatedTitle: { fontSize: 13, fontWeight: '700', color: P.ink },
  viewAllText: { fontSize: 10, fontWeight: '600', color: P.muted },
  relatedList: { gap: 10, paddingRight: 12 },
  relatedCard: { width: 150, backgroundColor: P.surface, borderRadius: 12, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: P.border },
  relatedImage: { width: 150, height: 100, backgroundColor: P.cardMuted },
  relatedInfo: { padding: 8 },
  relatedCategory: { fontSize: 8, fontWeight: '600', color: P.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  relatedName: { fontSize: 10, fontWeight: '600', color: P.ink, lineHeight: 14, marginBottom: 6 },
  relatedBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  relatedPrice: { fontSize: 11, fontWeight: '700', color: P.ink },
  relatedRating: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  relatedRatingText: { fontSize: 9, fontWeight: '600', color: P.muted },
  reviewsSection: { marginTop: 20, paddingHorizontal: 12 },
  reviewsTitle: { fontSize: 13, fontWeight: '700', color: P.ink, marginBottom: 2 },
  reviewsSubtitle: { fontSize: 10, color: P.muted, marginBottom: 10 },
  detailsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  detailChip: { backgroundColor: '#F8FAFC', borderRadius: 8, padding: 8, paddingHorizontal: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: P.border, minWidth: '45%' },
  detailChipLabel: { fontSize: 8, fontWeight: '700', color: P.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  detailChipValue: { fontSize: 10, fontWeight: '600', color: P.textSecondary, marginTop: 2 },
  bottomBar: { flexDirection: 'row', gap: 6, paddingHorizontal: 8, paddingTop: 8, backgroundColor: P.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: P.faint, alignItems: 'center' },
  authBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: P.primary, borderRadius: 12, height: 44 },
  authBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  disabledBtn: { opacity: 0.55 },
  bottomSpacer: { height: 120 },
  storeBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: P.cardMuted, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: P.faint },
  sampleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderColor: P.primary, borderRadius: 12, paddingHorizontal: 10, height: 40 },
  sampleBtnText: { color: P.primary, fontSize: 11, fontWeight: '700' },
  startOrderBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: P.ink, borderRadius: 12, paddingHorizontal: 14, height: 40 },
  startOrderBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  outlineBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1.5, borderColor: P.primary, borderRadius: 12, height: 40 },
  outlineBtnText: { fontSize: 12, fontWeight: '700', color: P.primary },
  primaryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: P.primary, borderRadius: 12, height: 40 },
  primaryBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
});

export default React.memo(ProductDetailsScreen);
