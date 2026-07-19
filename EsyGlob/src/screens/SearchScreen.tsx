import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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
  subcategory?: string;
  subcategoryName?: string;
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
  const [subcategory, setSubcategory] = useState(params.subcategory ?? '');
  const [subcategoryName, setSubcategoryName] = useState(params.subcategoryName ?? '');
  const [seller, setSeller] = useState(params.seller ?? '');
  const [sellerName, setSellerName] = useState(params.sellerName ?? '');
  const [sort, setSort] = useState('latest');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const debouncedMinPrice = useDebouncedValue(minPrice, 350);
  const debouncedMaxPrice = useDebouncedValue(maxPrice, 350);

  useEffect(() => {
    setCategory(params.category ?? '');
    setCategoryName(params.categoryName ?? '');
    setSubcategory(params.subcategory ?? '');
    setSubcategoryName(params.subcategoryName ?? '');
    setSeller(params.seller ?? '');
    setSellerName(params.sellerName ?? '');
    if (params.q !== undefined) {
      setQuery(params.q);
      setSubmittedQuery(params.q);
    }
  }, [params.category, params.categoryName, params.q, params.seller, params.sellerName, params.subcategory, params.subcategoryName]);

  const products = useInfiniteQuery({
    queryKey: ['products', submittedQuery, category, subcategory, seller, sort, verifiedOnly, debouncedMinPrice, debouncedMaxPrice],
    queryFn: ({ pageParam }) =>
      fetchProducts({
        q: submittedQuery,
        category,
        subcategory,
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
    setSubcategory('');
    setSubcategoryName('');
  };

  const clearSubcategory = () => {
    setSubcategory('');
    setSubcategoryName('');
  };

  const clearSeller = () => {
    setSeller('');
    setSellerName('');
  };
  const clearAll = () => {
    clearCategory(); clearSeller(); setVerifiedOnly(false); setMinPrice(''); setMaxPrice(''); setSort('latest');
  };
  const resultCount = Number(products.data?.pages[0]?.pagination?.total ?? productRows.length);
  const appliedCount = [category, subcategory, seller, verifiedOnly, minPrice, maxPrice].filter(Boolean).length;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backButton}>
          <Icon name="arrow-left" size={24} color={colors.ink} />
        </Pressable>
        <View style={styles.headerCopy}><Text numberOfLines={1} style={styles.headerTitle}>{submittedQuery || categoryName || 'Products'}</Text><Text numberOfLines={1} style={styles.headerContext}>{[categoryName, subcategoryName].filter(Boolean).join(' · ') || 'EsyGlob marketplace'}</Text></View>
        <Pressable onPress={() => setViewMode(current => current === 'grid' ? 'list' : 'grid')} style={styles.backButton}><Icon name={viewMode === 'grid' ? 'view-list-outline' : 'view-grid-outline'} size={22} color={colors.ink} /></Pressable>
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

      <View style={styles.summaryRow}><View><Text style={styles.resultCount}>Showing {resultCount} products</Text><Text style={styles.resultMeta}>{verifiedOnly ? 'Verified suppliers' : 'All suppliers'} · Updated marketplace results</Text></View><Pressable onPress={() => setFiltersOpen(true)} style={styles.filterButton}><Icon name="tune-variant" size={18} color="#fff" /><Text style={styles.filterButtonText}>Filters{appliedCount ? ` (${appliedCount})` : ''}</Text></Pressable></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {category ? (
          <Pressable onPress={clearCategory} style={styles.activeChip}>
            <Text numberOfLines={1} style={styles.activeChipText}>{categoryName || category}</Text>
            <Icon name="close" size={16} color="#fff" />
          </Pressable>
        ) : null}
        {subcategory ? (
          <Pressable onPress={clearSubcategory} style={styles.activeChip}>
            <Text numberOfLines={1} style={styles.activeChipText}>{subcategoryName || subcategory}</Text>
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
        {appliedCount ? <Pressable onPress={clearAll} style={styles.clearChip}><Text style={styles.clearChipText}>Clear all</Text></Pressable> : null}
      </ScrollView>

      {products.isLoading ? (
        <LoadingState label="Loading products" />
      ) : products.isError ? (
        <ErrorState message={(products.error as Error).message} onRetry={() => products.refetch()} />
      ) : (
        <FlashList
          key={viewMode}
          data={productRows}
          keyExtractor={item => getId(item)}
          numColumns={viewMode === 'grid' ? 2 : 1}
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
          renderItem={({ item }) => <ProductCard product={item} variant={viewMode === 'grid' ? 'grid' : 'full'} />}
        />
      )}
      <Modal transparent visible={filtersOpen} animationType="slide" onRequestClose={() => setFiltersOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setFiltersOpen(false)} />
        <View style={styles.filterSheet}><View style={styles.sheetHandle} /><View style={styles.sheetHeader}><View><Text style={styles.sheetTitle}>Filter products</Text><Text style={styles.sheetSubtitle}>Use available marketplace filters</Text></View><Pressable onPress={clearAll}><Text style={styles.resetText}>Reset</Text></Pressable></View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.filterLabel}>Supplier verification</Text><Pressable onPress={() => setVerifiedOnly(current => !current)} style={[styles.sheetOption, verifiedOnly && styles.sheetOptionActive]}><Icon name="check-decagram" size={20} color={verifiedOnly ? colors.primary : colors.muted} /><Text style={styles.sheetOptionText}>Verified suppliers only</Text><Icon name={verifiedOnly ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'} size={20} color={verifiedOnly ? colors.primary : colors.muted} /></Pressable>
            <Text style={styles.filterLabel}>Price range</Text><View style={styles.priceRow}><TextInput value={minPrice} onChangeText={setMinPrice} keyboardType="numeric" placeholder="Minimum price" placeholderTextColor={colors.muted} style={styles.sheetInput} /><TextInput value={maxPrice} onChangeText={setMaxPrice} keyboardType="numeric" placeholder="Maximum price" placeholderTextColor={colors.muted} style={styles.sheetInput} /></View>
            <Text style={styles.filterLabel}>Sort by</Text><View style={styles.sheetSortGrid}>{sortOptions.map(option => <Pressable key={option.value} onPress={() => setSort(option.value)} style={[styles.sheetSort, sort === option.value && styles.sheetSortActive]}><Text style={[styles.sortText, sort === option.value && styles.activeChipText]}>{option.label}</Text></Pressable>)}</View>
          </ScrollView>
          <Pressable onPress={() => setFiltersOpen(false)} style={styles.applyButton}><Text style={styles.applyText}>Show {resultCount} products</Text></Pressable>
        </View>
      </Modal>
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
    fontSize: 18,
    fontWeight: '900',
  },
  headerCopy: { flex: 1, paddingHorizontal: spacing.sm },
  headerContext: { color: colors.muted, fontSize: 11, fontWeight: '700', marginTop: 2 },
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
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  summaryRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  resultCount: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  resultMeta: { color: colors.muted, fontSize: 10, fontWeight: '700', marginTop: 3 },
  filterButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.pill, flexDirection: 'row', gap: 6, paddingHorizontal: spacing.md, paddingVertical: 10 },
  filterButtonText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  clearChip: { backgroundColor: '#FFF1F2', borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  clearChipText: { color: colors.rose, fontSize: 11, fontWeight: '900' },
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
  backdrop: { backgroundColor: 'rgba(15,23,42,0.42)', flex: 1 },
  filterSheet: { backgroundColor: '#fff', borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: '78%', padding: spacing.lg, paddingBottom: spacing.xl },
  sheetHandle: { alignSelf: 'center', backgroundColor: '#CBD5E1', borderRadius: 3, height: 5, marginBottom: spacing.md, width: 44 },
  sheetHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.lg },
  sheetTitle: { color: colors.ink, fontSize: 21, fontWeight: '900' },
  sheetSubtitle: { color: colors.muted, fontSize: 11, fontWeight: '700', marginTop: 3 },
  resetText: { color: colors.primary, fontSize: 12, fontWeight: '900' },
  filterLabel: { color: colors.ink, fontSize: 12, fontWeight: '900', marginBottom: spacing.sm, marginTop: spacing.md, textTransform: 'uppercase' },
  sheetOption: { alignItems: 'center', backgroundColor: '#F8FAFC', borderColor: colors.faint, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  sheetOptionActive: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  sheetOptionText: { color: colors.ink, flex: 1, fontSize: 13, fontWeight: '800' },
  priceRow: { flexDirection: 'row', gap: spacing.sm },
  sheetInput: { backgroundColor: '#F8FAFC', borderColor: colors.faint, borderRadius: radii.md, borderWidth: 1, color: colors.ink, flex: 1, minHeight: 48, paddingHorizontal: spacing.md },
  sheetSortGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  sheetSort: { backgroundColor: '#F8FAFC', borderColor: colors.faint, borderRadius: radii.pill, borderWidth: 1, flexBasis: '47%', flexGrow: 1, padding: spacing.md },
  sheetSortActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  applyButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.pill, marginTop: spacing.lg, padding: spacing.md },
  applyText: { color: '#fff', fontSize: 14, fontWeight: '900' },
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
