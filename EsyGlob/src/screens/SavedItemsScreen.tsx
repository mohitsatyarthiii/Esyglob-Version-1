import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
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

type Filter = 'all' | SavedItemType;

function SavedItemsScreen() {
  const navigation = useNavigation<any>();
  const { status } = useAuth();
  const [filter, setFilter] = useState<Filter>('all');
  const savedItems = useQuery({
    queryKey: ['saved-items'],
    queryFn: () => fetchSavedItems(),
    enabled: status === 'authenticated',
    staleTime: 60_000,
  });
  const visibleItems = useMemo(
    () => (savedItems.data ?? []).filter(item => filter === 'all' || item.type === filter),
    [filter, savedItems.data],
  );

  if (status !== 'authenticated') {
    return (
      <View style={styles.centerScreen}>
        <Icon name="heart-outline" size={34} color={colors.primary} />
        <Text style={styles.emptyTitle}>Sign in to view saved items</Text>
        <Pressable onPress={() => navigation.navigate('Auth', { initialMode: 'login' })} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Login</Text>
        </Pressable>
      </View>
    );
  }

  if (savedItems.isLoading) {
    return <LoadingState label="Loading saved items" />;
  }

  if (savedItems.isError) {
    return <ErrorState message={(savedItems.error as Error)?.message ?? 'Saved items could not be loaded.'} onRetry={() => savedItems.refetch()} />;
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={visibleItems}
      keyExtractor={item => getSavedKey(item)}
      refreshControl={<RefreshControl refreshing={savedItems.isRefetching} onRefresh={() => savedItems.refetch()} tintColor={colors.primary} />}
      ListHeaderComponent={(
        <View>
          <View style={styles.header}>
            <Pressable onPress={() => navigation.goBack()} style={styles.iconButton}>
              <Icon name="arrow-left" size={22} color={colors.ink} />
            </Pressable>
            <View style={styles.headerText}>
              <Text style={styles.kicker}>Wishlist</Text>
              <Text style={styles.title}>Saved Items</Text>
            </View>
          </View>
          <View style={styles.segment}>
            {(['all', 'product', 'seller'] as const).map(item => (
              <Pressable key={item} onPress={() => setFilter(item)} style={[styles.segmentButton, filter === item && styles.segmentButtonActive]}>
                <Text style={[styles.segmentText, filter === item && styles.segmentTextActive]}>{segmentLabel(item)}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
      renderItem={({ item }) => item.type === 'seller' ? <SavedSeller item={item} /> : <SavedProduct item={item} />}
      ListEmptyComponent={<EmptyState title="No saved items yet" detail="Use the heart icon on products and suppliers to build your shortlist." />}
    />
  );
}

function SavedProduct({ item }: { item: SavedItem }) {
  const product = (item.product ?? item.target ?? item.item) as Product | undefined;

  if (!product) {
    return null;
  }

  return (
    <View style={styles.productWrap}>
      <ProductCard product={product} variant="full" />
      <Text style={styles.productMeta}>{formatProductPrice(product)}</Text>
    </View>
  );
}

function SavedSeller({ item }: { item: SavedItem }) {
  const navigation = useNavigation<any>();
  const seller = (item.seller ?? item.target ?? item.item) as SellerSummary | undefined;

  if (!seller) {
    return null;
  }

  const sellerId = getStableKey(seller);
  const title = seller.companyName ?? seller.businessName ?? seller.displayName ?? 'Supplier';
  const image = firstImage(seller.logo, seller.companyLogo, seller.factoryImages);
  const location = [seller.address?.city, seller.address?.country ?? seller.country].filter(Boolean).join(', ') || 'Worldwide';

  return (
    <Pressable onPress={() => navigation.navigate('SellerDetails', { sellerId, sellerName: title })} style={({ pressed }) => [styles.sellerCard, pressed && styles.pressed]}>
      <RemoteImage
        uri={image}
        width={140}
        height={140}
        style={styles.sellerLogo}
        fallback={<Text style={styles.sellerInitial}>{title.slice(0, 1).toUpperCase()}</Text>}
      />
      <View style={styles.sellerBody}>
        <Text numberOfLines={2} style={styles.sellerTitle}>{title}</Text>
        <Text numberOfLines={1} style={styles.sellerMeta}>{location}</Text>
        <View style={styles.sellerBadges}>
          {seller.isVerified || seller.verificationStatus === 'verified' ? <MiniBadge icon="check-decagram" text="Verified" /> : null}
          {seller.productCount ? <MiniBadge icon="package-variant-closed" text={`${seller.productCount} products`} /> : null}
        </View>
      </View>
      <SavedHeartButton type="seller" itemId={sellerId} target={seller} size={18} style={styles.savedAction} iconColor={colors.muted} />
    </Pressable>
  );
}

function MiniBadge({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.badge}>
      <Icon name={icon} size={11} color={colors.primary} />
      <Text style={styles.badgeText}>{text}</Text>
    </View>
  );
}

function getSavedKey(item: SavedItem) {
  return item._id ?? item.id ?? `${item.type}-${item.itemId}`;
}

function segmentLabel(item: Filter) {
  if (item === 'all') return 'All';
  if (item === 'product') return 'Products';
  return 'Suppliers';
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 112, paddingTop: spacing.xxl },
  centerScreen: { alignItems: 'center', backgroundColor: colors.background, flex: 1, gap: spacing.md, justifyContent: 'center', padding: spacing.xl },
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  iconButton: { alignItems: 'center', backgroundColor: colors.card, borderRadius: radii.pill, height: 42, justifyContent: 'center', width: 42, ...shadow },
  headerText: { flex: 1 },
  kicker: { color: colors.primary, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  title: { color: colors.ink, fontSize: 22, fontWeight: '900', marginTop: 2 },
  segment: { backgroundColor: colors.cardMuted, borderRadius: radii.pill, flexDirection: 'row', marginBottom: spacing.lg, padding: spacing.xs },
  segmentButton: { alignItems: 'center', borderRadius: radii.pill, flex: 1, paddingVertical: spacing.sm },
  segmentButtonActive: { backgroundColor: colors.card },
  segmentText: { color: colors.muted, fontSize: 12, fontWeight: '900' },
  segmentTextActive: { color: colors.primaryDark },
  productWrap: { marginBottom: spacing.md },
  productMeta: { color: colors.muted, fontSize: 11, fontWeight: '800', marginTop: -spacing.sm, paddingHorizontal: spacing.sm },
  sellerCard: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.faint, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md, padding: spacing.md, ...shadow },
  sellerLogo: { alignItems: 'center', backgroundColor: '#fff8f3', borderRadius: radii.md, height: 64, justifyContent: 'center', overflow: 'hidden', width: 64 },
  sellerInitial: { color: colors.primaryDark, fontSize: 22, fontWeight: '900' },
  sellerBody: { flex: 1 },
  sellerTitle: { color: colors.ink, fontSize: 15, fontWeight: '900', lineHeight: 19 },
  sellerMeta: { color: colors.muted, fontSize: 12, fontWeight: '800', marginTop: 3 },
  sellerBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  badge: { alignItems: 'center', backgroundColor: '#fff8f3', borderColor: '#ffe0d0', borderRadius: radii.pill, borderWidth: 1, flexDirection: 'row', gap: 3, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  badgeText: { color: colors.primaryDark, fontSize: 10, fontWeight: '900' },
  savedAction: { height: 34, width: 34 },
  emptyTitle: { color: colors.ink, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  primaryButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.pill, minWidth: 132, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  primaryButtonText: { color: '#fff', fontWeight: '900' },
  pressed: { opacity: 0.78 },
});

export default SavedItemsScreen;
