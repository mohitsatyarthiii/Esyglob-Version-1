import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { fetchCategories } from '../api/categories';
import { Category } from '../api/types';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import RemoteImage from '../components/RemoteImage';
import { colors } from '../theme';
import { getCategoryIcon, getId, getStableKey } from '../utils/format';

function CategoriesScreen() {
  const navigation = useNavigation<any>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
    staleTime: 5 * 60_000,
  });

  const selectedCategory = useMemo(() => {
    const items = categories.data ?? [];
    return items.find(item => getStableKey(item) === selectedId) ?? items[0];
  }, [categories.data, selectedId]);

  const recommendationItems = selectedCategory?.subcategories?.length
    ? selectedCategory.subcategories
    : categories.data ?? [];
  const selectedCategoryId = selectedCategory ? getStableKey(selectedCategory) : '';

  const openProducts = (category: Category) => {
    navigation.navigate('ProductListing', {
      category: category.name ?? getId(category),
      categoryName: category.name,
    });
  };

  if (categories.isLoading) {
    return <LoadingState label="Loading categories" />;
  }

  if (categories.isError) {
    return <ErrorState message={(categories.error as Error).message} onRetry={() => categories.refetch()} />;
  }

  if (!categories.data?.length) {
    return <EmptyState title="No active categories" detail="The backend returned an empty category list." />;
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Categories</Text>
        <Icon name="help-box-outline" size={24} color={colors.ink} />
      </View>
      <View style={styles.body}>
        <ScrollView style={styles.rail} showsVerticalScrollIndicator={false}>
          {categories.data.map(item => {
            const isActive = getStableKey(item) === selectedCategoryId;

            return (
              <Pressable
                key={getStableKey(item)}
                onPress={() => setSelectedId(getStableKey(item))}
                style={[styles.railItem, isActive && styles.railItemActive]}>
                {isActive ? <View style={styles.railBar} /> : null}
                <Text 
                  numberOfLines={2} 
                  style={[styles.railText, isActive && styles.railTextActive]}>
                  {item.name ?? item.slug ?? 'Category'}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <FlatList
          style={styles.main}
          contentContainerStyle={styles.mainContent}
          data={recommendationItems}
          keyExtractor={item => getStableKey(item)}
          numColumns={3}
          ListHeaderComponent={
            <View>
              <Pressable onPress={() => selectedCategory && openProducts(selectedCategory)} style={styles.banner}>
                <View style={styles.bannerContent}>
                  <Text style={styles.bannerTitle}>local stock</Text>
                  <Text style={styles.bannerText}>Fastest delivery in 5 days</Text>
                  <Text style={styles.bannerText}>No import charges</Text>
                </View>
                <Icon name="truck-fast-outline" size={40} color="#fff" />
              </Pressable>
              <View style={styles.recommendationHeader}>
                <Text style={styles.recommendationTitle}>Featured</Text>
                <View style={styles.recommendationBadge}>
                  <Text style={styles.recommendationBadgeText}>Deals</Text>
                  <Text style={styles.recommendationBadgeText}>Recommendations</Text>
                </View>
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable onPress={() => openProducts(item)} style={styles.categoryCard}>
              <CategoryArtwork category={item} />
              <Text numberOfLines={2} style={styles.categoryName}>{item.name ?? item.slug ?? 'Category'}</Text>
              {item.productCount !== undefined ? (
                <Text style={styles.categoryCount}>{item.productCount}</Text>
              ) : null}
            </Pressable>
          )}
        />
      </View>
    </View>
  );
}

function CategoryArtwork({ category }: { category: Category }) {
  const image = category.image;

  return (
    <View style={styles.artwork}>
      <RemoteImage
        uri={image}
        width={120}
        height={120}
        resizeMode="contain"
        style={styles.artworkImage}
        fallback={<Icon name={getCategoryIcon(category.icon)} size={32} color={colors.primary} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.card,
    flex: 1,
  },
  header: {
    alignItems: 'center',
    borderBottomColor: '#e5e7eb',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 48,
  },
  title: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '800',
  },
  body: {
    flex: 1,
    flexDirection: 'row',
  },
  rail: {
    backgroundColor: '#f3f4f6',
    width: 110,
  },
  railItem: {
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  railItemActive: {
    backgroundColor: colors.card,
  },
  railBar: {
    backgroundColor: '#1a1a1a',
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
    width: 3,
  },
  railText: {
    color: '#6b7280',
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 14,
  },
  railTextActive: {
    color: '#1a1a1a',
    fontWeight: '700',
  },
  main: {
    flex: 1,
  },
  mainContent: {
    padding: 10,
    paddingBottom: 100,
  },
  banner: {
    alignItems: 'center',
    backgroundColor: '#4a7c0e',
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bannerContent: {
    flex: 1,
  },
  bannerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 2,
  },
  bannerText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '500',
    opacity: 0.9,
    marginTop: 1,
  },
  recommendationHeader: {
    marginBottom: 10,
    marginTop: 14,
  },
  recommendationTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '800',
  },
  recommendationBadge: {
    flexDirection: 'row',
    marginTop: 4,
    gap: 8,
  },
  recommendationBadgeText: {
    color: '#6b7280',
    fontSize: 10,
    fontWeight: '500',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  categoryCard: {
    alignItems: 'center',
    flex: 1,
    marginBottom: 12,
    minHeight: 100,
    paddingHorizontal: 4,
  },
  artwork: {
    alignItems: 'center',
    backgroundColor: '#f4f4f4',
    borderRadius: 40,
    height: 72,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 72,
  },
  artworkImage: {
    height: 64,
    width: 64,
  },
  categoryName: {
    color: colors.ink,
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 13,
    marginTop: 4,
    textAlign: 'center',
  },
  categoryCount: {
    color: '#9ca3af',
    fontSize: 9,
    fontWeight: '600',
    marginTop: 2,
  },
});

export default React.memo(CategoriesScreen);
