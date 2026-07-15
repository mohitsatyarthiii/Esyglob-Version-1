import React, { useCallback, useMemo, useState, useRef } from 'react';
import {
  ActivityIndicator,
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
import { fetchProductDetails, fetchProducts } from '../api/products';
import {
  createProductEnquiry,
  startProductChat,
  trackProductView,
  uploadFiles,
} from '../api/marketplace';
import { useAuth } from '../auth/AuthContext';
import RemoteImage from '../components/RemoteImage';
import EnquiryModal from '../components/EnquiryModal';
import { useCurrency } from '../currency/CurrencyContext';
import SavedHeartButton from '../components/SavedHeartButton';
import TradeAssurance from '../components/TradeAssurance';
import ReviewsPanel from '../components/ReviewsPanel';
import ProductCard from '../components/ProductCard';
import { ErrorState, LoadingState } from '../components/StateViews';

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

// ─── Palette - Corporate Blue Theme ──────────────────────────────────────

const P = {
  bg: '#F5F6FA',
  surface: '#FFFFFF',
  primary: '#2563EB',        // Corporate Blue
  primaryLight: '#EFF6FF',
  primaryDark: '#1D4ED8',
  primaryLighter: '#DBEAFE',
  text: '#1E293B',
  textSecondary: '#64748B',
  textLight: '#94A3B8',
  muted: '#E2E8F0',
  faint: '#F1F5F9',
  border: '#E2E8F0',
  cardBg: '#F8FAFC',
  green: '#10B981',
  gold: '#F59E0B',
  star: '#F59E0B',
  shadow: 'rgba(37, 99, 235, 0.1)',
  white: '#FFFFFF',
  black: '#0F172A',
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
  
  // Check for priceTiers array
  if (product.priceTiers && Array.isArray(product.priceTiers) && product.priceTiers.length > 0) {
    const sortedTiers = [...product.priceTiers].sort((a, b) => {
      const aMin = Number(a.minimumQuantity ?? 0);
      const bMin = Number(b.minimumQuantity ?? 0);
      return aMin - bMin;
    });

    for (const t of sortedTiers) {
      const minQty = Math.max(1, Number(t.minimumQuantity ?? 1));
      const rawMax = t.maximumQuantity;
      const maxQty = rawMax != null ? Number(rawMax) : null;
      const price = Number(t.unitPrice ?? 0);
      
      tiers.push({
        minQty: Number.isFinite(minQty) ? minQty : 1,
        maxQty: (typeof maxQty === 'number' && Number.isFinite(maxQty) && maxQty >= minQty) ? maxQty : null,
        price: Number.isFinite(price) ? price : 0,
        unit: product.unit || 'pcs',
      });
    }
  }
  
  // If no priceTiers, create single tier from product data
  if (tiers.length === 0) {
    const moq = Math.max(1, Number(product.minimumOrderQuantity ?? 1));
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

// ─── MOQ Selector Component - Fixed Active State ──────────────────────────

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

  // Find which tier matches the selected quantity
  const getActiveTier = useCallback(() => {
    return tiers.find(tier => {
      if (tier.maxQty) {
        return selectedQty >= tier.minQty && selectedQty <= tier.maxQty;
      }
      return selectedQty >= tier.minQty;
    });
  }, [tiers, selectedQty]);

  const activeTier = getActiveTier();

  if (!tiers || tiers.length === 0) return null;

  // Handle tier selection - sets quantity to the tier's minimum
  const handleTierSelect = (tier: MoqTier) => {
    onSelect(tier.minQty);
  };

  return (
    <View style={moqStyles.container}>
      <View style={moqStyles.header}>
        <Text style={moqStyles.title}>Select Quantity Range</Text>
        <Text style={moqStyles.selectedQty}>{selectedQty} units selected</Text>
      </View>
      
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={moqStyles.scrollContent}
      >
        {tiers.map((tier, index) => {
          // Determine if this tier is active - compare exact tier object
          const isActive = activeTier === tier || 
            (activeTier && 
             activeTier.minQty === tier.minQty && 
             activeTier.maxQty === tier.maxQty);
          
          let label = '';
          if (tier.maxQty) {
            label = `${tier.minQty} - ${tier.maxQty}`;
          } else {
            label = `${tier.minQty}+`;
          }

          return (
            <TouchableOpacity
              key={index}
              onPress={() => handleTierSelect(tier)}
              activeOpacity={0.7}
              style={[
                moqStyles.card,
                isActive && moqStyles.cardActive,
              ]}
            >
              <Text style={[
                moqStyles.qty,
                isActive && moqStyles.qtyActive
              ]}>
                {label}
              </Text>
              <Text style={[
                moqStyles.price,
                isActive && moqStyles.priceActive
              ]}>
                {formatPrice(tier.price, 'INR')}
              </Text>
              <Text style={[
                moqStyles.perUnit,
                isActive && moqStyles.perUnitActive
              ]}>
                /unit
              </Text>
              {isActive && (
                <View style={moqStyles.activeIndicator}>
                  <Icon name="check-circle" size={12} color={P.white} />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Active Selection Summary */}
      {activeTier && (
        <View style={moqStyles.summary}>
          <Text style={moqStyles.summaryText}>
            Selected: <Text style={moqStyles.summaryHighlight}>
              {activeTier.minQty}{activeTier.maxQty ? ` - ${activeTier.maxQty}` : '+'} units
            </Text>
            {' at '}
            <Text style={moqStyles.summaryHighlight}>
              {formatPrice(activeTier.price, 'INR')}
            </Text>
            /unit
          </Text>
        </View>
      )}
    </View>
  );
}

const moqStyles = StyleSheet.create({
  container: {
    backgroundColor: P.surface,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: P.faint,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    color: P.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  selectedQty: {
    fontSize: 12,
    fontWeight: '600',
    color: P.primary,
  },
  scrollContent: {
    paddingHorizontal: 2,
    gap: 8,
  },
  card: {
    backgroundColor: P.cardBg,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: P.border,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minWidth: 85,
    alignItems: 'center',
    position: 'relative',
  },
  cardActive: {
    backgroundColor: P.primary,
    borderColor: P.primary,
    shadowColor: P.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  qty: {
    fontSize: 15,
    fontWeight: '700',
    color: P.text,
    marginBottom: 4,
  },
  qtyActive: {
    color: P.white,
  },
  price: {
    fontSize: 14,
    fontWeight: '600',
    color: P.text,
    marginBottom: 2,
  },
  priceActive: {
    color: P.white,
  },
  perUnit: {
    fontSize: 10,
    fontWeight: '500',
    color: P.textLight,
  },
  perUnitActive: {
    color: 'rgba(255,255,255,0.8)',
  },
  activeIndicator: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: P.green,
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summary: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: P.primaryLight,
    borderRadius: 6,
    alignItems: 'center',
  },
  summaryText: {
    fontSize: 12,
    color: P.textSecondary,
  },
  summaryHighlight: {
    fontWeight: '700',
    color: P.primaryDark,
  },
});

// ─── Info Card Component ──────────────────────────────────────────────────

function InfoCard({ title, rows }: { title: string; rows: Array<[string, unknown]> }) {
  const visible = rows.filter(([, value]) => value !== undefined && value !== null && value !== '');
  if (!visible.length) return null;
  
  return (
    <View style={infoStyles.container}>
      <Text style={infoStyles.title}>{title}</Text>
      {visible.map(([label, value], index) => (
        <View key={label} style={[
          infoStyles.row,
          index === visible.length - 1 && infoStyles.rowLast
        ]}>
          <Text style={infoStyles.label}>{label}</Text>
          <Text selectable style={infoStyles.value}>{String(value)}</Text>
        </View>
      ))}
    </View>
  );
}

const infoStyles = StyleSheet.create({
  container: {
    backgroundColor: P.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 6,
    borderBottomWidth: 1,
    borderBottomColor: P.faint,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: P.text,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: P.faint,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  label: {
    fontSize: 12,
    color: P.textSecondary,
    flex: 1,
  },
  value: {
    fontSize: 12,
    color: P.text,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },
});

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
  const initializedMoqProductRef = useRef<string>('');

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
  
  // Related Products Queries
  const relatedQuery1 = useQuery({
    queryKey: ['related-products-1', productId, product?.categoryId ?? product?.category],
    queryFn: () => fetchProducts({ category: typeof product?.categoryId === 'object' ? String(product.categoryId._id ?? product.categoryId.id ?? product.categoryId.name ?? '') : String(product?.categoryId ?? product?.category ?? ''), limit: 10 }),
    enabled: Boolean(product && (product.categoryId || product.category)),
    staleTime: 2 * 60_000,
  });

  const relatedQuery2 = useQuery({
    queryKey: ['related-products-2', productId],
    queryFn: () => fetchProducts({ limit: 10, exclude: productId }),
    enabled: Boolean(product),
    staleTime: 2 * 60_000,
  });

  const relatedQuery3 = useQuery({
    queryKey: ['related-products-3', productId, product?.brand],
    queryFn: () => fetchProducts({ brand: product?.brand, limit: 10 }),
    enabled: Boolean(product && product?.brand),
    staleTime: 2 * 60_000,
  });

  const relatedProducts1 = useMemo(() => (relatedQuery1.data?.products ?? []).filter(item => String(item._id ?? item.id) !== String(productId)).slice(0, 8), [relatedQuery1.data?.products, productId]);
  const relatedProducts2 = useMemo(() => (relatedQuery2.data?.products ?? []).filter(item => String(item._id ?? item.id) !== String(productId)).slice(0, 8), [relatedQuery2.data?.products, productId]);
  const relatedProducts3 = useMemo(() => (relatedQuery3.data?.products ?? []).filter(item => String(item._id ?? item.id) !== String(productId)).slice(0, 8), [relatedQuery3.data?.products, productId]);

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
    if (tier) return tier;
    if (quantity < moqTiers[0].minQty) return moqTiers[0];
    return [...moqTiers].reverse().find(item => quantity >= item.minQty) ?? moqTiers[0];
  }, [moqTiers, quantity]);

  // ── Initialize quantity ─────────────────────────────────────────────────

  React.useEffect(() => {
    if (moqTiers.length > 0 && initializedMoqProductRef.current !== productId) {
      initializedMoqProductRef.current = productId;
      setQuantity(moqTiers[0].minQty);
      if (moqTiers[0].price > 0) {
        setTargetPrice(String(moqTiers[0].price));
      }
    }
  }, [moqTiers, productId]);

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

      const uploadedAttachments = attachments.length
        ? await uploadFiles('product-enquiries', attachments)
        : undefined;
      const cloudFiles = uploadedAttachments?.uploads ?? uploadedAttachments?.files ?? [];

      if (attachments.length && cloudFiles.length !== attachments.length) {
        throw new Error('One or more attachments could not be uploaded. Please retry.');
      }

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
        attachments: cloudFiles.map((file, index) => ({
          filename: file.name ?? attachments[index]?.name ?? 'Attachment',
          type: file.mimeType ?? attachments[index]?.type ?? 'application/octet-stream',
          url: file.secure_url ?? file.url ?? file.location,
        })),
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

  const totalMoqValue = selectedTier 
    ? selectedTier.price * quantity 
    : (product.price || 0) * quantity;
  const samplePrice = product.samplePrice || product.price || 2000;
  const rating = product.averageRating || 0;
  const reviewCount = product.reviewCount || 0;
  const totalOrders = product.totalOrders || 0;

  // Build comprehensive product details rows
  const productDetailsRows = [
    ['Category', typeof product.category === 'object' ? product.category?.name : product.category],
    ['Subcategory', typeof product.subcategory === 'object' ? product.subcategory?.name : product.subcategory],
    ['Brand', product.brand],
    ['Model', product.model ?? product.modelNumber],
    ['SKU', product.sku],
    ['HSN Code', product.hsn ?? product.hsnCode],
    ['Country of Origin', product.countryOfOrigin ?? product.originCountry],
    ['Stock Quantity', product.stockQuantity ?? product.stock],
    ['Status', product.status],
    ['Product Type', product.productType],
    ['Manufacturer', product.manufacturer],
    ['Supply Ability', product.supplyAbility],
    ['Warranty', product.warranty],
    ['Warranty Period', product.warrantyPeriod],
    ['Certifications', product.certifications?.map((c: any) => c.name).join(', ')],
    ['Sample Available', product.sampleAvailable ? 'Yes' : 'No'],
    ['Direct Order', product.directOrderEnabled ? 'Enabled' : 'Disabled'],
  ];

  const shippingRows = [
    ['Lead Time', product.leadTime ? `${product.leadTime.value} ${product.leadTime.unit}` : null],
    ['Delivery Time', product.deliveryTime ? `${product.deliveryTime.value} ${product.deliveryTime.unit}` : null],
    ['Shipping Methods', product.shipping?.methods?.join(', ')],
    ['Origin Port', product.shipping?.originPort],
    ['Shipping Countries', product.shipping?.countries?.join(', ')],
    ['Estimate', product.shipping?.estimateText],
    ['Payment Terms', product.paymentTerms],
    ['Trade Terms', product.tradeTerms?.join(', ')],
    ['Packaging Type', product.packaging?.type],
    ['Packaging Weight', product.packaging?.weight],
    ['Packaging Dimensions', product.packaging?.dimensions],
    ['Units Per Package', product.packaging?.unitsPerPackage],
    ['Custom Packaging', product.packaging?.customizationAvailable ? 'Available' : 'Not Available'],
  ];

  const manufacturingRows = [
    ['Process Type', product.manufacturingDetails?.processType],
    ['Capacity', product.manufacturingDetails?.capacity],
    ['Automation Level', product.manufacturingDetails?.automationLevel],
  ];

  // Render Product Grid for Related Products
  const renderProductGrid = (products: any[], title: string) => {
    if (products.length === 0) return null;
    
    return (
      <View style={gridStyles.container}>
        <Text style={gridStyles.title}>{title}</Text>
        <View style={gridStyles.grid}>
          {products.map((item) => (
            <View key={String(item._id ?? item.id)} style={gridStyles.gridItem}>
              <ProductCard product={item} variant="grid" />
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={P.surface} />

      {/* Header - Corporate Blue Style */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Icon name="arrow-left" size={22} color={P.text} />
        </TouchableOpacity>
        <Text numberOfLines={1} style={styles.headerTitle}>
          Product Details
        </Text>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={shareProduct} style={styles.headerBtn}>
            <Icon name="share-variant-outline" size={20} color={P.text} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={styles.scrollContent}
      >
        {/* Gallery with Thumbnails */}
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
                  resizeMode="cover" 
                  style={styles.galleryImage} 
                  fallback={<Icon name="image-off" size={40} color={P.textLight} />} 
                />
              </Pressable>
            )}
          />
          
          {/* Save Heart */}
          <SavedHeartButton 
            type="product" 
            itemId={product._id || product.id || ''} 
            target={product} 
            size={16} 
            style={styles.heartBtn} 
            iconColor={P.text} 
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
        </View>

        {/* Thumbnail Gallery - All images visible */}
        {gallery.length > 1 && (
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.thumbnailRow}
          >
            {gallery.map((uri, index) => (
              <TouchableOpacity
                key={`thumb-${index}`}
                onPress={() => scrollToImage(index)}
                style={[
                  styles.thumbnailButton,
                  selectedImage === index && styles.thumbnailButtonActive
                ]}
              >
                <RemoteImage 
                  uri={uri} 
                  width={70} 
                  height={70} 
                  resizeMode="cover" 
                  style={styles.thumbnailImage} 
                />
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Product Info - Corporate Blue Style */}
        <View style={styles.productInfo}>
          <Text style={styles.productBrand}>{sellerName}</Text>
          <Text style={styles.productName}>{product.name}</Text>
          
          <View style={styles.ratingRow}>
            <View style={styles.ratingBadge}>
              <Icon name="star" size={12} color="#FFF" />
              <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
            </View>
            <Text style={styles.reviewCount}>{reviewCount} Reviews</Text>
            <Text style={styles.dotSeparator}>•</Text>
            <Text style={styles.orderCount}>{totalOrders} Orders</Text>
          </View>

          {/* Price */}
          <View style={styles.priceRow}>
            <Text style={styles.price}>
              {formatPrice(Number(selectedTier?.price ?? product.price ?? 0), product.currency ?? 'INR')}
            </Text>
            <Text style={styles.priceSubtext}>/ {product.unit || 'unit'}</Text>
          </View>
          <Text style={styles.priceNote}>Total: {formatPrice(totalMoqValue, product.currency ?? 'INR')}</Text>
        </View>

        {/* MOQ Selector - Fixed Active State */}
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
          currency={selectedCurrency}
        />

        {/* Sample Order - Corporate Blue */}
        {product.sampleAvailable && (
          <TouchableOpacity 
            onPress={goToSampleOrder} 
            style={styles.sampleBtn}
          >
            <Icon name="package-variant" size={16} color={P.primary} />
            <Text style={styles.sampleBtnText}>
              Order Sample at {formatPrice(Number(samplePrice), product.currency ?? 'INR')}
            </Text>
            <Icon name="chevron-right" size={16} color={P.primary} />
          </TouchableOpacity>
        )}

        <TradeAssurance />

        {/* Trust Badges - Corporate Blue */}
        <View style={styles.trustRow}>
          <View style={styles.trustItem}>
            <Icon name="shield-check" size={14} color={P.primary} />
            <Text style={styles.trustText}>Verified</Text>
          </View>
          <View style={styles.trustDivider} />
          <View style={styles.trustItem}>
            <Icon name="earth" size={14} color={P.primary} />
            <Text style={styles.trustText}>Global Trade</Text>
          </View>
          <View style={styles.trustDivider} />
          <View style={styles.trustItem}>
            <Icon name="star-four-points" size={14} color={P.primary} />
            <Text style={styles.trustText}>Quality Assured</Text>
          </View>
        </View>

         {/* Description */}
        {product.description && (
          <View style={styles.descriptionContainer}>
            <Text style={styles.descriptionTitle}>Description</Text>
            <Text selectable style={styles.descriptionText}>
              {String(product.description).replace(/<[^>]*>/g, '')}
            </Text>
          </View>
        )}

        {/* Product Details */}
        <InfoCard title="Product Details" rows={productDetailsRows} />

        

        {/* Specifications */}
        {product.specifications && Object.keys(product.specifications).length > 0 && (
          <InfoCard title="Specifications" rows={Object.entries(product.specifications).map(([key, value]) => [key.replace(/_/g, ' '), value])} />
        )}

        {/* Variants */}
        {product.variants && product.variants.length > 0 && (
          <InfoCard title="Variants" rows={product.variants.map((v: any, i: number) => [
            `Variant ${i + 1}`,
            `${v.name || ''} ${v.sku ? `(SKU: ${v.sku})` : ''} - ${v.price ? formatPrice(v.price, product.currency) : ''}`
          ])} />
        )}

        {/* Manufacturing Details */}
        {product.manufacturingDetails && Object.keys(product.manufacturingDetails).length > 0 && (
          <InfoCard title="Manufacturing Details" rows={manufacturingRows} />
        )}

        {/* Shipping & Delivery */}
        <InfoCard title="Shipping & Delivery" rows={shippingRows} />

        {/* Certifications */}
        {product.certifications && product.certifications.length > 0 && (
          <InfoCard title="Certifications" rows={product.certifications.map((c: any) => [
            c.name,
            `${c.issuer || ''}${c.validUntil ? ` (Valid until: ${new Date(c.validUntil).toLocaleDateString()})` : ''}`
          ])} />
        )}

        {/* Reviews */}
        <View style={styles.reviewsSection}>
          <ReviewsPanel 
            productId={productId} 
            sellerId={sellerRouteId} 
            showForm 
            title="Ratings & Reviews" 
          />
        </View>

        {/* Related Products Sliders */}
        {relatedProducts1.length > 0 && (
          <View style={styles.relatedSection}>
            <View style={styles.relatedHeader}>
              <Text style={styles.relatedTitle}>Similar Products</Text>
              <TouchableOpacity>
                <Text style={styles.relatedSeeAll}>See All</Text>
              </TouchableOpacity>
            </View>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.relatedList}
            >
              {relatedProducts1.map(item => (
                <ProductCard 
                  key={String(item._id ?? item.id)} 
                  product={item} 
                  variant="carousel" 
                />
              ))}
            </ScrollView>
          </View>
        )}

        {relatedProducts2.length > 0 && (
          <View style={styles.relatedSection}>
            <View style={styles.relatedHeader}>
              <Text style={styles.relatedTitle}>You May Also Like</Text>
              <TouchableOpacity>
                <Text style={styles.relatedSeeAll}>See All</Text>
              </TouchableOpacity>
            </View>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.relatedList}
            >
              {relatedProducts2.map(item => (
                <ProductCard 
                  key={String(item._id ?? item.id)} 
                  product={item} 
                  variant="carousel" 
                />
              ))}
            </ScrollView>
          </View>
        )}

        {relatedProducts3.length > 0 && (
          <View style={styles.relatedSection}>
            <View style={styles.relatedHeader}>
              <Text style={styles.relatedTitle}>More From This Brand</Text>
              <TouchableOpacity>
                <Text style={styles.relatedSeeAll}>See All</Text>
              </TouchableOpacity>
            </View>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.relatedList}
            >
              {relatedProducts3.map(item => (
                <ProductCard 
                  key={String(item._id ?? item.id)} 
                  product={item} 
                  variant="carousel" 
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Product Grid - 2 Columns */}
        {relatedProducts1.length > 2 && renderProductGrid(relatedProducts1.slice(0, 6), "More Products You'll Love")}

        {/* Trade Assurance */}
       

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Bottom Action Bar - Corporate Blue */}
      <View style={[styles.actionBar, { paddingBottom: insets.bottom || 12 }]}>
        <TouchableOpacity 
          onPress={goToStore} 
          style={styles.storeBtn}
          disabled={!sellerRouteId}
        >
          <Icon name="storefront-outline" size={22} color={P.primary} />
          <Text style={styles.storeBtnText}>Store</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          onPress={() => { 
            if (!isAuth) { 
              navigation.navigate('Auth', { initialMode: 'login' }); 
              return; 
            } 
            if (!isBuyer) { 
              Alert.alert('Switch Role', 'Please switch to buyer mode to chat.'); 
              return; 
            } 
            chatNow.mutate(); 
          }} 
          style={[styles.chatBtn, (!canAct || chatNow.isPending) && styles.disabledBtn]} 
          disabled={!canAct || chatNow.isPending}
        >
          <Icon name="message-text-outline" size={18} color={P.primary} />
          <Text style={styles.chatBtnText}>
            {chatNow.isPending ? 'Opening…' : 'Chat'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          onPress={() => { 
            if (!isAuth) { 
              navigation.navigate('Auth', { initialMode: 'login' }); 
              return; 
            } 
            if (!isBuyer) { 
              Alert.alert('Switch Role', 'Please switch to buyer mode to send enquiry.'); 
              return; 
            } 
            setEnquiryOpen(true); 
          }} 
          style={[styles.enquiryBtn, (!canAct || sendEnquiry.isPending) && styles.disabledBtn]} 
          disabled={!canAct || sendEnquiry.isPending}
        >
          <Icon name="send-outline" size={18} color="#FFF" />
          <Text style={styles.enquiryBtnText}>
            {sendEnquiry.isPending ? 'Sending…' : 'Enquiry'}
          </Text>
        </TouchableOpacity>
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

      <EnquiryModal 
        visible={enquiryOpen} 
        productName={product.name || product.title || 'Product'} 
        defaultQuantity={String(quantity)} 
        defaultUnit={product.unit || 'piece'} 
        pending={sendEnquiry.isPending} 
        quantity={String(quantity)} 
        targetPrice={targetPrice} 
        destinationCountry={destinationCountry} 
        additionalNotes={additionalNotes} 
        customSpecifications={customSpecifications} 
        packagingRequirements={packagingRequirements} 
        deliveryRequirements={deliveryRequirements} 
        attachments={attachments} 
        onQuantityChange={value => setQuantity(Math.max(1, Number(value) || 1))} 
        onTargetPriceChange={setTargetPrice} 
        onDestinationChange={setDestinationCountry} 
        onNotesChange={setAdditionalNotes} 
        onSpecificationsChange={setCustomSpecifications} 
        onPackagingChange={setPackagingRequirements} 
        onDeliveryChange={setDeliveryRequirements} 
        onAttachmentsChange={setAttachments} 
        onClose={() => setEnquiryOpen(false)} 
        onSubmit={() => sendEnquiry.mutate()} 
      />
    </View>
  );
}

// ─── Grid Styles ────────────────────────────────────────────────────────────

const gridStyles = StyleSheet.create({
  container: {
    backgroundColor: P.surface,
    paddingHorizontal: 12,
    paddingVertical: 16,
    marginTop: 6,
    borderBottomWidth: 1,
    borderBottomColor: P.faint,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: P.text,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  gridItem: {
    width: '48%',
    marginBottom: 12,
  },
});

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: P.bg,
  },
  
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: P.surface,
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: P.faint,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: P.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: P.text,
    textAlign: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    gap: 8,
  },
  
  scrollContent: {
    paddingBottom: 100,
  },
  bottomSpacer: {
    height: 20,
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
  heartBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 20,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: P.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  paginationRow: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  dotActive: {
    backgroundColor: P.primary,
    width: 18,
    height: 6,
    borderRadius: 3,
  },
  
  // Thumbnail Gallery
  thumbnailRow: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: P.surface,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: P.faint,
  },
  thumbnailButton: {
    width: 74,
    height: 74,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: P.border,
    overflow: 'hidden',
  },
  thumbnailButtonActive: {
    borderColor: P.primary,
    borderWidth: 3,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  
  // Product Info
  productInfo: {
    backgroundColor: P.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: P.faint,
  },
  productBrand: {
    fontSize: 13,
    fontWeight: '600',
    color: P.textSecondary,
    marginBottom: 4,
  },
  productName: {
    fontSize: 13,
    fontWeight: '600',
    color: P.text,
    lineHeight: 22,
    marginBottom: 8,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: P.green,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 3,
  },
  ratingText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  reviewCount: {
    fontSize: 12,
    color: P.textSecondary,
    marginLeft: 8,
  },
  dotSeparator: {
    fontSize: 12,
    color: P.textLight,
    marginHorizontal: 6,
  },
  orderCount: {
    fontSize: 12,
    color: P.textSecondary,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginBottom: 2,
  },
  price: {
    fontSize: 18,
    fontWeight: '800',
    color: P.text,
  },
  priceSubtext: {
    fontSize: 12,
    fontWeight: '500',
    color: P.textSecondary,
  },
  priceNote: {
    fontSize: 12,
    color: P.textSecondary,
    marginTop: 2,
  },
  
  // Sample Button
  sampleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: P.primaryLight,
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: P.faint,
  },
  sampleBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: P.primaryDark,
  },
  
  // Trust Row
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: P.surface,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: P.faint,
  },
  trustItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  trustDivider: {
    width: 1,
    height: 20,
    backgroundColor: P.faint,
  },
  trustText: {
    fontSize: 11,
    fontWeight: '500',
    color: P.textSecondary,
  },
  
  // Description
  descriptionContainer: {
    backgroundColor: P.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 6,
    borderBottomWidth: 1,
    borderBottomColor: P.faint,
  },
  descriptionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: P.text,
    marginBottom: 8,
  },
  descriptionText: {
    fontSize: 13,
    color: P.textSecondary,
    lineHeight: 20,
  },
  
  // Reviews
  reviewsSection: {
    marginTop: 6,
    borderBottomWidth: 1,
    borderBottomColor: P.faint,
  },
  
  // Related Products
  relatedSection: {
    backgroundColor: P.surface,
    paddingVertical: 16,
    marginTop: 6,
    borderBottomWidth: 1,
    borderBottomColor: P.faint,
  },
  relatedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  relatedTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: P.text,
  },
  relatedSeeAll: {
    fontSize: 12,
    fontWeight: '600',
    color: P.primary,
  },
  relatedList: {
    paddingHorizontal: 12,
    gap: 10,
  },
  
  // Action Bar
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    backgroundColor: P.surface,
    borderTopWidth: 1,
    borderTopColor: P.faint,
  },
  storeBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 54,
  },
  storeBtnText: {
    fontSize: 10,
    fontWeight: '600',
    color: P.primary,
    marginTop: 2,
  },
  chatBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: P.surface,
    borderRadius: 8,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: P.primary,
  },
  chatBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: P.primary,
  },
  enquiryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: P.primary,
    borderRadius: 8,
    paddingVertical: 12,
  },
  enquiryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFF',
  },
  disabledBtn: {
    opacity: 0.5,
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