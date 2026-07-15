import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react';
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
  Animated,
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

// ─── Premium Design System ─────────────────────────────────────────────────

const DesignSystem = {
  // Primary Palette
  primary: '#1A56DB',
  primaryDark: '#1E40AF',
  primaryLight: '#EFF6FF',
  primaryLighter: '#DBEAFE',
  
  // Neutral Palette
  white: '#FFFFFF',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  
  // Text Palette
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textTertiary: '#94A3B8',
  
  // Border & Divider
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  
  // Semantic Colors
  success: '#059669',
  warning: '#D97706',
  star: '#F59E0B',
  error: '#DC2626',
  
  // Shadows
  shadowSm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  shadowMd: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  shadowLg: {
    shadowColor: '#1A56DB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  
  // Typography
  typography: {
    h1: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
    h2: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
    h3: { fontSize: 16, fontWeight: '600' },
    body: { fontSize: 14, fontWeight: '400' },
    bodyBold: { fontSize: 14, fontWeight: '600' },
    caption: { fontSize: 12, fontWeight: '500' },
    small: { fontSize: 11, fontWeight: '500' },
  },
  
  // Border Radius
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    full: 999,
  },
} as const;

const D = DesignSystem;

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

// ─── Quantity Stepper Component ─────────────────────────────────────────────

function QuantityStepper({ 
  value, 
  min = 1,
  onChange 
}: { 
  value: number; 
  min?: number;
  onChange: (val: number) => void;
}) {
  const decrement = () => {
    if (value > min) onChange(value - 1);
  };
  
  const increment = () => {
    onChange(value + 1);
  };

  return (
    <View style={stepperStyles.container}>
      <TouchableOpacity 
        onPress={decrement} 
        style={[stepperStyles.button, value <= min && stepperStyles.buttonDisabled]}
        disabled={value <= min}
        activeOpacity={0.7}
      >
        <Icon name="minus" size={18} color={value <= min ? D.textTertiary : D.primary} />
      </TouchableOpacity>
      
      <View style={stepperStyles.valueContainer}>
        <Text style={stepperStyles.value}>{value}</Text>
      </View>
      
      <TouchableOpacity 
        onPress={increment} 
        style={stepperStyles.button}
        activeOpacity={0.7}
      >
        <Icon name="plus" size={18} color={D.primary} />
      </TouchableOpacity>
    </View>
  );
}

const stepperStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: D.surface,
    borderRadius: D.radius.md,
    borderWidth: 1,
    borderColor: D.border,
    overflow: 'hidden',
  },
  button: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: D.primaryLight,
  },
  buttonDisabled: {
    backgroundColor: D.background,
  },
  valueContainer: {
    paddingHorizontal: 16,
    minWidth: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: D.border,
    height: 40,
  },
  value: {
    ...D.typography.bodyBold,
    color: D.textPrimary,
  },
});

// ─── Premium MOQ Selector ───────────────────────────────────────────────────

