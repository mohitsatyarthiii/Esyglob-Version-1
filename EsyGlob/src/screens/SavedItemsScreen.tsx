import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  ListRenderItemInfo,
  Pressable,
  RefreshControl,
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

// ─── Vibrant Palette ────────────────────────────────────────────────────────

const PALETTE = {
  bg: '#F8F6FE',
  card: '#FFFFFF',
  primary: '#6C5CE7',
  primaryLight: '#EDEAFC',
  gradient1: '#FF6B6B',
  gradient2: '#FF8E53',
  accent: '#00D2FF',
  accentLight: '#E0F9FF',
  emerald: '#00D68F',
  emeraldLight: '#E0FFF5',
  amber: '#FFA800',
  amberLight: '#FFF8E6',
  rose: '#FF3D71',
  roseLight: '#FFF0F5',
  violet: '#7B61FF',
  violetLight: '#F3F0FF',
  ink: '#1A1A2E',
  text: '#4A4A68',
  muted: '#9898B0',
  faint: '#E8E8F0',
  surface: '#FFFFFF',
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
        <View style={styles.authIconWrap}>
          <Icon name="heart-outline" size={40} color={PALETTE.primary} />
        </View>
        <Text style={styles.authTitle}>Your Wishlist Awaits</Text>
        <Text style={styles.authSubtitle}>
          Sign in to save your favourite products and suppliers
        </Text>
        <Pressable
          onPress={() => navigation.navigate('Auth', { initialMode: 'login' })}
          style={styles.authButton}>
          <Icon name="login" size={16} color="#FFF" />
          <Text style={styles.authButtonText}>Sign In</Text>
        </Pressable>
      </View>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────

  if (savedItems.isLoading) {
    return <LoadingState label="Loading your wishlist..." />;
  }

  // ── Error ─────────────────────────────────────────────────────────────

  if (savedItems.isError) {
    return (
      <ErrorState
        message={
          (savedItems.error as Error)?.message ?? 'Saved items could not be loaded.'
        }
        onRetry={() => savedItems.refetch()}
      />
    );
  }

  // ── Main List ─────────────────────────────────────────────────────────

  const renderItem = ({ item, index }: ListRenderItemInfo<NormalizedSavedItem>) => {
    if (item.type === 'supplier' && item.supplier) {
      return <SavedSupplierCard item={item} index={index} />;
    }
    if (item.type === 'product' && item.product) {
      return <SavedProductCard item={item} index={index} />;
    }
    return null;
  };

  return (
    <View style={styles.screen}>
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.content}
        data={visibleItems}
        keyExtractor={item => item._id}
        refreshControl={
          <RefreshControl
            refreshing={savedItems.isRefetching}
            onRefresh={handleRefresh}
            tintColor={PALETTE.primary}
            colors={[PALETTE.primary, PALETTE.gradient2]}
          />
        }
        ListHeaderComponent={
          <View>
            {/* Header */}
            <View style={styles.header}>
              <Pressable
                onPress={() => navigation.goBack()}
                style={styles.backButton}>
                <Icon name="arrow-left" size={20} color={PALETTE.ink} />
              </Pressable>
              <View style={styles.headerText}>
                <Text style={styles.kicker}>Wishlist</Text>
                <Text style={styles.title}>Saved Items</Text>
              </View>
              <View style={styles.countBadge}>
                <Text style={styles.countText}>{counts.all}</Text>
              </View>
            </View>

            {/* Segmented Tabs */}
            <View style={styles.segmentWrap}>
              <View style={styles.segment}>
                {(['all', 'product', 'supplier'] as const).map(seg => (
                  <Pressable
                    key={seg}
                    onPress={() => setFilter(seg)}
                    style={[
                      styles.segmentButton,
                      filter === seg && styles.segmentButtonActive,
                    ]}>
                    <Text
                      style={[
                        styles.segmentText,
                        filter === seg && styles.segmentTextActive,
                      ]}>
                      {segmentLabel(seg)}
                    </Text>
                    {filter === seg && (
                      <View style={styles.segmentDot} />
                    )}
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Section Title */}
            {visibleItems.length > 0 && (
              <Text style={styles.sectionTitle}>
                {filter === 'all'
                  ? 'Recently Saved'
                  : filter === 'product'
                  ? 'Saved Products'
                  : 'Saved Suppliers'}
              </Text>
            )}
          </View>
        }
        renderItem={renderItem}
        ListEmptyComponent={
          <EmptyState
           
            title="Nothing saved yet"
            detail="Tap the heart icon on any product or supplier to add it here."
          />
        }
      />
    </View>
  );
}

// ─── Saved Product Card (Compact & Colorful) ───────────────────────────────

function SavedProductCard({
  item,
  index,
}: {
  item: NormalizedSavedItem;
  index: number;
}) {
  const product = item.product!;
  const accentColors = [PALETTE.violetLight, PALETTE.emeraldLight, PALETTE.amberLight, PALETTE.roseLight];
  const accentColor = accentColors[index % accentColors.length];

  return (
    <View style={[styles.productWrap, { backgroundColor: accentColor }]}>
      <ProductCard product={product} variant="full" />
      <View style={styles.productFooter}>
        <View style={styles.productFooterLeft}>
          <Text style={styles.productPrice}>{formatProductPrice(product)}</Text>
          {product.category && (
            <View style={styles.categoryTag}>
              <Text style={styles.categoryTagText} numberOfLines={1}>
                {typeof product.category === 'string'
                  ? product.category
                  : (product.category as { name?: string })?.name ?? ''}
              </Text>
            </View>
          )}
        </View>
        {item.createdAt && (
          <Text style={styles.timeAgo}>{getRelativeTime(item.createdAt)}</Text>
        )}
      </View>
    </View>
  );
}

// ─── Saved Supplier Card (Compact & Colorful) ──────────────────────────────

function SavedSupplierCard({
  item,
  index,
}: {
  item: NormalizedSavedItem;
  index: number;
}) {
  const navigation = useNavigation<any>();
  const supplier = item.supplier!;

  const supplierId = getStableKey(supplier);
  const title =
    supplier.companyName ??
    supplier.businessName ??
    supplier.displayName ??
    'Supplier';
  const image = firstImage(
    supplier.logo,
    supplier.companyLogo,
    supplier.logoUrl,
    supplier.factoryImages,
  );
  const location =
    [
      supplier.address?.city,
      supplier.address?.country ?? supplier.country,
    ]
      .filter(Boolean)
      .join(', ') || 'Worldwide';
  const isVerified =
    supplier.isVerified === true || supplier.verificationStatus === 'verified';
  const rating = supplier.rating ? Number(supplier.rating).toFixed(1) : null;

  // Rotate through vibrant accent colors
  const avatarColors = [
    { bg: PALETTE.violetLight, text: PALETTE.violet },
    { bg: PALETTE.emeraldLight, text: PALETTE.emerald },
    { bg: PALETTE.amberLight, text: PALETTE.amber },
    { bg: PALETTE.roseLight, text: PALETTE.rose },
  ];
  const avatarColor = avatarColors[index % avatarColors.length];

  const handlePress = () => {
    navigation.navigate('SellerDetails', { sellerId: supplierId, sellerName: title });
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.supplierCard,
        pressed && styles.pressed,
      ]}>
      {/* Avatar */}
      {image ? (
        <RemoteImage
          uri={image}
          width={120}
          height={120}
          style={styles.supplierLogo}
        />
      ) : (
        <View style={[styles.supplierLogoPlaceholder, { backgroundColor: avatarColor.bg }]}>
          <Text style={[styles.supplierInitial, { color: avatarColor.text }]}>
            {title.slice(0, 2).toUpperCase()}
          </Text>
        </View>
      )}

      {/* Content */}
      <View style={styles.supplierContent}>
        <View style={styles.supplierTopRow}>
          <Text numberOfLines={1} style={styles.supplierTitle}>
            {title}
          </Text>
          {isVerified && (
            <Icon name="check-decagram" size={14} color={PALETTE.emerald} />
          )}
        </View>

        <View style={styles.supplierMetaRow}>
          <Icon name="map-marker-outline" size={11} color={PALETTE.muted} />
          <Text numberOfLines={1} style={styles.supplierLocation}>
            {location}
          </Text>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          {rating && (
            <View style={[styles.statPill, { backgroundColor: PALETTE.amberLight }]}>
              <Icon name="star" size={10} color={PALETTE.amber} />
              <Text style={[styles.statPillText, { color: PALETTE.amber }]}>
                {rating}
              </Text>
            </View>
          )}
          {supplier.productCount ? (
            <View style={[styles.statPill, { backgroundColor: PALETTE.primaryLight }]}>
              <Icon name="package-variant-closed" size={10} color={PALETTE.primary} />
              <Text style={[styles.statPillText, { color: PALETTE.primary }]}>
                {supplier.productCount}
              </Text>
            </View>
          ) : null}
          {item.createdAt && (
            <View style={[styles.statPill, { backgroundColor: PALETTE.faint }]}>
              <Icon name="clock-outline" size={10} color={PALETTE.muted} />
              <Text style={[styles.statPillText, { color: PALETTE.muted }]}>
                {getRelativeTime(item.createdAt)}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Heart Button */}
      <SavedHeartButton
        type="supplier"
        itemId={supplierId}
        target={supplier}
        size={16}
        style={styles.supplierHeart}
        iconColor={PALETTE.muted}
        savedColor={PALETTE.rose}
      />
    </Pressable>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: PALETTE.bg,
  },
  list: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: 100,
    paddingTop: spacing.xl,
  },

  // ── Center Screen (Unauthenticated) ───────────────────────────────────

  centerScreen: {
    alignItems: 'center',
    backgroundColor: PALETTE.bg,
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  authIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: PALETTE.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  authTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: PALETTE.ink,
    letterSpacing: -0.3,
  },
  authSubtitle: {
    fontSize: 13,
    color: PALETTE.muted,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 260,
  },
  authButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: PALETTE.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    marginTop: spacing.lg,
    ...shadow,
  },
  authButtonText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },

  // ── Header ────────────────────────────────────────────────────────────

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: PALETTE.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  headerText: {
    flex: 1,
  },
  kicker: {
    fontSize: 10,
    fontWeight: '800',
    color: PALETTE.primary,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: PALETTE.ink,
    letterSpacing: -0.5,
    marginTop: 1,
  },
  countBadge: {
    backgroundColor: PALETTE.primary,
    borderRadius: 16,
    minWidth: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  countText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
  },

  // ── Segmented Tabs ────────────────────────────────────────────────────

  segmentWrap: {
    marginBottom: spacing.lg,
  },
  segment: {
    backgroundColor: PALETTE.card,
    borderRadius: radii.lg,
    flexDirection: 'row',
    padding: 4,
    ...shadow,
  },
  segmentButton: {
    alignItems: 'center',
    borderRadius: radii.md,
    flex: 1,
    paddingVertical: spacing.sm + 2,
    gap: 4,
  },
  segmentButtonActive: {
    backgroundColor: PALETTE.primaryLight,
  },
  segmentText: {
    color: PALETTE.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  segmentTextActive: {
    color: PALETTE.primary,
    fontWeight: '800',
  },
  segmentDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: PALETTE.primary,
  },

  // ── Section Title ─────────────────────────────────────────────────────

  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: PALETTE.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.md,
  },

  // ── Product Card ──────────────────────────────────────────────────────

  productWrap: {
    borderRadius: radii.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
    padding: spacing.sm,
  },
  productFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  productFooterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  productPrice: {
    fontSize: 14,
    fontWeight: '800',
    color: PALETTE.ink,
    letterSpacing: -0.3,
  },
  categoryTag: {
    backgroundColor: 'rgba(255,255,255,0.7)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
    maxWidth: 100,
  },
  categoryTagText: {
    fontSize: 9,
    fontWeight: '700',
    color: PALETTE.text,
  },
  timeAgo: {
    fontSize: 10,
    fontWeight: '600',
    color: PALETTE.muted,
  },

  // ── Supplier Card ─────────────────────────────────────────────────────

  supplierCard: {
    flexDirection: 'row',
    backgroundColor: PALETTE.card,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    alignItems: 'center',
    gap: spacing.md,
    ...shadow,
  },
  supplierLogo: {
    width: 52,
    height: 52,
    borderRadius: radii.md,
    backgroundColor: PALETTE.faint,
  },
  supplierLogoPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supplierInitial: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  supplierContent: {
    flex: 1,
    gap: 3,
  },
  supplierTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  supplierTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: PALETTE.ink,
    flex: 1,
    letterSpacing: -0.2,
  },
  supplierMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  supplierLocation: {
    fontSize: 11,
    color: PALETTE.muted,
    fontWeight: '500',
    flex: 1,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: 2,
    flexWrap: 'wrap',
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.sm - 1,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  statPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  supplierHeart: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
});

export default SavedItemsScreen;