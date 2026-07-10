import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  ListRenderItemInfo,
  Pressable,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { fetchSavedItems } from '../api/account';
import { Product, SavedItem, SavedItemType, SellerSummary } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import ProductCard from '../components/ProductCard';
import RemoteImage from '../components/RemoteImage';
import SavedHeartButton from '../components/SavedHeartButton';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { colors, radii, shadow, spacing } from '../theme';
import { formatProductPrice, getStableKey } from '../utils/format';
import { firstImage } from '../utils/images';

// ─── Types ──────────────────────────────────────────────────────────────────

type Filter = 'all' | SavedItemType;

type NormalizedSavedItem = {
  _id: string;
  id: string;
  type: SavedItemType;
  itemId: string;
  product: Product | null;
  supplier: SellerSummary | null;
  createdAt?: string;
};

// ─── Professional Palette ───────────────────────────────────────────────────

const P = {
  bg: '#FAFAFA',
  surface: '#FFFFFF',
  primary: '#1A1A2E',
  accent: '#3B82F6',
  accentLight: '#EFF6FF',
  emerald: '#059669',
  emeraldLight: '#ECFDF5',
  amber: '#D97706',
  amberLight: '#FFFBEB',
  rose: '#E11D48',
  roseLight: '#FFF1F2',
  violet: '#7C3AED',
  violetLight: '#F5F3FF',
  sky: '#0284C7',
  skyLight: '#F0F9FF',
  ink: '#0F172A',
  text: '#334155',
  textSecondary: '#64748B',
  muted: '#94A3B8',
  faint: '#E2E8F0',
  border: '#F1F5F9',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeSavedItem(raw: SavedItem): NormalizedSavedItem {
  const rawType = raw.type ?? raw.itemType;
  const itemType: SavedItemType =
    rawType === 'product' || rawType === 'supplier' ? rawType : 'product';

  let product: Product | null = null;
  if (raw.productId && typeof raw.productId === 'object' && '_id' in raw.productId) {
    product = raw.productId as unknown as Product;
  } else if (raw.product) {
    product = raw.product;
  } else if (raw.item && 'price' in raw.item) {
    product = raw.item as Product;
  } else if (raw.target && 'price' in raw.target) {
    product = raw.target as Product;
  }

  let supplier: SellerSummary | null = null;
  if (raw.sellerId && typeof raw.sellerId === 'object' && '_id' in raw.sellerId) {
    supplier = raw.sellerId as unknown as SellerSummary;
  } else if (raw.seller) {
    supplier = raw.seller;
  } else if (raw.item && 'companyName' in raw.item) {
    supplier = raw.item as SellerSummary;
  } else if (raw.target && 'companyName' in raw.target) {
    supplier = raw.target as SellerSummary;
  }

  const itemId =
    raw.itemId ??
    product?._id ??
    supplier?._id ??
    (typeof raw.productId === 'string' ? raw.productId : undefined) ??
    (typeof raw.sellerId === 'string' ? raw.sellerId : undefined) ??
    '';

  return {
    _id: raw._id ?? raw.id ?? `normalized-${itemType}-${itemId}`,
    id: raw._id ?? raw.id ?? `normalized-${itemType}-${itemId}`,
    type: itemType,
    itemId,
    product,
    supplier,
    createdAt: raw.createdAt,
  };
}

function segmentLabel(item: Filter): string {
  if (item === 'all') return 'All';
  if (item === 'product') return 'Products';
  return 'Suppliers';
}

function getRelativeTime(dateStr: string): string {
  const now = Date.now();
  const saved = new Date(dateStr).getTime();
  const diff = Math.floor((now - saved) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ─── Animated Entry ─────────────────────────────────────────────────────────

function FadeInView({ children, index }: { children: React.ReactNode; index: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 500,
        delay: index * 80,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 500,
        delay: index * 80,
        useNativeDriver: true,
      }),
    ]).start();
  }, [index, opacity, translateY]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

