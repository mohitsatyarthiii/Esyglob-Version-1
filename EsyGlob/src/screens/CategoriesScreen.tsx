import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import { fetchCategories } from '../api/categories';
import { Category } from '../api/types';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import RemoteImage from '../components/RemoteImage';
import { colors } from '../theme';
import { getCategoryIcon, getId, getStableKey } from '../utils/format';
import { firstImage } from '../utils/images';
import { logPerf, perfNow } from '../utils/performance';

const { width } = Dimensions.get('window');

// Responsive sizing based on device
const isTablet = width >= 768;
const SIDEBAR_WIDTH = isTablet ? width * 0.22 : width * 0.25; // Increased sidebar width
const COLUMN_COUNT = isTablet ? 4 : 3;
const CARD_MARGIN = 8;
const AVAILABLE_WIDTH = width - SIDEBAR_WIDTH - 24;
const CARD_SIZE = (AVAILABLE_WIDTH - (COLUMN_COUNT - 1) * CARD_MARGIN * 2) / COLUMN_COUNT;

const CategoriesScreen = () => {
  const navigation = useNavigation<any>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const screenStart = useRef(perfNow()).current;
  const visibleLogged = useRef(false);

  const {
    data: categoriesData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
    staleTime: 5 * 60_000,
  });

  const categories = useMemo(() => categoriesData ?? [], [categoriesData]);

  const selectedCategory = useMemo(() => {
    if (!categories.length) return null;
    return (
      categories.find((item) => getStableKey(item) === selectedId) || categories[0]
    );
  }, [categories, selectedId]);

  const recommendationItems = useMemo(() => {
    if (!selectedCategory) return categories;
    return selectedCategory.subcategories?.length
      ? selectedCategory.subcategories
      : categories;
  }, [selectedCategory, categories]);

  const selectedCategoryId = useMemo(() => {
    return selectedCategory ? getStableKey(selectedCategory) : '';
  }, [selectedCategory]);

  const handleCategoryPress = useCallback((category: Category) => {
    navigation.navigate('ProductListing', {
      category: category.name ?? getId(category),
      categoryName: category.name,
    });
  }, [navigation]);

  const handleSidebarItemPress = useCallback((itemId: string) => {
    setSelectedId(itemId);
  }, []);

  useEffect(() => {
    if (!visibleLogged.current && recommendationItems.length) {
      visibleLogged.current = true;
      logPerf('screen:categories-visible', {
        categories: categories.length,
        visibleItems: recommendationItems.length,
        ms: Math.round(perfNow() - screenStart),
      });
    }
  }, [categories.length, recommendationItems.length, screenStart]);

  if (isLoading) {
    return <LoadingState label="Loading categories" />;
  }

  if (isError) {
    return (
      <ErrorState
        message={(error as Error).message}
        onRetry={() => refetch()}
      />
    );
  }

  if (!categories.length) {
    return (
      <EmptyState
        title="No active categories"
        detail="The backend returned an empty category list."
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Categories</Text>
          <Pressable style={styles.headerIconButton}>
            <Icon name="help-box-outline" size={22} color={colors.ink} />
          </Pressable>
        </View>

        {/* Body */}
        <View style={styles.body}>
          {/* Sidebar - 25% width */}
          <View style={styles.sidebarContainer}>
            <ScrollView
              style={styles.sidebar}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.sidebarContent}
            >
              {categories.map((item) => {
                const isActive = getStableKey(item) === selectedCategoryId;
                return (
                  <Pressable
                    key={getStableKey(item)}
                    onPress={() => handleSidebarItemPress(getStableKey(item))}
                    style={({ pressed }) => [
                      styles.sidebarItem,
                      isActive && styles.sidebarItemActive,
                      pressed && styles.sidebarItemPressed,
                    ]}
                  >
                    {isActive && <View style={styles.sidebarIndicator} />}
                    <Text
                      numberOfLines={3} // Allow 3 lines for long names
                      style={[
                        styles.sidebarItemText,
                        isActive && styles.sidebarItemTextActive,
                      ]}
                    >
                      {item.name ?? item.slug ?? 'Category'}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Main Content - 75% width */}
          <FlashList
            style={styles.mainContent}
            contentContainerStyle={styles.mainContentContainer}
            data={recommendationItems}
            keyExtractor={(item) => getStableKey(item)}
            numColumns={COLUMN_COUNT}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <View style={styles.headerComponent}>
                {/* Banner */}
                <Pressable
                  onPress={() => selectedCategory && handleCategoryPress(selectedCategory)}
                  style={styles.banner}
                >
                  <View style={styles.bannerContent}>
                    <View style={styles.bannerBadge}>
                      <Text style={styles.bannerBadgeText}>⚡ Express</Text>
                    </View>
                    <Text style={styles.bannerTitle}>Fastest Delivery</Text>
                    <Text style={styles.bannerSubtitle}>
                      in just 5 days • No import charges
                    </Text>
                  </View>
                  <View style={styles.bannerIconContainer}>
                    <Icon name="truck-fast-outline" size={28} color="#fff" />
                  </View>
                </Pressable>

                {/* Section Header */}
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>
                    {selectedCategory?.name || 'All Categories'}
                  </Text>
                  <Pressable style={styles.viewAllButton}>
                    <Text style={styles.viewAllText}>View All</Text>
                    <Icon name="chevron-right" size={14} color={colors.primary} />
                  </Pressable>
                </View>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => handleCategoryPress(item)}
                style={({ pressed }) => [
                  styles.categoryCard,
                  pressed && styles.categoryCardPressed,
                ]}
              >
                <View style={styles.categoryImageContainer}>
                  <RemoteImage
                    uri={getCategoryImage(item)}
                    width={CARD_SIZE - 16}
                    height={CARD_SIZE - 16}
                    resizeMode="cover"
                    style={styles.categoryImage}
                    fallback={
                      <View style={styles.fallbackContainer}>
                        <Icon
                          name={getCategoryIcon(item.icon)}
                          size={28}
                          color={colors.primary}
                        />
                      </View>
                    }
                  />
                </View>
                <Text numberOfLines={2} style={styles.categoryName}>
                  {item.name ?? item.slug ?? 'Category'}
                </Text>
                {item.productCount !== undefined && (
                  <Text style={styles.categoryCount}>
                    {item.productCount} items
                  </Text>
                )}
              </Pressable>
            )}
          />
        </View>
      </View>
    </SafeAreaView>
  );
};

