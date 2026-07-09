import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import ProductCard from '../components/ProductCard';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { fetchProducts } from '../api/products';
import { colors, radii, spacing } from '../theme';
import { getId } from '../utils/format';
import { logPerf, perfNow } from '../utils/performance';

type SearchParams = {
  category?: string;
  categoryName?: string;
  q?: string;
  seller?: string;
  sellerName?: string;
};

const sortOptions = [
  { label: 'Latest', value: 'latest' },
  { label: 'Top rated', value: 'rating' },
  { label: 'Low price', value: 'price_asc' },
  { label: 'High price', value: 'price_desc' },
];

function SearchScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const params = (route.params ?? {}) as SearchParams;
  const screenStart = useRef(perfNow()).current;
  const listVisibleLogged = useRef(false);
  const [query, setQuery] = useState(params.q ?? '');
  const [submittedQuery, setSubmittedQuery] = useState(params.q ?? '');
  const [category, setCategory] = useState(params.category ?? '');
  const [categoryName, setCategoryName] = useState(params.categoryName ?? '');
  const [seller, setSeller] = useState(params.seller ?? '');
  const [sellerName, setSellerName] = useState(params.sellerName ?? '');
  const [sort, setSort] = useState('latest');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const debouncedMinPrice = useDebouncedValue(minPrice, 350);
  const debouncedMaxPrice = useDebouncedValue(maxPrice, 350);

  useEffect(() => {
    setCategory(params.category ?? '');
    setCategoryName(params.categoryName ?? '');
    setSeller(params.seller ?? '');
    setSellerName(params.sellerName ?? '');
    if (params.q !== undefined) {
      setQuery(params.q);
      setSubmittedQuery(params.q);
    }
  }, [params.category, params.categoryName, params.q, params.seller, params.sellerName]);

  const products = useInfiniteQuery({
    queryKey: ['products', submittedQuery, category, seller, sort, verifiedOnly, debouncedMinPrice, debouncedMaxPrice],
    queryFn: ({ pageParam }) =>
      fetchProducts({
        q: submittedQuery,
        category,
        seller,
        sort,
        verifiedOnly,
        minPrice: debouncedMinPrice,
        maxPrice: debouncedMaxPrice,
        page: Number(pageParam),
        limit: 20,
      }),
    initialPageParam: 1,
    getNextPageParam: lastPage => {
      const pagination = lastPage.pagination;
      if (!pagination?.page || !pagination.totalPages || pagination.page >= pagination.totalPages) {
        return undefined;
      }

      return pagination.page + 1;
    },
  });

  const productRows = useMemo(
    () => products.data?.pages.flatMap(page => page.products) ?? [],
    [products.data],
  );

  useEffect(() => {
    if (!listVisibleLogged.current && productRows.length) {
      listVisibleLogged.current = true;
      logPerf('screen:product-list-visible', {
        products: productRows.length,
        ms: Math.round(perfNow() - screenStart),
      });
    }
  }, [productRows.length, screenStart]);

  const submitSearch = () => {
    setSubmittedQuery(query.trim());
  };

  const clearCategory = () => {
    setCategory('');
    setCategoryName('');
  };

  const clearSeller = () => {
    setSeller('');
    setSellerName('');
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backButton}>
          <Icon name="arrow-left" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Products</Text>
        <View style={styles.backButton} />
      </View>
      <View style={styles.searchShell}>
        <Icon name="magnify" size={22} color={colors.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={submitSearch}
          returnKeyType="search"
          placeholder="Search products, suppliers, RFQs"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />
        <Pressable onPress={submitSearch} style={styles.button}>
          <Text style={styles.buttonText}>Go</Text>
        </Pressable>
      </View>

      <View style={styles.filters}>
        {category ? (
          <Pressable onPress={clearCategory} style={styles.activeChip}>
            <Text numberOfLines={1} style={styles.activeChipText}>{categoryName || category}</Text>
            <Icon name="close" size={16} color="#fff" />
          </Pressable>
        ) : null}
        {seller ? (
          <Pressable onPress={clearSeller} style={styles.activeChip}>
            <Text numberOfLines={1} style={styles.activeChipText}>{sellerName || seller}</Text>
            <Icon name="close" size={16} color="#fff" />
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => setVerifiedOnly(current => !current)}
          style={[styles.chip, verifiedOnly && styles.activeFilter]}>
          <Icon name="check-decagram-outline" size={16} color={verifiedOnly ? '#fff' : colors.muted} />
          <Text style={[styles.chipText, verifiedOnly && styles.activeChipText]}>Verified</Text>
        </Pressable>
        <TextInput
          value={minPrice}
          onChangeText={setMinPrice}
          keyboardType="numeric"
          placeholder="Min"
          placeholderTextColor={colors.muted}
          style={styles.priceInput}
        />
        <TextInput
          value={maxPrice}
          onChangeText={setMaxPrice}
          keyboardType="numeric"
          placeholder="Max"
          placeholderTextColor={colors.muted}
          style={styles.priceInput}
        />
      </View>

      <View style={styles.sortRow}>
        {sortOptions.map(option => (
          <Pressable
            key={option.value}
            onPress={() => setSort(option.value)}
            style={[styles.sortChip, sort === option.value && styles.activeFilter]}>
            <Text style={[styles.sortText, sort === option.value && styles.activeChipText]}>{option.label}</Text>
          </Pressable>
        ))}
      </View>

      {products.isLoading ? (
        <LoadingState label="Loading products" />
      ) : products.isError ? (
        <ErrorState message={(products.error as Error).message} onRetry={() => products.refetch()} />
      ) : (
        <FlashList
          data={productRows}
          keyExtractor={item => getId(item)}
          numColumns={2}
          contentContainerStyle={styles.results}
          refreshing={products.isRefetching && !products.isFetchingNextPage}
          onRefresh={() => products.refetch()}
          onEndReachedThreshold={0.35}
          onEndReached={() => {
            if (products.hasNextPage && !products.isFetchingNextPage) {
              products.fetchNextPage();
            }
          }}
          ListEmptyComponent={
            <EmptyState title="No matching products" detail="Try a different product, supplier, or category term." />
          }
          ListFooterComponent={
            products.isFetchingNextPage ? (
              <View style={styles.footer}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : null
          }
          renderItem={({ item }) => <ProductCard product={item} variant="grid" />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
    paddingTop: spacing.lg,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
  },
  backButton: {
    alignItems: 'center',
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  headerTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
  },
  searchShell: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.pill,
    flexDirection: 'row',
    margin: spacing.lg,
    marginBottom: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
  },
  input: {
    color: colors.ink,
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    minHeight: 50,
    paddingHorizontal: spacing.sm,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '900',
  },
  filters: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  chip: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 38,
    paddingHorizontal: spacing.md,
  },
  activeChip: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    maxWidth: 150,
    minHeight: 38,
    paddingHorizontal: spacing.md,
  },
  activeFilter: {
    backgroundColor: colors.primary,
  },
  chipText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  activeChipText: {
    color: '#fff',
    fontWeight: '900',
  },
  priceInput: {
    backgroundColor: colors.card,
    borderRadius: radii.pill,
    color: colors.ink,
    fontSize: 12,
    fontWeight: '800',
    minHeight: 38,
    paddingHorizontal: spacing.md,
    width: 72,
  },
  sortRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  sortChip: {
    backgroundColor: colors.card,
    borderRadius: radii.pill,
    minHeight: 34,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  sortText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  results: {
    paddingBottom: 116,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  column: {
    alignItems: 'stretch',
  },
  footer: {
    padding: spacing.xl,
  },
});

export default SearchScreen;

function useDebouncedValue(value: string, delayMs: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);

    return () => clearTimeout(timer);
  }, [delayMs, value]);

  return debounced;
}
