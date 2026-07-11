import React, { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import { fetchCategories } from '../api/categories';
import { Category } from '../api/types';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import RemoteImage from '../components/RemoteImage';
import { getStableKey } from '../utils/format';
import { firstImage } from '../utils/images';

// ─── Constants ──────────────────────────────────────────────────────────────

const SIDEBAR_WIDTH = 90;
const COLUMN_COUNT = 3;
const CARD_MARGIN = 6;

// ─── Palette ────────────────────────────────────────────────────────────────

const P = {
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  primary: '#2563EB',
  primaryLight: '#EFF6FF',
  text: '#0F172A',
  textSecondary: '#475569',
  muted: '#94A3B8',
  border: '#E2E8F0',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

// ─── Helpers ────────────────────────────────────────────────────────────────

function getCategoryImage(item: Category): string | null {
  const record = item as Record<string, unknown>;
  const metadata = record.metadata as Record<string, unknown> | undefined;

  return firstImage(
    (record.image as string) ?? null,
    (record.imageUrl as string) ?? null,
    (record.thumbnail as string) ?? null,
    (record.thumbnailUrl as string) ?? null,
    (record.icon as string) ?? null,
    (record.coverImage as string) ?? null,
    (record.bannerImage as string) ?? null,
    (record.images as string[]) ?? null,
    metadata ? ((metadata.image as string) ?? null) : null,
    metadata ? ((metadata.imageUrl as string) ?? null) : null,
    metadata ? ((metadata.thumbnail as string) ?? null) : null,
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

function CategoriesScreen() {
  const navigation = useNavigation<any>();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: categoriesData, isLoading, isError, error, refetch } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: fetchCategories,
    staleTime: 5 * 60_000,
  });

  const categories: Category[] = useMemo(() => categoriesData ?? [], [categoriesData]);

  const selectedCategory: Category | null = useMemo(() => {
    if (!categories.length) return null;
    return categories.find((item: Category) => getStableKey(item) === selectedId) || null;
  }, [categories, selectedId]);

  const displayItems: Category[] = useMemo(() => {
    if (!selectedCategory) return categories;
    const subs = selectedCategory.subcategories;
    return subs && subs.length > 0 ? subs : [];
  }, [selectedCategory, categories]);

  const handleCategoryPress = useCallback(
    (category: Category) => {
      const name = category.name ?? category.slug ?? '';
      navigation.navigate('ProductListing', {
        category: name,
        categoryName: name,
      });
    },
    [navigation],
  );

  const handleSubcategoryPress = useCallback(
    (subcategory: Category) => {
      if (!selectedCategory) return;
      const catName = selectedCategory.name ?? selectedCategory.slug ?? '';
      const subName = subcategory.name ?? subcategory.slug ?? '';
      navigation.navigate('ProductListing', {
        category: catName,
        categoryName: catName,
        subcategory: subName,
        subcategoryName: subName,
      });
    },
    [navigation, selectedCategory],
  );

  // ── Loading / Error / Empty ─────────────────────────────────────────────

  if (isLoading) return <LoadingState label="Loading categories..." />;
  if (isError)
    return (
      <ErrorState
        message={(error as Error)?.message ?? 'Failed to load'}
        onRetry={() => refetch()}
      />
    );
  if (!categories.length)
    return <EmptyState title="No categories" detail="Check back later." />;

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={P.surface} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Categories</Text>
        <Pressable
          onPress={() => navigation.navigate('Search')}
          style={styles.searchBtn}>
          <Icon name="magnify" size={20} color={P.textSecondary} />
        </Pressable>
      </View>

      {/* Body */}
      <View style={styles.body}>
        {/* Sidebar */}
        <View style={styles.sidebar}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.sidebarContent}>
            {/* All Categories */}
            <Pressable
              onPress={() => setSelectedId(null)}
              style={[
                styles.sidebarItem,
                !selectedId && styles.sidebarItemActive,
              ]}>
              {!selectedId && <View style={styles.sidebarIndicator} />}
              <Icon
                name="view-grid"
                size={18}
                color={!selectedId ? P.primary : P.muted}
              />
              <Text
                style={[
                  styles.sidebarText,
                  !selectedId && styles.sidebarTextActive,
                ]}>
                All
              </Text>
            </Pressable>

            {/* Category List */}
            {categories.map((cat: Category) => {
              const id = getStableKey(cat);
              const isActive = id === selectedId;
              const img = getCategoryImage(cat);

              return (
                <Pressable
                  key={id}
                  onPress={() => setSelectedId(id)}
                  style={[
                    styles.sidebarItem,
                    isActive && styles.sidebarItemActive,
                  ]}>
                  {isActive && <View style={styles.sidebarIndicator} />}
                  <RemoteImage
                    uri={img}
                    width={32}
                    height={32}
                    style={styles.sidebarIcon}
                    fallback={
                      <Icon
                        name="package-variant"
                        size={16}
                        color={isActive ? P.primary : P.muted}
                      />
                    }
                  />
                  <Text
                    style={[
                      styles.sidebarText,
                      isActive && styles.sidebarTextActive,
                    ]}
                    numberOfLines={2}>
                    {cat.name ?? cat.slug ?? 'Category'}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Main Content */}
        <View style={styles.mainContent}>
          <FlashList
            data={displayItems}
            keyExtractor={(item: Category) => getStableKey(item)}
            numColumns={COLUMN_COUNT}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.gridContent}
            ListHeaderComponent={
              <View>
                {/* Banner */}
                <View style={styles.banner}>
                  <View style={styles.bannerContent}>
                    <View style={styles.bannerBadge}>
                      <Icon name="lightning-bolt" size={10} color="#FFF" />
                      <Text style={styles.bannerBadgeText}>Express</Text>
                    </View>
                    <Text style={styles.bannerTitle}>Fastest Delivery</Text>
                    <Text style={styles.bannerSub}>
                      in just 5 days · No import charges
                    </Text>
                  </View>
                  <View style={styles.bannerIcon}>
                    <Icon name="truck-fast" size={26} color="#FFF" />
                  </View>
                </View>

                {/* Section Header */}
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>
                    {selectedCategory?.name || 'All Categories'}
                  </Text>
                  {selectedCategory && (
                    <Pressable
                      onPress={() => handleCategoryPress(selectedCategory)}
                      style={styles.viewAll}>
                      <Text style={styles.viewAllText}>View All</Text>
                      <Icon name="chevron-right" size={14} color={P.primary} />
                    </Pressable>
                  )}
                </View>
              </View>
            }
            renderItem={({ item }: { item: Category }) => {
              const img = getCategoryImage(item);
              const count =
                (item as any).productCount ?? (item as any).count ?? 0;

              return (
                <Pressable
                  onPress={() =>
                    selectedCategory
                      ? handleSubcategoryPress(item)
                      : handleCategoryPress(item)
                  }
                  style={styles.categoryCard}>
                  <View style={styles.imageContainer}>
                    <RemoteImage
                      uri={img}
                      width={70}
                      height={70}
                      style={styles.categoryImage}
                      fallback={
                        <View style={styles.fallbackContainer}>
                          <Icon
                            name="package-variant"
                            size={24}
                            color={P.primary}
                          />
                        </View>
                      }
                    />
                  </View>
                  <Text style={styles.categoryName} numberOfLines={2}>
                    {item.name ?? item.slug ?? 'Category'}
                  </Text>
                  {count > 0 && (
                    <Text style={styles.productCount}>{count} items</Text>
                  )}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <EmptyState
                title="No subcategories"
                detail="This category has no subcategories yet."
              />
            }
          />
        </View>
      </View>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: P.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 14,
    paddingBottom: 10,
    backgroundColor: P.surface,
    borderBottomWidth: 1,
    borderBottomColor: P.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: P.text,
    letterSpacing: -0.3,
  },
  searchBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: P.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  body: { flex: 1, flexDirection: 'row' },

  // Sidebar
  sidebar: {
    width: SIDEBAR_WIDTH,
    backgroundColor: P.surface,
    borderRightWidth: 1,
    borderRightColor: P.border,
  },
  sidebarContent: { paddingVertical: 6 },
  sidebarItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    position: 'relative',
    gap: 3,
  },
  sidebarItemActive: { backgroundColor: P.primaryLight },
  sidebarIndicator: {
    position: 'absolute',
    left: 0,
    top: 6,
    bottom: 6,
    width: 3,
    backgroundColor: P.primary,
    borderRadius: 2,
  },
  sidebarIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: P.bg,
  },
  sidebarText: {
    fontSize: 9,
    fontWeight: '500',
    color: P.muted,
    textAlign: 'center',
    lineHeight: 11,
  },
  sidebarTextActive: { color: P.primary, fontWeight: '700' },

  // Main Content
  mainContent: { flex: 1, backgroundColor: P.bg },
  gridContent: { paddingHorizontal: 8, paddingBottom: 100 },

  // Banner
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E1B4B',
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 4,
    marginTop: 8,
    marginBottom: 14,
  },
  bannerContent: { flex: 1 },
  bannerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  bannerBadgeText: { color: '#FFF', fontSize: 9, fontWeight: '700' },
  bannerTitle: { color: '#FFF', fontSize: 15, fontWeight: '700', marginBottom: 2 },
  bannerSub: { color: 'rgba(255,255,255,0.7)', fontSize: 10 },
  bannerIcon: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 24,
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },

  // Section Header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: P.text },
  viewAll: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: P.surface,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: P.border,
  },
  viewAllText: {
    fontSize: 10,
    fontWeight: '600',
    color: P.primary,
    marginRight: 2,
  },

  // Category Cards
  categoryCard: {
    alignItems: 'center',
    flex: 1,
    marginBottom: 14,
    paddingHorizontal: 3,
  },
  imageContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: P.surface,
    borderRadius: 40,
    width: 72,
    height: 72,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  categoryImage: {
    borderRadius: 36,
    width: 72,
    height: 72,
  },
  fallbackContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryName: {
    fontSize: 10,
    fontWeight: '600',
    color: P.text,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 13,
  },
  productCount: {
    fontSize: 8,
    fontWeight: '500',
    color: P.muted,
    marginTop: 2,
  },
});

export default React.memo(CategoriesScreen);