function PremiumMoqSelector({ 
  tiers, 
  selectedQty, 
  onSelect, 
}: { 
  tiers: MoqTier[]; 
  selectedQty: number; 
  onSelect: (qty: number) => void;
}) {
  const { formatPrice } = useCurrency();
  
  // Find active tier based on selected quantity
  const activeTier = useMemo(() => {
    return tiers.find(tier => {
      if (tier.maxQty) {
        return selectedQty >= tier.minQty && selectedQty <= tier.maxQty;
      }
      return selectedQty >= tier.minQty;
    });
  }, [tiers, selectedQty]);

  // Check if a tier is the active one
  const isTierActive = useCallback((tier: MoqTier) => {
    if (!activeTier) return false;
    return activeTier.minQty === tier.minQty && activeTier.maxQty === tier.maxQty;
  }, [activeTier]);

  // Handle tier press - set quantity to tier's minimum
  const handleTierPress = useCallback((tier: MoqTier) => {
    onSelect(tier.minQty);
  }, [onSelect]);

  if (!tiers || tiers.length === 0) return null;

  const hasActiveTier = activeTier !== undefined;

  return (
    <View style={moqStyles.wrapper}>
      {/* Header */}
      <View style={moqStyles.header}>
        <View style={moqStyles.headerLeft}>
          <View style={moqStyles.iconCircle}>
            <Icon name="package-variant" size={16} color={D.primary} />
          </View>
          <Text style={moqStyles.headerTitle}>Bulk Pricing</Text>
        </View>
        {hasActiveTier && (
          <View style={moqStyles.selectedBadge}>
            <Text style={moqStyles.selectedBadgeText}>
              {selectedQty} {tiers[0]?.unit || 'units'} selected
            </Text>
          </View>
        )}
      </View>

      {/* Tier Cards */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={moqStyles.tiersContainer}
        decelerationRate="fast"
      >
        {tiers.map((tier, index) => {
          const active = isTierActive(tier);
          
          return (
            <TouchableOpacity
              key={`tier-${tier.minQty}-${tier.maxQty}-${index}`}
              onPress={() => handleTierPress(tier)}
              activeOpacity={0.8}
              style={[
                moqStyles.tierCard,
                active && moqStyles.tierCardActive,
              ]}
            >
              {/* Active indicator */}
              {active && (
                <View style={moqStyles.activeRibbon}>
                  <Icon name="check" size={10} color={D.white} />
                </View>
              )}
              
              {/* Quantity Range */}
              <Text style={[
                moqStyles.tierQty,
                active && moqStyles.tierQtyActive
              ]}>
                {tier.maxQty 
                  ? `${tier.minQty}-${tier.maxQty}` 
                  : `${tier.minQty}+`
                }
              </Text>
              <Text style={[
                moqStyles.tierLabel,
                active && moqStyles.tierLabelActive
              ]}>
                {tier.unit || 'units'}
              </Text>
              
              {/* Price */}
              <View style={moqStyles.priceContainer}>
                <Text style={[
                  moqStyles.tierPrice,
                  active && moqStyles.tierPriceActive
                ]}>
                  {formatPrice(tier.price, 'INR')}
                </Text>
                <Text style={[
                  moqStyles.tierPriceUnit,
                  active && moqStyles.tierPriceUnitActive
                ]}>
                  /{tier.unit || 'unit'}
                </Text>
              </View>
              
              {/* Savings indicator */}
              {active && tiers.length > 1 && (
                <View style={moqStyles.savingsBadge}>
                  <Icon name="tag" size={8} color={D.success} />
                  <Text style={moqStyles.savingsText}>Best value</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Active Tier Summary */}
      {hasActiveTier && (
        <View style={moqStyles.summaryContainer}>
          <View style={moqStyles.summaryRow}>
            <View style={moqStyles.summaryItem}>
              <Text style={moqStyles.summaryLabel}>Selected Range</Text>
              <Text style={moqStyles.summaryValue}>
                {activeTier.maxQty 
                  ? `${activeTier.minQty} - ${activeTier.maxQty}` 
                  : `${activeTier.minQty}+`
                } {activeTier.unit || 'units'}
              </Text>
            </View>
            
            <View style={moqStyles.summaryDivider} />
            
            <View style={moqStyles.summaryItem}>
              <Text style={moqStyles.summaryLabel}>Price Per Unit</Text>
              <Text style={moqStyles.summaryValueHighlight}>
                {formatPrice(activeTier.price, 'INR')}
              </Text>
            </View>
            
            <View style={moqStyles.summaryDivider} />
            
            <View style={moqStyles.summaryItem}>
              <Text style={moqStyles.summaryLabel}>Total Amount</Text>
              <Text style={moqStyles.summaryValueHighlight}>
                {formatPrice(activeTier.price * selectedQty, 'INR')}
              </Text>
            </View>
          </View>
          
          {/* Quantity Stepper */}
          <View style={moqStyles.stepperRow}>
            <Text style={moqStyles.stepperLabel}>Adjust quantity:</Text>
            <QuantityStepper 
              value={selectedQty} 
              min={activeTier.minQty}
              onChange={onSelect} 
            />
          </View>
        </View>
      )}
    </View>
  );
}

const moqStyles = StyleSheet.create({
  wrapper: {
    backgroundColor: D.surface,
    marginTop: 6,
    marginHorizontal: 12,
    borderRadius: D.radius.lg,
    ...D.shadowSm,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: D.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...D.typography.h3,
    color: D.textPrimary,
  },
  selectedBadge: {
    backgroundColor: D.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: D.radius.full,
  },
  selectedBadgeText: {
    ...D.typography.small,
    color: D.primary,
    fontWeight: '600',
  },
  tiersContainer: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 10,
  },
  tierCard: {
    backgroundColor: D.background,
    borderRadius: D.radius.md,
    borderWidth: 2,
    borderColor: D.borderLight,
    paddingVertical: 14,
    paddingHorizontal: 16,
    minWidth: 100,
    alignItems: 'center',
    position: 'relative',
    ...D.shadowSm,
  },
  tierCardActive: {
    backgroundColor: D.primary,
    borderColor: D.primaryDark,
    transform: [{ scale: 1.05 }],
    ...D.shadowLg,
  },
  activeRibbon: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: D.success,
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: D.white,
  },
  tierQty: {
    ...D.typography.h3,
    color: D.textPrimary,
    marginBottom: 2,
  },
  tierQtyActive: {
    color: D.white,
    fontSize: 18,
  },
  tierLabel: {
    ...D.typography.caption,
    color: D.textTertiary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tierLabelActive: {
    color: 'rgba(255,255,255,0.7)',
  },
  priceContainer: {
    alignItems: 'center',
  },
  tierPrice: {
    ...D.typography.bodyBold,
    color: D.textPrimary,
  },
  tierPriceActive: {
    color: D.white,
    fontWeight: '800',
  },
  tierPriceUnit: {
    ...D.typography.small,
    color: D.textTertiary,
    marginTop: 2,
  },
  tierPriceUnitActive: {
    color: 'rgba(255,255,255,0.7)',
  },
  savingsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: D.radius.full,
  },
  savingsText: {
    ...D.typography.small,
    color: D.white,
    fontWeight: '600',
  },
  summaryContainer: {
    borderTopWidth: 1,
    borderTopColor: D.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: D.primaryLight,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    height: 30,
    backgroundColor: D.border,
    marginHorizontal: 4,
  },
  summaryLabel: {
    ...D.typography.small,
    color: D.textSecondary,
    marginBottom: 4,
  },
  summaryValue: {
    ...D.typography.caption,
    color: D.textPrimary,
    fontWeight: '600',
  },
  summaryValueHighlight: {
    ...D.typography.caption,
    color: D.primaryDark,
    fontWeight: '700',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: D.border,
  },
  stepperLabel: {
    ...D.typography.caption,
    color: D.textSecondary,
  },
});

// ─── Info Card Component ──────────────────────────────────────────────────

function InfoCard({ title, rows }: { title: string; rows: Array<[string, unknown]> }) {
  const visible = rows.filter(([, value]) => value !== undefined && value !== null && value !== '');
  if (!visible.length) return null;
  
  return (
    <View style={infoStyles.wrapper}>
      <View style={infoStyles.header}>
        <Text style={infoStyles.title}>{title}</Text>
        <View style={infoStyles.titleUnderline} />
      </View>
      <View style={infoStyles.content}>
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
    </View>
  );
}

const infoStyles = StyleSheet.create({
  wrapper: {
    backgroundColor: D.surface,
    marginHorizontal: 12,
    marginTop: 6,
    borderRadius: D.radius.lg,
    ...D.shadowSm,
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    ...D.typography.h3,
    color: D.textPrimary,
    marginBottom: 8,
  },
  titleUnderline: {
    width: 40,
    height: 3,
    backgroundColor: D.primary,
    borderRadius: 2,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: D.borderLight,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  label: {
    ...D.typography.caption,
    color: D.textSecondary,
    flex: 1,
    textTransform: 'capitalize',
  },
  value: {
    ...D.typography.caption,
    color: D.textPrimary,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
});

// ─── Trust Badges Component ─────────────────────────────────────────────────

function TrustBadges() {
  const badges = [
    { icon: 'shield-check', label: 'Verified Supplier' },
    { icon: 'earth', label: 'Global Shipping' },
    { icon: 'certificate', label: 'Quality Assured' },
    { icon: 'handshake', label: 'Secure Trade' },
  ];

  return (
    <View style={trustStyles.container}>
      {badges.map((badge, index) => (
        <React.Fragment key={badge.label}>
          <View style={trustStyles.badge}>
            <View style={trustStyles.badgeIcon}>
              <Icon name={badge.icon} size={14} color={D.success} />
            </View>
            <Text style={trustStyles.badgeLabel}>{badge.label}</Text>
          </View>
          {index < badges.length - 1 && <View style={trustStyles.divider} />}
        </React.Fragment>
      ))}
    </View>
  );
}

const trustStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: D.surface,
    marginHorizontal: 12,
    marginTop: 6,
    borderRadius: D.radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 8,
    ...D.shadowSm,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    justifyContent: 'center',
  },
  badgeIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLabel: {
    ...D.typography.small,
    color: D.textSecondary,
    fontWeight: '600',
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: D.borderLight,
  },
});

// ─── Image Gallery Component ────────────────────────────────────────────────

function ImageGallery({ 
  images, 
  selectedIndex, 
  onIndexChange,
  onOpenFullscreen 
}: { 
  images: string[]; 
  selectedIndex: number;
  onIndexChange: (index: number) => void;
  onOpenFullscreen: () => void;
}) {
  const flatListRef = useRef<FlatList>(null);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (index !== selectedIndex) onIndexChange(index);
  };

  const scrollToImage = (index: number) => {
    flatListRef.current?.scrollToIndex({ index, animated: true });
    onIndexChange(index);
  };

  return (
    <View style={galleryStyles.wrapper}>
      {/* Main Slider */}
      <FlatList
        ref={flatListRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        data={images}
        keyExtractor={(uri, i) => `${uri}-${i}`}
        onMomentumScrollEnd={onScrollEnd}
        getItemLayout={(_, index) => ({ 
          length: SCREEN_WIDTH, 
          offset: SCREEN_WIDTH * index, 
          index 
        })}
        renderItem={({ item: uri }) => (
          <Pressable onPress={onOpenFullscreen} style={galleryStyles.slide}>
            <RemoteImage 
              uri={uri} 
              width={900} 
              height={450} 
              resizeMode="cover" 
              style={galleryStyles.image} 
              fallback={
                <View style={galleryStyles.fallback}>
                  <Icon name="image-off" size={48} color={D.textTertiary} />
                </View>
              } 
            />
          </Pressable>
        )}
      />

      {/* Dots Pagination */}
      {images.length > 1 && (
        <View style={galleryStyles.dotsContainer}>
          {images.map((_, i) => (
            <TouchableOpacity 
              key={i} 
              onPress={() => scrollToImage(i)} 
              activeOpacity={0.7}
            >
              <View style={[
                galleryStyles.dot,
                selectedIndex === i && galleryStyles.dotActive
              ]} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Thumbnails */}
      {images.length > 1 && (
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={galleryStyles.thumbnailsContainer}
        >
          {images.map((uri, index) => (
            <TouchableOpacity
              key={`thumb-${index}`}
              onPress={() => scrollToImage(index)}
              activeOpacity={0.8}
              style={[
                galleryStyles.thumbnail,
                selectedIndex === index && galleryStyles.thumbnailActive
              ]}
            >
              <RemoteImage 
                uri={uri} 
                width={72} 
                height={72} 
                resizeMode="cover" 
                style={galleryStyles.thumbnailImage} 
              />
              {selectedIndex === index && (
                <View style={galleryStyles.thumbnailOverlay}>
                  <Icon name="check" size={12} color={D.white} />
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const galleryStyles = StyleSheet.create({
  wrapper: {
    backgroundColor: D.surface,
    position: 'relative',
  },
  slide: {
    width: SCREEN_WIDTH,
    height: 400,
  },
  image: {
    width: SCREEN_WIDTH,
    height: 400,
    backgroundColor: D.background,
  },
  fallback: {
    width: SCREEN_WIDTH,
    height: 400,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: D.background,
  },
  dotsContainer: {
    position: 'absolute',
    bottom: 64,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  dotActive: {
    backgroundColor: D.primary,
    width: 24,
    height: 8,
    borderRadius: 4,
  },
  thumbnailsContainer: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: D.borderLight,
  },
  thumbnail: {
    width: 76,
    height: 76,
    borderRadius: D.radius.sm,
    borderWidth: 2,
    borderColor: D.border,
    overflow: 'hidden',
    position: 'relative',
  },
  thumbnailActive: {
    borderColor: D.primary,
    borderWidth: 2.5,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  thumbnailOverlay: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: D.primary,
    borderRadius: 8,
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
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
  const sellerName = useMemo(() => extractSellerName(product), [product]);
  const images = useMemo(() => extractImages(product), [product]);
  const moqTiers: MoqTier[] = useMemo(() => buildMoqTiers(product), [product]);
  
  // Related Products
  const relatedQuery1 = useQuery({
    queryKey: ['related-products-1', productId, product?.categoryId ?? product?.category],
    queryFn: () => fetchProducts({ 
      category: typeof product?.categoryId === 'object' 
        ? String(product.categoryId._id ?? product.categoryId.id ?? product.categoryId.name ?? '') 
        : String(product?.categoryId ?? product?.category ?? ''), 
      limit: 10 
    }),
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

  const relatedProducts1 = useMemo(
    () => (relatedQuery1.data?.products ?? [])
      .filter((item: any) => String(item._id ?? item.id) !== String(productId))
      .slice(0, 8), 
    [relatedQuery1.data?.products, productId]
  );
  
  const relatedProducts2 = useMemo(
    () => (relatedQuery2.data?.products ?? [])
      .filter((item: any) => String(item._id ?? item.id) !== String(productId))
      .slice(0, 8), 
    [relatedQuery2.data?.products, productId]
  );
  
  const relatedProducts3 = useMemo(
    () => (relatedQuery3.data?.products ?? [])
      .filter((item: any) => String(item._id ?? item.id) !== String(productId))
      .slice(0, 8), 
    [relatedQuery3.data?.products, productId]
  );

  // ── Auth State ───────────────────────────────────────────────────────────

  const isAuth = status === 'authenticated';
  const currentUserId = String(user?._id ?? user?.id ?? '');
  const isBuyer = isAuth && activeRole === 'buyer';
  const isSelfContact = Boolean(currentUserId && sellerUserId && currentUserId === String(sellerUserId));
  const canAct = isBuyer && Boolean(sellerUserId) && !isSelfContact;

  // ── Initialize quantity ─────────────────────────────────────────────────

  useEffect(() => {
    if (moqTiers.length > 0 && initializedMoqProductRef.current !== productId) {
      initializedMoqProductRef.current = productId;
      setQuantity(moqTiers[0].minQty);
      if (moqTiers[0].price > 0) {
        setTargetPrice(String(moqTiers[0].price));
      }
    }
  }, [moqTiers, productId]);

  // ── Track view ──────────────────────────────────────────────────────────

  useEffect(() => {
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
        attachments: cloudFiles.map((file: any, index: number) => ({
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

  const shareProduct = useCallback(() => {
    if (!product) return;
    Share.share({ 
      message: `${product.name || 'Product'}\n${formatPrice(Number(product.price ?? 0), product.currency ?? 'INR')}` 
    });
  }, [product, formatPrice]);

  // ── Data for rendering ──────────────────────────────────────────────────

  const gallery: string[] = images.length > 0 ? images : [''];
  const rating = product?.averageRating || 0;
  const reviewCount = product?.reviewCount || 0;
  const totalOrders = product?.totalOrders || 0;
  const samplePrice = product?.samplePrice || product?.price || 2000;

  const productDetailsRows = [
    ['Category', typeof product?.category === 'object' ? product.category?.name : product?.category],
    ['Subcategory', typeof product?.subcategory === 'object' ? product.subcategory?.name : product?.subcategory],
    ['Brand', product?.brand],
    ['Model', product?.model ?? product?.modelNumber],
    ['SKU', product?.sku],
    ['HSN Code', product?.hsn ?? product?.hsnCode],
    ['Country of Origin', product?.countryOfOrigin ?? product?.originCountry],
    ['Stock Quantity', product?.stockQuantity ?? product?.stock],
    ['Status', product?.status],
    ['Warranty', product?.warranty],
    ['Certifications', product?.certifications?.map((c: any) => c.name).join(', ')],
    ['Sample Available', product?.sampleAvailable ? 'Yes' : 'No'],
  ];

  const shippingRows = [
    ['Lead Time', product?.leadTime ? `${product.leadTime.value} ${product.leadTime.unit}` : null],
    ['Delivery Time', product?.deliveryTime ? `${product.deliveryTime.value} ${product.deliveryTime.unit}` : null],
    ['Shipping Methods', product?.shipping?.methods?.join(', ')],
    ['Origin Port', product?.shipping?.originPort],
    ['Payment Terms', product?.paymentTerms],
    ['Trade Terms', product?.tradeTerms?.join(', ')],
  ];

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

  // ── Render Section ─────────────────────────────────────────────────────

  const renderRelatedSection = (products: any[], title: string) => {
    if (products.length === 0) return null;
    
    return (
      <View style={styles.relatedSection}>
        <View style={styles.relatedHeader}>
          <Text style={styles.relatedTitle}>{title}</Text>
          <TouchableOpacity>
            <Text style={styles.relatedSeeAll}>See All →</Text>
          </TouchableOpacity>
        </View>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.relatedList}
          decelerationRate="fast"
        >
          {products.map((item: any) => (
            <View key={String(item._id ?? item.id)} style={styles.relatedCard}>
              <ProductCard product={item} variant="carousel" />
            </View>
          ))}
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={D.surface} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity 
          onPress={() => navigation.goBack()} 
          style={styles.headerIconBtn}
          activeOpacity={0.7}
        >
          <Icon name="arrow-left" size={22} color={D.textPrimary} />
        </TouchableOpacity>
        
        <Text numberOfLines={1} style={styles.headerTitle}>
          Product Details
        </Text>
        
        <View style={styles.headerActions}>
          <TouchableOpacity 
            onPress={shareProduct} 
            style={styles.headerIconBtn}
            activeOpacity={0.7}
          >
            <Icon name="share-variant-outline" size={20} color={D.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={styles.scrollContent}
      >
        {/* Image Gallery */}
        <View style={styles.gallerySection}>
          <ImageGallery 
            images={gallery}
            selectedIndex={selectedImage}
            onIndexChange={setSelectedImage}
            onOpenFullscreen={() => setGalleryOpen(true)}
          />
          
          {/* Saved Heart Button */}
          <SavedHeartButton 
            type="product" 
            itemId={product._id || product.id || ''} 
            target={product} 
            size={16} 
            style={styles.heartBtn} 
            iconColor={D.textPrimary} 
          />
        </View>

        {/* Product Header */}
        <View style={styles.productHeader}>
          <TouchableOpacity 
            onPress={goToStore} 
            style={styles.sellerRow}
            activeOpacity={0.7}
          >
            <View style={styles.sellerAvatar}>
              <Icon name="store" size={16} color={D.primary} />
            </View>
            <View style={styles.sellerInfo}>
              <Text style={styles.sellerName}>{sellerName}</Text>
              <View style={styles.sellerBadge}>
                <Icon name="check-circle" size={10} color={D.success} />
                <Text style={styles.sellerBadgeText}>Verified</Text>
              </View>
            </View>
            <Icon name="chevron-right" size={18} color={D.textTertiary} />
          </TouchableOpacity>
          
          <Text style={styles.productName}>{product.name}</Text>
          
          {/* Rating */}
          <View style={styles.ratingRow}>
            <View style={styles.ratingBadge}>
              <Icon name="star" size={12} color={D.white} />
              <Text style={styles.ratingValue}>{rating.toFixed(1)}</Text>
            </View>
            <Text style={styles.reviewCount}>{reviewCount} reviews</Text>
            <View style={styles.ratingDot} />
            <Text style={styles.orderCount}>{totalOrders} orders</Text>
          </View>
        </View>

        {/* Premium MOQ Selector */}
        <PremiumMoqSelector 
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
        />

        {/* Sample Order */}
        {product.sampleAvailable && (
          <TouchableOpacity 
            onPress={goToSampleOrder} 
            style={styles.sampleBtn}
            activeOpacity={0.8}
          >
            <View style={styles.sampleBtnLeft}>
              <View style={styles.sampleIconCircle}>
                <Icon name="package-variant-closed" size={16} color={D.primary} />
              </View>
              <View>
                <Text style={styles.sampleBtnTitle}>Order Sample</Text>
                <Text style={styles.sampleBtnSubtitle}>
                  Try before you buy at {formatPrice(Number(samplePrice), product.currency ?? 'INR')}
                </Text>
              </View>
            </View>
            <Icon name="chevron-right" size={20} color={D.primary} />
          </TouchableOpacity>
        )}

        {/* Trust Badges */}
        <TrustBadges />

        {/* Trade Assurance */}
        <View style={styles.tradeAssuranceContainer}>
          <TradeAssurance />
        </View>

        {/* Description */}
        {product.description && (
          <View style={styles.descriptionCard}>
            <View style={styles.descriptionHeader}>
              <Text style={styles.descriptionTitle}>About This Product</Text>
              <View style={styles.descriptionUnderline} />
            </View>
            <Text selectable style={styles.descriptionText}>
              {String(product.description).replace(/<[^>]*>/g, '')}
            </Text>
          </View>
        )}

        {/* Product Details */}
        <InfoCard title="Product Details" rows={productDetailsRows} />

        {/* Specifications */}
        {product.specifications && Object.keys(product.specifications).length > 0 && (
          <InfoCard 
            title="Specifications" 
            rows={Object.entries(product.specifications).map(([key, value]) => [
              key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), 
              value
            ])} 
          />
        )}

        {/* Shipping & Delivery */}
        <InfoCard title="Shipping & Delivery" rows={shippingRows} />

        {/* Reviews */}
        <View style={styles.reviewsCard}>
          <ReviewsPanel 
            productId={productId} 
            sellerId={sellerRouteId} 
            showForm 
            title="Ratings & Reviews" 
          />
        </View>

        {/* Related Products */}
        {renderRelatedSection(relatedProducts1, 'Similar Products')}
        {renderRelatedSection(relatedProducts2, 'You May Also Like')}
        {renderRelatedSection(relatedProducts3, 'More From This Brand')}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Bottom Action Bar */}
      <View style={[styles.actionBar, { paddingBottom: insets.bottom || 12 }]}>
        <TouchableOpacity 
          onPress={goToStore} 
          style={styles.storeBtn}
          activeOpacity={0.7}
          disabled={!sellerRouteId}
        >
          <Icon name="storefront-outline" size={22} color={D.primary} />
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
          activeOpacity={0.8}
        >
          <Icon name="message-text-outline" size={18} color={D.primary} />
          <Text style={styles.chatBtnText}>
            {chatNow.isPending ? 'Opening…' : 'Chat Now'}
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
          activeOpacity={0.8}
        >
          {sendEnquiry.isPending ? (
            <ActivityIndicator size="small" color={D.white} />
          ) : (
            <Icon name="send-outline" size={18} color={D.white} />
          )}
          <Text style={styles.enquiryBtnText}>
            {sendEnquiry.isPending ? 'Sending…' : 'Send Enquiry'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Fullscreen Gallery */}
      <Modal 
        visible={galleryOpen} 
        animationType="fade" 
        statusBarTranslucent
        onRequestClose={() => setGalleryOpen(false)}
      >
        <View style={styles.fullscreenGallery}>
          <TouchableOpacity 
            onPress={() => setGalleryOpen(false)} 
            style={[styles.fullscreenClose, { top: insets.top + 16 }]}
            activeOpacity={0.7}
          >
            <Icon name="close" size={24} color={D.white} />
          </TouchableOpacity>
          
          <FlatList
            horizontal
            pagingEnabled
            data={gallery}
            initialScrollIndex={selectedImage}
            keyExtractor={(uri, index) => `${uri}-full-${index}`}
            getItemLayout={(_, index) => ({ 
              length: SCREEN_WIDTH, 
              offset: SCREEN_WIDTH * index, 
              index 
            })}
            renderItem={({ item: uri }) => (
              <View style={styles.fullscreenSlide}>
                <RemoteImage 
                  uri={uri} 
                  width={SCREEN_WIDTH} 
                  height={SCREEN_WIDTH} 
                  resizeMode="contain" 
                  style={styles.fullscreenImage} 
                />
              </View>
            )}
          />
          
          {/* Fullscreen Pagination */}
          <View style={styles.fullscreenPagination}>
            <Text style={styles.fullscreenPaginationText}>
              {selectedImage + 1} / {gallery.length}
            </Text>
          </View>
        </View>
      </Modal>

      {/* Enquiry Modal */}
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

// ─── Main Styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: D.background,
  },
  
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: D.surface,
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: D.borderLight,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: D.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    ...D.typography.bodyBold,
    color: D.textPrimary,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  
  scrollContent: {
    paddingBottom: 120,
  },
  bottomSpacer: {
    height: 40,
  },
  
  // Gallery Section
  gallerySection: {
    position: 'relative',
  },
  heartBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    ...D.shadowMd,
    zIndex: 10,
  },
  
  // Product Header
  productHeader: {
    backgroundColor: D.surface,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: D.borderLight,
  },
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    backgroundColor: D.background,
    padding: 10,
    borderRadius: D.radius.md,
  },
  sellerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: D.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerInfo: {
    flex: 1,
    gap: 2,
  },
  sellerName: {
    ...D.typography.bodyBold,
    color: D.textPrimary,
  },
  sellerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sellerBadgeText: {
    ...D.typography.small,
    color: D.success,
    fontWeight: '600',
  },
  productName: {
    ...D.typography.h2,
    color: D.textPrimary,
    lineHeight: 28,
    marginBottom: 10,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: D.success,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: D.radius.sm,
    gap: 4,
  },
  ratingValue: {
    color: D.white,
    ...D.typography.small,
    fontWeight: '700',
  },
  reviewCount: {
    ...D.typography.caption,
    color: D.textSecondary,
  },
  ratingDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: D.textTertiary,
  },
  orderCount: {
    ...D.typography.caption,
    color: D.textSecondary,
  },
  
  // Sample Button
  sampleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: D.surface,
    marginHorizontal: 12,
    marginTop: 6,
    borderRadius: D.radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: D.primaryLight,
    borderStyle: 'dashed',
  },
  sampleBtnLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sampleIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: D.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sampleBtnTitle: {
    ...D.typography.bodyBold,
    color: D.textPrimary,
  },
  sampleBtnSubtitle: {
    ...D.typography.caption,
    color: D.textSecondary,
    marginTop: 2,
  },
  
  // Trade Assurance
  tradeAssuranceContainer: {
    marginHorizontal: 12,
    marginTop: 6,
  },
  
  // Description
  descriptionCard: {
    backgroundColor: D.surface,
    marginHorizontal: 12,
    marginTop: 6,
    borderRadius: D.radius.lg,
    padding: 16,
    ...D.shadowSm,
  },
  descriptionHeader: {
    marginBottom: 12,
  },
  descriptionTitle: {
    ...D.typography.h3,
    color: D.textPrimary,
    marginBottom: 8,
  },
  descriptionUnderline: {
    width: 40,
    height: 3,
    backgroundColor: D.primary,
    borderRadius: 2,
  },
  descriptionText: {
    ...D.typography.body,
    color: D.textSecondary,
    lineHeight: 22,
  },
  
  // Reviews
  reviewsCard: {
    backgroundColor: D.surface,
    marginHorizontal: 12,
    marginTop: 6,
    borderRadius: D.radius.lg,
    ...D.shadowSm,
    overflow: 'hidden',
  },
  
  // Related Products
  relatedSection: {
    backgroundColor: D.surface,
    marginHorizontal: 12,
    marginTop: 6,
    borderRadius: D.radius.lg,
    paddingVertical: 16,
    ...D.shadowSm,
  },
  relatedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  relatedTitle: {
    ...D.typography.h3,
    color: D.textPrimary,
  },
  relatedSeeAll: {
    ...D.typography.caption,
    color: D.primary,
    fontWeight: '600',
  },
  relatedList: {
    paddingHorizontal: 12,
    gap: 12,
  },
  relatedCard: {
    width: 200,
  },
  
  // Action Bar
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: D.surface,
    borderTopWidth: 1,
    borderTopColor: D.borderLight,
    ...D.shadowMd,
  },
  storeBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    minWidth: 52,
  },
  storeBtnText: {
    ...D.typography.small,
    color: D.primary,
    fontWeight: '600',
    marginTop: 4,
  },
  chatBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: D.surface,
    borderRadius: D.radius.md,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: D.primary,
  },
  chatBtnText: {
    ...D.typography.bodyBold,
    color: D.primary,
  },
  enquiryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: D.primary,
    borderRadius: D.radius.md,
    paddingVertical: 14,
    ...D.shadowMd,
  },
  enquiryBtnText: {
    ...D.typography.bodyBold,
    color: D.white,
  },
  disabledBtn: {
    opacity: 0.5,
  },
  
  // Fullscreen Gallery
  fullscreenGallery: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
  },
  fullscreenClose: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(10px)',
  },
  fullscreenSlide: {
    width: SCREEN_WIDTH,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH,
  },
  fullscreenPagination: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: D.radius.full,
  },
  fullscreenPaginationText: {
    ...D.typography.caption,
    color: D.white,
    fontWeight: '600',
  },
});

export default React.memo(ProductDetailsScreen);