function SavedItemsScreen() {
  const navigation = useNavigation<any>();
  const { status } = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');

  const savedItems = useQuery({
    queryKey: ['saved-items'],
    queryFn: () => fetchSavedItems(),
    enabled: status === 'authenticated',
    staleTime: 60_000,
  });

  const normalizedData = useMemo<NormalizedSavedItem[]>(() => {
    if (!savedItems.data) return [];
    return savedItems.data.map(normalizeSavedItem);
  }, [savedItems.data]);

  const visibleItems = useMemo(
    () =>
      filter === 'all'
        ? normalizedData
        : normalizedData.filter(item => item.type === filter),
    [filter, normalizedData],
  );

  const counts = useMemo(
    () => ({
      all: normalizedData.length,
      product: normalizedData.filter(i => i.type === 'product').length,
      supplier: normalizedData.filter(i => i.type === 'supplier').length,
    }),
    [normalizedData],
  );

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['saved-items'] });
    savedItems.refetch();
  }, [queryClient, savedItems]);

  // ── Unauthenticated ───────────────────────────────────────────────────

  if (status !== 'authenticated') {
    return (
      <View style={styles.centerScreen}>
        <StatusBar barStyle="dark-content" backgroundColor={P.bg} />
        <View style={styles.authIconWrap}>
          <Icon name="heart-outline" size={36} color={P.accent} />
        </View>
        <Text style={styles.authTitle}>Your Wishlist</Text>
        <Text style={styles.authSubtitle}>
          Sign in to save products and suppliers.
        </Text>
        <Pressable
          onPress={() => navigation.navigate('Auth', { initialMode: 'login' })}
          style={styles.authButton}>
          <Text style={styles.authButtonText}>Sign In</Text>
          <Icon name="arrow-right" size={18} color="#FFF" />
        </Pressable>
      </View>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────

  if (savedItems.isLoading) {
    return (
      <View style={styles.centerScreen}>
        <StatusBar barStyle="dark-content" backgroundColor={P.bg} />
        <LoadingState label="Loading..." />
      </View>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────

  if (savedItems.isError) {
    return (
      <View style={styles.centerScreen}>
        <StatusBar barStyle="dark-content" backgroundColor={P.bg} />
        <ErrorState
          message={(savedItems.error as Error)?.message ?? 'Failed to load.'}
          onRetry={() => savedItems.refetch()}
        />
      </View>
    );
  }

  // ── Main List ─────────────────────────────────────────────────────────

  const renderItem = ({ item, index }: ListRenderItemInfo<NormalizedSavedItem>) => {
    if (item.type === 'supplier' && item.supplier) {
      return (
        <FadeInView index={index}>
          <SavedSupplierCard item={item} />
        </FadeInView>
      );
    }
    if (item.type === 'product' && item.product) {
      return (
        <FadeInView index={index}>
          <SavedProductCard item={item} />
        </FadeInView>
      );
    }
    return null;
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={P.bg} />

      <FlatList
        data={visibleItems}
        keyExtractor={item => item._id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={savedItems.isRefetching}
            onRefresh={handleRefresh}
            tintColor={P.accent}
            colors={[P.accent]}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerSection}>
            {/* Top Bar */}
            <View style={styles.topBar}>
              <Pressable
                onPress={() => navigation.goBack()}
                style={styles.backBtn}>
                <Icon name="arrow-left" size={22} color={P.ink} />
              </Pressable>
              <Text style={styles.pageTitle}>Saved Items</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{counts.all}</Text>
              </View>
            </View>

            {/* Filter Pills */}
            <View style={styles.filterRow}>
              {(['all', 'product', 'supplier'] as const).map(seg => {
                const isActive = filter === seg;
                const count = seg === 'all' ? counts.all : seg === 'product' ? counts.product : counts.supplier;
                return (
                  <Pressable
                    key={seg}
                    onPress={() => setFilter(seg)}
                    style={[styles.filterPill, isActive && styles.filterPillActive]}>
                    <Text style={[styles.filterPillText, isActive && styles.filterPillTextActive]}>
                      {segmentLabel(seg)}
                    </Text>
                    <View style={[styles.filterCount, isActive && styles.filterCountActive]}>
                      <Text style={[styles.filterCountText, isActive && styles.filterCountTextActive]}>
                        {count}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        }
        renderItem={renderItem}
        ListEmptyComponent={
          <EmptyState
            title="No items saved yet"
            detail="Tap the heart icon on products and suppliers to save them here."
          />
        }
        stickyHeaderIndices={[0]}
      />
    </View>
  );
}

// ─── Saved Product Card ─────────────────────────────────────────────────────

function SavedProductCard({ item }: { item: NormalizedSavedItem }) {
  const product = item.product!;

  return (
    <View style={styles.productCard}>
      <ProductCard product={product} variant="full" />
      <View style={styles.productCardFooter}>
        <Text style={styles.productPrice}>{formatProductPrice(product)}</Text>
        {item.createdAt && (
          <Text style={styles.savedTime}>{getRelativeTime(item.createdAt)}</Text>
        )}
      </View>
    </View>
  );
}

// ─── Saved Supplier Card ────────────────────────────────────────────────────

function SavedSupplierCard({ item }: { item: NormalizedSavedItem }) {
  const navigation = useNavigation<any>();
  const supplier = item.supplier!;

  const supplierId = getStableKey(supplier);
  const title =
    supplier.companyName ?? supplier.businessName ?? supplier.displayName ?? 'Supplier';
  const image = firstImage(
    supplier.logo,
    supplier.companyLogo,
    supplier.logoUrl,
    supplier.factoryImages,
  );
  const location =
    [supplier.address?.city, supplier.address?.country ?? supplier.country]
      .filter(Boolean)
      .join(', ') || 'Worldwide';
  const isVerified =
    supplier.isVerified === true || supplier.verificationStatus === 'verified';
  const rating = supplier.rating ? Number(supplier.rating).toFixed(1) : null;

  const handlePress = () => {
    navigation.navigate('SellerDetails', { sellerId: supplierId, sellerName: title });
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.supplierCard, pressed && styles.pressed]}>
      {/* Logo */}
      <View style={styles.logoContainer}>
        {image ? (
          <RemoteImage uri={image} width={52} height={52} style={styles.logo} />
        ) : (
          <View style={styles.logoPlaceholder}>
            <Text style={styles.logoText}>{title.slice(0, 1).toUpperCase()}</Text>
          </View>
        )}
        {isVerified && (
          <View style={styles.verifiedDot}>
            <Icon name="check" size={8} color="#FFF" />
          </View>
        )}
      </View>

      {/* Info */}
      <View style={styles.supplierInfo}>
        <Text style={styles.supplierName} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.locationRow}>
          <Icon name="map-marker-outline" size={11} color={P.muted} />
          <Text style={styles.supplierLocation} numberOfLines={1}>
            {location}
          </Text>
        </View>
        <View style={styles.badgeRow}>
          {rating && (
            <View style={styles.miniBadge}>
              <Icon name="star" size={9} color={P.amber} />
              <Text style={styles.miniBadgeText}>{rating}</Text>
            </View>
          )}
          {supplier.productCount ? (
            <View style={styles.miniBadge}>
              <Icon name="package-variant-closed" size={9} color={P.accent} />
              <Text style={styles.miniBadgeText}>{supplier.productCount} items</Text>
            </View>
          ) : null}
          {item.createdAt && (
            <Text style={styles.savedTime}>{getRelativeTime(item.createdAt)}</Text>
          )}
        </View>
      </View>

      {/* Heart */}
      <SavedHeartButton
        type="supplier"
        itemId={supplierId}
        target={supplier}
        size={16}
        style={styles.heartBtn}
        iconColor={P.muted}
        savedColor={P.rose}
      />
    </Pressable>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: P.bg,
  },
  content: {
    paddingBottom: 100,
  },

  // Center
  centerScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: P.bg,
    padding: 24,
    gap: 12,
  },
  authIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: P.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  authTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: P.ink,
    letterSpacing: -0.3,
  },
  authSubtitle: {
    fontSize: 14,
    color: P.textSecondary,
    textAlign: 'center',
  },
  authButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: P.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 12,
  },
  authButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 15,
  },

  // Header
  headerSection: {
    backgroundColor: P.bg,
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: P.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: P.border,
  },
  pageTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: P.ink,
    letterSpacing: -0.3,
  },
  countBadge: {
    backgroundColor: P.primary,
    borderRadius: 10,
    minWidth: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  countBadgeText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },

  // Filter Pills
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: P.border,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: P.surface,
    borderWidth: 1,
    borderColor: P.border,
  },
  filterPillActive: {
    backgroundColor: P.primary,
    borderColor: P.primary,
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: P.textSecondary,
  },
  filterPillTextActive: {
    color: '#FFF',
  },
  filterCount: {
    backgroundColor: P.border,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  filterCountActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  filterCountText: {
    fontSize: 10,
    fontWeight: '700',
    color: P.muted,
  },
  filterCountTextActive: {
    color: '#FFF',
  },

  // Product Card
  productCard: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: P.surface,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: P.border,
  },
  productCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: P.border,
  },
  productPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: P.ink,
  },
  savedTime: {
    fontSize: 11,
    fontWeight: '500',
    color: P.muted,
  },

  // Supplier Card
  supplierCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: P.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: P.border,
    gap: 12,
  },
  pressed: {
    backgroundColor: P.bg,
  },
  logoContainer: {
    position: 'relative',
  },
  logo: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: P.border,
  },
  logoPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: P.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: 20,
    fontWeight: '700',
    color: P.accent,
  },
  verifiedDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: P.emerald,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: P.surface,
  },
  supplierInfo: {
    flex: 1,
    gap: 3,
  },
  supplierName: {
    fontSize: 14,
    fontWeight: '600',
    color: P.ink,
    letterSpacing: -0.2,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  supplierLocation: {
    fontSize: 12,
    color: P.textSecondary,
    flex: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  miniBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: P.border,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  miniBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: P.textSecondary,
  },
  heartBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
  },
});

export default SavedItemsScreen;