function getCategoryImage(item: Category) {
  const record = item as Category & {
    imageUrl?: string;
    thumbnail?: string;
    thumbnailUrl?: string;
    cloudinaryUrl?: string;
    coverImage?: string;
    bannerImage?: string;
    images?: string[];
    metadata?: Category['metadata'] & {
      image?: string;
      imageUrl?: string;
      thumbnail?: string;
      cloudinaryUrl?: string;
    };
  };

  return firstImage(
    record.image,
    record.imageUrl,
    record.thumbnail,
    record.thumbnailUrl,
    record.cloudinaryUrl,
    record.coverImage,
    record.bannerImage,
    record.images,
    record.metadata?.image,
    record.metadata?.imageUrl,
    record.metadata?.thumbnail,
    record.metadata?.cloudinaryUrl,
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  screen: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: -0.3,
  },
  headerIconButton: {
    padding: 4,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebarContainer: {
    width: SIDEBAR_WIDTH,
    backgroundColor: '#ffffff',
    borderRightWidth: 1,
    borderRightColor: '#f0f0f0',
  },
  sidebar: {
    flex: 1,
  },
  sidebarContent: {
    paddingVertical: 6,
  },
  sidebarItem: {
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 8,
    position: 'relative',
  },
  sidebarItemActive: {
    backgroundColor: '#f8f9fa',
  },
  sidebarItemPressed: {
    backgroundColor: '#f3f4f6',
  },
  sidebarIndicator: {
    position: 'absolute',
    left: 0,
    top: 6,
    bottom: 6,
    width: 3,
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  sidebarItemText: {
    fontSize: 11, // Reduced font size
    fontWeight: '500',
    color: '#6b7280',
    lineHeight: 14,
    letterSpacing: 0.2,
  },
  sidebarItemTextActive: {
    color: colors.ink,
    fontWeight: '700',
  },
  mainContent: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  mainContentContainer: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 100,
  },
  headerComponent: {
    marginBottom: 12,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a1a2e',
    borderRadius: 14,
    padding: 14,
    minHeight: 72,
    marginBottom: 16,
  },
  bannerContent: {
    flex: 1,
  },
  bannerBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  bannerBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  bannerTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  bannerSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontWeight: '400',
  },
  bannerIconContainer: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 28,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: -0.3,
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  viewAllText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.primary,
    marginRight: 2,
  },
  categoryCard: {
    alignItems: 'center',
    flex: 1,
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  categoryCardPressed: {
    opacity: 0.7,
  },
  categoryImageContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 999,
    width: CARD_SIZE - 8,
    height: CARD_SIZE - 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  categoryImage: {
    borderRadius: 999,
    height: '100%',
    width: '100%',
  },
  fallbackContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryName: {
    fontSize: 10, // Reduced font size
    fontWeight: '600',
    color: colors.ink,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 13,
    letterSpacing: 0.2,
  },
  categoryCount: {
    fontSize: 8, // Reduced font size
    fontWeight: '500',
    color: '#9ca3af',
    marginTop: 2,
  },
});

export default React.memo(CategoriesScreen);
