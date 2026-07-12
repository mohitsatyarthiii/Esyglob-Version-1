import React, { useCallback, useMemo, useState, useRef } from 'react';
import {
  Alert,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery } from '@tanstack/react-query';
import { fetchProductDetails } from '../api/products';
import {
  createProductEnquiry,
  startProductChat,
  trackProductView,
} from '../api/marketplace';
import { useAuth } from '../auth/AuthContext';
import RemoteImage from '../components/RemoteImage';
import EnquiryModal from '../components/EnquiryModal';
import { useCurrency } from '../currency/CurrencyContext';
import SavedHeartButton from '../components/SavedHeartButton';
import TradeAssurance from '../components/TradeAssurance';
import ReviewsPanel from '../components/ReviewsPanel';
import { ErrorState, LoadingState } from '../components/StateViews';
import {
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

// ─── Helpers ────────────────────────────────────────────────────────────────

function extractSellerUserId(product: any): string | undefined {
  if (!product) return undefined;
  
  if (product.sellerId) {
    if (typeof product.sellerId === 'object') {
      const seller = product.sellerId as Record<string, any>;
      if (seller.userId) {
        return typeof seller.userId === 'string' ? seller.userId : seller.userId._id || seller.userId.id;
      }
      if (seller._id) return seller._id;
      if (seller.id) return seller.id;
    }
    if (typeof product.sellerId === 'string') {
      return product.sellerId;
    }
  }
  
  if (product.userId) {
    return typeof product.userId === 'string' ? product.userId : product.userId._id || product.userId.id;
  }
  
  return undefined;
}

function extractSellerRouteId(product: any): string | undefined {
  if (!product) return undefined;
  
  if (product.sellerId) {
    if (typeof product.sellerId === 'object') {
      const seller = product.sellerId as Record<string, any>;
      return seller._id || seller.id;
    }
    if (typeof product.sellerId === 'string') {
      return product.sellerId;
    }
  }
  
  return undefined;
}

function extractSellerName(product: any): string {
  if (!product) return 'Supplier';
  
  if (product.sellerId && typeof product.sellerId === 'object') {
    const seller = product.sellerId as Record<string, any>;
    if (seller.companyName) return seller.companyName;
  }
  
  if (product.companyName) return product.companyName;
  
  return 'Supplier';
}

function buildMoqTiers(product: any): MoqTier[] {
  const tiers: MoqTier[] = [];
  
  if (!product) return tiers;
  
  if (product.priceTiers && Array.isArray(product.priceTiers) && product.priceTiers.length > 0) {
    const sortedTiers = [...product.priceTiers].sort((a, b) => {
      const aMin = Number(a.minimumQuantity ?? a.minQty ?? 0);
      const bMin = Number(b.minimumQuantity ?? b.minQty ?? 0);
      return aMin - bMin;
    });

    for (const t of sortedTiers) {
      const minQty = Number(t.minimumQuantity ?? t.minQty ?? 1);
      const maxQty = t.maximumQuantity != null ? Number(t.maximumQuantity ?? t.maxQty) : null;
      const price = Number(t.unitPrice ?? t.price ?? product.price ?? 0);
      const unit = product.unit || 'pcs';
      
      tiers.push({
        minQty,
       maxQty: (typeof maxQty === 'number' && maxQty > 0) ? maxQty : null,
        price,
        unit,
      });
    }
  }
  
  if (tiers.length === 0) {
    const moq = Number(product.minimumOrderQuantity ?? product.moq ?? 1);
    tiers.push({
      minQty: moq,
      maxQty: null,
      price: Number(product.price ?? 0),
      unit: product.unit || 'pcs',
    });
  }
  
  return tiers;
}

function extractImages(product: any): string[] {
  if (!product) return [];
  
  if (Array.isArray(product.images) && product.images.length > 0) {
    return product.images;
  }
  
  if (product.image) {
    return [product.image];
  }
  
  return [];
}

// ─── MOQ Selector Component ────────────────────────────────────────────────

function MoqSelector({ 
  tiers, 
  selectedQty, 
  onSelect, 
  currency = '₹' 
}: { 
  tiers: MoqTier[]; 
  selectedQty: number; 
  onSelect: (qty: number) => void; 
  currency?: string;
}) {
  const { formatPrice } = useCurrency();
  if (!tiers || tiers.length === 0) return null;

  return (
    <View style={styles.moqSection}>
      <Text style={styles.moqTitle}>SELECT QUANTITY</Text>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.moqScrollContent}
      >
        {tiers.map((tier, index) => {
          const isActive = selectedQty >= tier.minQty && 
            (tier.maxQty ? selectedQty <= tier.maxQty : true);
          
          let label = `${tier.minQty}`;
          if (tier.maxQty) {
            label = `${tier.minQty}-${tier.maxQty}`;
          } else {
            label = `${tier.minQty}+`;
          }
          label = `${label} UNITS`;

          return (
            <TouchableOpacity
              key={index}
              onPress={() => onSelect(tier.minQty)}
              style={[
                styles.moqCard,
                isActive && styles.moqCardActive,
              ]}
            >
              <View style={styles.moqCardContent}>
                <Text style={[styles.moqCardLabel, isActive && styles.moqCardLabelActive]}>
                  {label}
                </Text>
                {isActive && (
                  <View style={styles.moqActiveBadge}>
                    <Text style={styles.moqActiveBadgeText}>Active</Text>
                  </View>
                )}
                <Text style={[styles.moqCardPrice, isActive && styles.moqCardPriceActive]}>
                  {formatPrice(tier.price, currency === '₹' ? 'INR' : currency)}
                </Text>
                <Text style={styles.moqCardUnit}>per unit</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

function InformationCard({ title, rows }: { title: string; rows: Array<[string, unknown]> }) {
  const visible = rows.filter(([, value]) => value !== undefined && value !== null && value !== '');
  if (!visible.length) return null;
  return <View style={styles.informationCard}><Text style={styles.informationTitle}>{title}</Text>{visible.map(([label, value], index) => <View key={label} style={[styles.informationRow, index === visible.length - 1 && styles.informationRowLast]}><Text style={styles.informationLabel}>{label}</Text><Text selectable style={styles.informationValue}>{String(value)}</Text></View>)}</View>;
}

// ─── Main Component ─────────────────────────────────────────────────────────

function ProductDetailsScreen() {
  const { formatPrice, selectedCurrency } = useCurrency();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { status, user, activeRole } = useAuth();
  const { productId } = route.params as { productId: string };
  const flatListRef = useRef<FlatList>(null);

  const [enquiryOpen, setEnquiryOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [targetPrice, setTargetPrice] = useState('');
  const [destinationCountry, setDestinationCountry] = useState('India');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [customSpecifications, setCustomSpecifications] = useState('');
  const [packagingRequirements, setPackagingRequirements] = useState('');
  const [deliveryRequirements, setDeliveryRequirements] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [selectedImage, setSelectedImage] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(false);

  // ── Queries ──────────────────────────────────────────────────────────────

  const productQuery = useQuery({
    queryKey: ['product', productId],
    queryFn: () => fetchProductDetails(productId),
    enabled: Boolean(productId),
    staleTime: 2 * 60_000,
  });

  const product = productQuery.data as any;

  // ── Extract data ─────────────────────────────────────────────────────────

  const sellerUserId = useMemo(() => extractSellerUserId(product), [product]);
  const sellerRouteId = useMemo(() => extractSellerRouteId(product), [product]);
  const seller = typeof product?.sellerId === 'object' && product.sellerId ? product.sellerId as Record<string, any> : undefined;
  const sellerName = useMemo(() => extractSellerName(product), [product]);
  const images = useMemo(() => extractImages(product), [product]);
  const moqTiers: MoqTier[] = useMemo(() => buildMoqTiers(product), [product]);

  // ── Auth State ───────────────────────────────────────────────────────────

  const isAuth = status === 'authenticated';
  const currentUserId = String(user?._id ?? user?.id ?? '');
  const isBuyer = isAuth && activeRole === 'buyer';
  const isSelfContact = Boolean(currentUserId && sellerUserId && currentUserId === String(sellerUserId));
  const canAct = isBuyer && Boolean(sellerUserId) && !isSelfContact;

  // ── Selected Tier ────────────────────────────────────────────────────────

  const selectedTier = useMemo(() => {
    if (moqTiers.length === 0) return null;
    const tier = moqTiers.find(t => {
      if (t.maxQty) {
        return quantity >= t.minQty && quantity <= t.maxQty;
      }
      return quantity >= t.minQty;
    });
    return tier || moqTiers[moqTiers.length - 1];
  }, [moqTiers, quantity]);

  // ── Initialize quantity ─────────────────────────────────────────────────

  React.useEffect(() => {
    if (moqTiers.length > 0) {
      setQuantity(moqTiers[0].minQty);
      if (moqTiers[0].price > 0) {
        setTargetPrice(String(moqTiers[0].price));
      }
    }
  }, [moqTiers]);

  // ── Track view ──────────────────────────────────────────────────────────

  React.useEffect(() => {
    if (product && status === 'authenticated') {
      const id = product._id || product.id;
      if (id) trackProductView(id).catch(() => {});
    }
  }, [product, status]);

  // ── Mutations ──────────────────────────────────────────────────────────

  const chatNow = useMutation({
    mutationFn: async () => {
      if (!product) throw new Error('Product not loaded.');
      if (!isBuyer) throw new Error('Switch to buyer mode to contact this supplier.');
      if (isSelfContact) throw new Error('You cannot start a chat with your own seller account.');
      if (!sellerUserId) throw new Error('Seller contact not available.');
      
      const selectedProductId = product._id || product.id;
      if (!selectedProductId) throw new Error('Product ID not available.');

      return startProductChat({
        otherUserId: sellerUserId,
        productId: selectedProductId,
        role: 'buyer',
        enquiry: false,
      });
    },
    onSuccess: (result: any) => {
      if (result.chat) {
        const chatId = result.chat._id || result.chat.id;
        navigation.navigate('ChatDetails', {
          chatId: chatId,
          title: sellerName || 'Supplier',
        });
      }
    },
    onError: (error: any) => {
      Alert.alert('Error', error?.message || 'Failed to start chat.');
    },
  });

  const sendEnquiry = useMutation({
    mutationFn: async () => {
      if (!product) throw new Error('Product not loaded.');
      if (!isBuyer) throw new Error('Switch to buyer mode to send an enquiry.');
      if (isSelfContact) throw new Error('You cannot send an enquiry to your own seller account.');
      if (!sellerUserId) throw new Error('Seller information missing.');
      
      const selectedProductId = product._id || product.id;
      if (!selectedProductId) throw new Error('Product ID not available.');

      return createProductEnquiry({
        productId: selectedProductId,
        sellerUserId: sellerUserId,
        productName: product.name || product.title || 'Product',
        quantity: quantity || 1,
        unit: product.unit || 'pcs',
        targetPrice: targetPrice ? Number(targetPrice) : undefined,
        destinationCountry: destinationCountry.trim() || 'India',
        customSpecifications: customSpecifications.trim() || undefined,
        packagingRequirements: packagingRequirements.trim() || undefined,
        deliveryRequirements: deliveryRequirements.trim() || undefined,
        additionalNotes: additionalNotes.trim() || undefined,
        attachments: attachments.map(a => ({ filename: a.name, type: a.type })),
        currency: product.currency || 'INR',
        deliveryTimeline: 'flexible',
        incoterms: 'FOB',
      });
    },
    onSuccess: (result: any) => {
      setEnquiryOpen(false);
      setAttachments([]);
      if (result.chat) {
        const chatId = result.chat._id || result.chat.id;
        navigation.navigate('ChatDetails', {
          chatId: chatId,
          title: sellerName || 'Supplier',
        });
      } else if (result.rfq) {
        Alert.alert('✓ Enquiry Sent', 'The supplier will respond shortly.');
      }
    },
    onError: (error: any) => {
      Alert.alert('Enquiry Failed', error?.message || 'Unable to send enquiry.');
    },
  });

  // ── Navigation ──────────────────────────────────────────────────────────

  const goToStore = useCallback(() => {
    if (!sellerRouteId) {
      Alert.alert('Error', 'Seller information not available.');
      return;
    }
    navigation.navigate('SellerDetails', { 
      sellerId: sellerRouteId,
      sellerName: sellerName,
    });
  }, [sellerRouteId, sellerName, navigation]);

  const goToSampleOrder = useCallback(() => {
    if (!product) return;
    const id = product._id || product.id;
    if (id) {
      navigation.navigate('OrderCheckout', { 
        mode: 'sample', 
        productId: id,
      });
    }
  }, [product, navigation]);

  const shareProduct = () => {
    if (!product) return;
    Share.share({ 
      message: `${product.name || 'Product'}\n${formatPrice(Number(product.price ?? 0), product.currency ?? 'INR')}` 
    });
  };

  // ── Gallery ─────────────────────────────────────────────────────────────

  const gallery: string[] = images.length > 0 ? images : [''];

  const onMainImageScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (index !== selectedImage) setSelectedImage(index);
  };

  const scrollToImage = (index: number) => {
    flatListRef.current?.scrollToIndex({ index, animated: true });
    setSelectedImage(index);
  };

  // ── Loading / Error ────────────────────────────────────────────────────

  if (productQuery.isLoading) return <LoadingState label="Loading product..." />;
  if (productQuery.isError || !product) {
    return (
      <ErrorState
        message={(productQuery.error as any)?.message ?? 'Product not found'}
        onRetry={() => productQuery.refetch()}
      />
    );
  }

  // ── Data for rendering ──────────────────────────────────────────────────

  const currency = selectedCurrency;
  const totalMoqValue = selectedTier 
    ? selectedTier.price * quantity 
    : (product.price || 0) * quantity;
  const samplePrice = product.samplePrice || product.price || 2000;
  const rating = product.averageRating || 0;
  const reviewCount = product.reviewCount || 0;
  const totalOrders = product.totalOrders || 0;

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={P.surface} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Icon name="arrow-left" size={22} color={P.ink} />
        </TouchableOpacity>
        <Text numberOfLines={1} style={styles.headerTitle}>
          Home / Products / {product.name?.slice(0, 20)}...
        </Text>
        <TouchableOpacity onPress={shareProduct} style={styles.headerBtn}>
          <Icon name="share-variant-outline" size={20} color={P.ink} />
        </TouchableOpacity>
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={styles.scrollContent}
      >
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
            getItemLayout={(_, index) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * index, index })}
            renderItem={({ item: uri }) => (
              <Pressable onPress={() => setGalleryOpen(true)} style={styles.gallerySlide}>
                <RemoteImage 
                  uri={uri} 
                  width={900} 
                  height={400} 
                  resizeMode="contain" 
                  style={styles.galleryImage} 
                  fallback={<Icon name="image-off" size={40} color={P.muted} />} 
                />
              </Pressable>
            )}
          />
          
          {/* Active Badge */}
          <View style={styles.activeBadge}>
            <Text style={styles.activeBadgeText}>Active</Text>
          </View>

          {/* Save Heart */}
          <SavedHeartButton 
            type="product" 
            itemId={product._id || product.id || ''} 
            target={product} 
            size={16} 
            style={styles.heartBtn} 
            iconColor={P.ink} 
          />

          {/* Pagination Dots */}
          {gallery.length > 1 && (
            <View style={styles.paginationRow}>
              {gallery.map((_, i) => (
                <TouchableOpacity 
                  key={i} 
                  onPress={() => scrollToImage(i)} 
                  style={[styles.dot, selectedImage === i && styles.dotActive]} 
                />
              ))}
            </View>
          )}

          {/* Image Counter */}
          <View style={styles.imageCounter}>
            <Text style={styles.imageCounterText}>{selectedImage + 1}/{gallery.length}</Text>
          </View>
        </View>

        {gallery.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbnailRow}>{gallery.map((uri, index) => <TouchableOpacity accessibilityLabel={`Show product image ${index + 1}`} key={`${uri}-thumb-${index}`} onPress={() => scrollToImage(index)} style={[styles.thumbnailButton, selectedImage === index && styles.thumbnailButtonActive]}><RemoteImage uri={uri} width={58} height={58} resizeMode="cover" style={styles.thumbnailImage} /></TouchableOpacity>)}</ScrollView> : null}

        {/* Product Name */}
        <View style={styles.nameSection}>
          <Text style={styles.productName}>{product.name}</Text>
        </View>

        {/* Category Chips */}
        {product.variants && product.variants.length > 0 && (
          <View style={styles.chipSection}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.variantScroll}>
              {product.variants.map((variant: any, index: number) => {
                const label = variant.name || variant.label || variant.value || `Option ${index + 1}`;
                return (
                  <TouchableOpacity
                    key={`${label}-${index}`}
                    style={styles.variantChip}
                  >
                    <Text style={styles.variantChipText}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* MOQ Selector */}
        <MoqSelector 
          tiers={moqTiers} 
          selectedQty={quantity} 
          onSelect={(qty) => {
            setQuantity(qty);
            const tier = moqTiers.find(t => 
              t.maxQty ? qty >= t.minQty && qty <= t.maxQty : qty >= t.minQty
            );
            if (tier?.price) {
              setTargetPrice(String(tier.price));
            }
          }} 
          currency={currency}
        />

        {/* Price and Metrics */}
        <View style={styles.priceSection}>
          <View style={styles.priceRow}>
            <Text style={styles.price}>
              {formatPrice(Number(selectedTier?.price ?? product.price ?? 0), product.currency ?? 'INR')}
              <Text style={styles.priceUnit}> /unit</Text>
            </Text>
          </View>

          <View style={styles.metricsRow}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Total MOQ Value:</Text>
              <Text style={styles.metricValue}>
                {formatPrice(totalMoqValue, product.currency ?? 'INR')}
              </Text>
            </View>
            <Text style={styles.metricSubtext}>Price updates instantly from selected MOQ</Text>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>MOQ</Text>
              <Text style={styles.statValue}>{quantity}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>ORDERS</Text>
              <Text style={styles.statValue}>{totalOrders}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>RATING</Text>
              <View style={styles.ratingRow}>
                <Icon name="star" size={14} color={P.amber} />
                <Text style={styles.statValue}>{rating.toFixed(1)} ({reviewCount})</Text>
              </View>
            </View>
          </View>

          {/* Sample Order Button */}
          <TouchableOpacity 
            onPress={goToSampleOrder} 
            style={styles.sampleOrderBtn}
          >
            <Text style={styles.sampleOrderText}>
              Sample Available {formatPrice(Number(samplePrice), product.currency ?? 'INR')} - Order Sample →
            </Text>
          </TouchableOpacity>
        </View>

        {/* Trust Badges */}
        <View style={styles.trustRow}>
          <View style={styles.trustItem}>
            <Icon name="shield-check" size={16} color={P.primary} />
            <Text style={styles.trustText}>Secure</Text>
          </View>
          <View style={styles.trustItem}>
            <Icon name="earth" size={16} color={P.primary} />
            <Text style={styles.trustText}>Global</Text>
          </View>
          <View style={styles.trustItem}>
            <Icon name="star-four-points" size={16} color={P.primary} />
            <Text style={styles.trustText}>Quality</Text>
          </View>
        </View>

        <InformationCard title="Product information" rows={[
          ['Category', typeof product.category === 'object' ? product.category?.name : product.category], ['Brand', product.brand], ['Model', product.model ?? product.modelNumber], ['SKU', product.sku], ['HSN', product.hsn ?? product.hsnCode], ['Origin', product.countryOfOrigin ?? product.originCountry], ['Available quantity', product.stock ?? product.availableQuantity], ['Status', product.status], ['Manufacturer', product.manufacturer], ['Supply ability', product.supplyAbility], ['Warranty', product.warranty],
        ]} />
        {product.description ? <View style={styles.informationCard}><Text style={styles.informationTitle}>Product description</Text><Text selectable style={styles.descriptionText}>{String(product.description).replace(/<[^>]*>/g, '')}</Text></View> : null}
        <InformationCard title="Specifications" rows={Object.entries(product.specifications ?? product.attributes ?? {}).map(([key, value]) => [key.replace(/_/g, ' '), value])} />
        <InformationCard title="Delivery & shipping" rows={[
          ['Estimated delivery', product.estimatedDelivery ?? product.deliveryTime], ['Shipping method', product.shippingMethod], ['Dispatch time', product.dispatchTime ?? product.leadTime], ['Incoterms', Array.isArray(product.incoterms) ? product.incoterms.join(', ') : product.incoterms], ['Packaging', product.packagingDetails ?? product.packaging], ['Freight information', product.freightInformation], ['Shipping policy', product.shippingPolicy],
        ]} />
        <InformationCard title="Manufacturer" rows={[
          ['Company', seller?.companyName ?? seller?.name], ['Location', seller?.location ?? seller?.country], ['Business type', seller?.businessType], ['Years in business', seller?.yearsInBusiness], ['Response rate', seller?.responseRate], ['Rating', seller?.rating], ['Completed orders', seller?.completedOrders],
        ]} />
        <View style={styles.informationCard}><ReviewsPanel productId={productId} sellerId={sellerRouteId} showForm title="Ratings & reviews" /></View>

        {/* Trade Assurance */}
        <TradeAssurance />

        <View style={styles.bottomSpacer} />
      </ScrollView>

      <View style={styles.actionRow}>
        <TouchableOpacity accessibilityLabel="View supplier store" disabled={!sellerRouteId} onPress={goToStore} style={styles.storeIconButton}><Icon name="storefront-outline" size={23} color={P.primary} /><Text style={styles.storeIconLabel}>Store</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => { if (!isAuth) { navigation.navigate('Auth', { initialMode: 'login' }); return; } if (!isBuyer) { Alert.alert('Switch Role', 'Please switch to buyer mode to chat.'); return; } chatNow.mutate(); }} style={[styles.chatBtn, (!canAct || chatNow.isPending) && styles.disabledBtn]} disabled={!canAct || chatNow.isPending}><Icon name="message-text-outline" size={18} color={P.primary} /><Text style={styles.chatButtonText}>{chatNow.isPending ? 'Opening…' : 'Chat Now'}</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => { if (!isAuth) { navigation.navigate('Auth', { initialMode: 'login' }); return; } if (!isBuyer) { Alert.alert('Switch Role', 'Please switch to buyer mode to send enquiry.'); return; } setEnquiryOpen(true); }} style={[styles.inquiryBtn, (!canAct || sendEnquiry.isPending) && styles.disabledBtn]} disabled={!canAct || sendEnquiry.isPending}><Icon name="send-outline" size={18} color="#FFF" /><Text style={styles.inquiryPrimaryText}>{sendEnquiry.isPending ? 'Sending…' : 'Send Enquiry'}</Text></TouchableOpacity>
      </View>

      {/* Gallery Lightbox */}
      <Modal visible={galleryOpen} animationType="fade" onRequestClose={() => setGalleryOpen(false)}>
        <View style={styles.lightbox}>
          <TouchableOpacity onPress={() => setGalleryOpen(false)} style={styles.lightboxClose}>
            <Icon name="close" size={26} color="#FFF" />
          </TouchableOpacity>
          <FlatList
            horizontal
            pagingEnabled
            data={gallery}
            initialScrollIndex={selectedImage}
            keyExtractor={(uri, index) => `${uri}-full-${index}`}
            getItemLayout={(_, index) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * index, index })}
            renderItem={({ item: uri }) => (
              <View style={styles.lightboxSlide}>
                <RemoteImage 
                  uri={uri} 
                  width={SCREEN_WIDTH} 
                  height={SCREEN_WIDTH} 
                  resizeMode="contain" 
                  style={styles.lightboxImage} 
                />
              </View>
            )}
          />
        </View>
      </Modal>

      <EnquiryModal visible={enquiryOpen} productName={product.name || product.title || 'Product'} defaultQuantity={String(quantity)} defaultUnit={product.unit || 'piece'} pending={sendEnquiry.isPending} quantity={String(quantity)} targetPrice={targetPrice} destinationCountry={destinationCountry} additionalNotes={additionalNotes} customSpecifications={customSpecifications} packagingRequirements={packagingRequirements} deliveryRequirements={deliveryRequirements} attachments={attachments} onQuantityChange={value => setQuantity(Math.max(1, Number(value) || 1))} onTargetPriceChange={setTargetPrice} onDestinationChange={setDestinationCountry} onNotesChange={setAdditionalNotes} onSpecificationsChange={setCustomSpecifications} onPackagingChange={setPackagingRequirements} onDeliveryChange={setDeliveryRequirements} onAttachmentsChange={setAttachments} onClose={() => setEnquiryOpen(false)} onSubmit={() => sendEnquiry.mutate()} />
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: P.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: P.surface,
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: P.border,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: P.cardMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 11,
    fontWeight: '500',
    color: P.muted,
    textAlign: 'center',
  },
  scrollContent: {
    paddingBottom: 120,
  },
  bottomSpacer: {
    height: 100,
  },
  
  // Gallery
  galleryWrap: {
    position: 'relative',
    backgroundColor: P.surface,
    overflow: 'hidden',
  },
  gallerySlide: {
    width: SCREEN_WIDTH,
    height: 400,
  },
  galleryImage: {
    width: SCREEN_WIDTH,
    height: 400,
    backgroundColor: P.surface,
  },
  activeBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: P.emerald,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  activeBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
  },
  heartBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 16,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paginationRow: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  dotActive: {
    backgroundColor: P.primary,
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  imageCounter: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  imageCounterText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '600',
  },
  thumbnailRow: { paddingHorizontal: 12, paddingVertical: 10, gap: 9, backgroundColor: P.surface },
  thumbnailButton: { width: 62, height: 62, borderRadius: 9, borderWidth: 1, borderColor: P.border, padding: 2, overflow: 'hidden' },
  thumbnailButtonActive: { borderColor: P.primary, borderWidth: 2 },
  thumbnailImage: { width: '100%', height: '100%', borderRadius: 6 },

  // Product Name
  nameSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: P.surface,
  },
  productName: {
    fontSize: 16,
    fontWeight: '700',
    color: P.ink,
    lineHeight: 22,
  },

  // Category Chips
  chipSection: {
    backgroundColor: P.surface,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  variantScroll: {
    flexDirection: 'row',
  },
  variantChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: P.cardMuted,
    marginRight: 8,
    borderWidth: 1,
    borderColor: P.faint,
  },
  variantChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: P.textSecondary,
  },

  // MOQ Selector
  moqSection: {
    backgroundColor: P.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 6,
  },
  moqTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: P.muted,
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  moqScrollContent: {
    gap: 8,
    paddingRight: 16,
  },
  moqCard: {
    minWidth: 120,
    padding: 12,
    borderRadius: 8,
    backgroundColor: P.cardMuted,
    borderWidth: 1,
    borderColor: P.faint,
  },
  moqCardActive: {
    backgroundColor: P.primaryLight,
    borderColor: P.primary,
    borderWidth: 2,
  },
  moqCardContent: {
    alignItems: 'center',
  },
  moqCardLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: P.textSecondary,
    marginBottom: 2,
  },
  moqCardLabelActive: {
    color: P.primaryDark,
  },
  moqActiveBadge: {
    backgroundColor: P.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    marginBottom: 4,
  },
  moqActiveBadgeText: {
    color: '#FFF',
    fontSize: 8,
    fontWeight: '700',
  },
  moqCardPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: P.ink,
  },
  moqCardPriceActive: {
    color: P.primaryDark,
  },
  moqCardUnit: {
    fontSize: 9,
    color: P.muted,
    fontWeight: '500',
  },

  // Price Section
  priceSection: {
    backgroundColor: P.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 6,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  price: {
    fontSize: 22,
    fontWeight: '800',
    color: P.ink,
  },
  priceUnit: {
    fontSize: 13,
    fontWeight: '500',
    color: P.muted,
  },
  metricsRow: {
    marginBottom: 10,
  },
  metricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metricLabel: {
    fontSize: 12,
    color: P.muted,
    fontWeight: '500',
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '700',
    color: P.ink,
  },
  metricSubtext: {
    fontSize: 10,
    color: P.muted,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: P.cardMuted,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: P.muted,
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700',
    color: P.ink,
    marginTop: 2,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: P.faint,
  },
  sampleOrderBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: P.primaryLight,
    borderRadius: 6,
    alignItems: 'center',
  },
  sampleOrderText: {
    fontSize: 12,
    fontWeight: '600',
    color: P.primaryDark,
  },

  // Action Buttons
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 14,
    backgroundColor: P.surface,
    borderTopWidth: 1,
    borderTopColor: P.border,
  },
  storeIconButton: { width: 54, minHeight: 50, borderRadius: 12, borderWidth: 1, borderColor: P.border, alignItems: 'center', justifyContent: 'center', backgroundColor: P.surface },
  storeIconLabel: { color: P.primary, fontSize: 9, fontWeight: '700', marginTop: 2 },
  chatBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: P.surface,
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: P.primary,
  },
  inquiryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: P.primary,
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: P.primary,
  },
  btnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  inquiryBtnText: {
    color: P.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  chatButtonText: { color: P.primary, fontSize: 13, fontWeight: '800' },
  inquiryPrimaryText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  disabledBtn: {
    opacity: 0.5,
  },
  storeAction: { marginHorizontal: 16, marginBottom: 8, height: 42, borderRadius: 8, borderWidth: 1, borderColor: P.primary, backgroundColor: P.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  storeActionText: { color: P.primary, fontSize: 13, fontWeight: '700' },
  informationCard: { backgroundColor: P.surface, marginTop: 8, paddingHorizontal: 16, paddingVertical: 16, borderTopWidth: 1, borderBottomWidth: 1, borderColor: P.border },
  informationTitle: { fontSize: 17, fontWeight: '800', color: P.ink, marginBottom: 12 },
  informationRow: { flexDirection: 'row', gap: 16, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: P.faint },
  informationRowLast: { borderBottomWidth: 0 },
  informationLabel: { width: '38%', color: P.textSecondary, fontSize: 12, textTransform: 'capitalize' },
  informationValue: { flex: 1, textAlign: 'right', color: P.ink, fontSize: 12, fontWeight: '600' },
  descriptionText: { color: P.text, fontSize: 14, lineHeight: 22 },

  // Trust Row
  trustRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: P.surface,
    marginTop: 6,
  },
  trustItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  trustText: {
    fontSize: 12,
    fontWeight: '600',
    color: P.textSecondary,
  },

  // Lightbox
  lightbox: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
  },
  lightboxClose: {
    position: 'absolute',
    top: 40,
    right: 16,
    zIndex: 10,
    padding: 8,
  },
  lightboxSlide: {
    width: SCREEN_WIDTH,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH,
  },
});

export default React.memo(ProductDetailsScreen);
