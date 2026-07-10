import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useQuery } from '@tanstack/react-query';
import { searchMarketplace } from '../api/search';
import { Product, SellerSummary } from '../api/types';
import RemoteImage from './RemoteImage';
import { getId, getStableKey } from '../utils/format';
import { firstImage } from '../utils/images';

const P = {
  bg: '#FFFFFF',
  primary: '#2563EB',
  primaryLight: '#EFF6FF',
  text: '#0F172A',
  muted: '#64748B',
  faint: '#E2E8F0',
  card: '#F8FAFC',
};

type Props = {
  visible: boolean;
  onClose: () => void;
  navigation: any;
};

export default function LiveSearchDropdown({ visible, onClose, navigation }: Props) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 300);
    return () => clearTimeout(timerRef.current);
  }, [query]);

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 1 : 0,
      tension: 280,
      friction: 26,
      useNativeDriver: true,
    }).start();

    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [visible, slideAnim]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['live-search', debouncedQuery],
    queryFn: () => searchMarketplace(debouncedQuery),
    enabled: debouncedQuery.length > 1,
    staleTime: 30_000,
  });

  const products: Product[] = (data as any)?.products?.slice(0, 5) ?? [];
  const suppliers: SellerSummary[] = (data as any)?.suppliers?.slice(0, 3) ?? [];

  const handleSelectProduct = useCallback(
    (product: Product) => {
      onClose();
      setQuery('');
      navigation.navigate('ProductDetails', { productId: getId(product) });
    },
    [navigation, onClose],
  );

  const handleSelectSupplier = useCallback(
    (supplier: SellerSummary) => {
      onClose();
      setQuery('');
      navigation.navigate('SellerDetails', {
        sellerId: getStableKey(supplier),
        sellerName: supplier.companyName ?? supplier.businessName,
      });
    },
    [navigation, onClose],
  );

  const handleViewAll = useCallback(() => {
    onClose();
    setQuery('');
    navigation.navigate('ProductListing', { search: debouncedQuery });
  }, [navigation, onClose, debouncedQuery]);

  if (!visible) return null;

  const hasResults = products.length > 0 || suppliers.length > 0;
  const showLoader = isLoading || isFetching;

  return (
    <Animated.View
      style={[
        styles.overlay,
        {
          opacity: slideAnim,
          transform: [
            {
              translateY: slideAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [-20, 0],
              }),
            },
          ],
        },
      ]}>
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View style={styles.searchShell}>
        <Icon name="magnify" size={18} color={P.muted} />
        <TextInput
          ref={inputRef}
          value={query}
          onChangeText={setQuery}
          placeholder="Search products, suppliers..."
          placeholderTextColor={P.muted}
          style={styles.searchInput}
          autoFocus
          returnKeyType="search"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Icon name="close-circle" size={18} color={P.muted} />
          </Pressable>
        )}
      </View>

      {debouncedQuery.length > 1 && (
        <View style={styles.resultsContainer}>
          {showLoader && (
            <View style={styles.loaderRow}>
              <ActivityIndicator size="small" color={P.primary} />
              <Text style={styles.searchingText}>Searching...</Text>
            </View>
          )}

          {!showLoader && !hasResults && (
            <View style={styles.emptyRow}>
              <Icon name="magnify-remove-outline" size={24} color={P.muted} />
              <Text style={styles.emptyText}>No results for "{debouncedQuery}"</Text>
            </View>
          )}

          {products.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Products</Text>
              {products.map((product: Product) => (
                <Pressable
                  key={getId(product)}
                  style={styles.resultItem}
                  onPress={() => handleSelectProduct(product)}>
                  <RemoteImage
                    uri={product.images?.[0] ?? product.image}
                    width={80}
                    height={80}
                    style={styles.resultImage}
                    fallback={<Icon name="package-variant" size={20} color={P.muted} />}
                  />
                  <View style={styles.resultInfo}>
                    <Text style={styles.resultTitle} numberOfLines={2}>
                      {product.name ?? product.title}
                    </Text>
                    <Text style={styles.resultMeta}>
                      {typeof product.category === 'string' ? product.category : ''}
                    </Text>
                  </View>
                  <Icon name="chevron-right" size={18} color={P.muted} />
                </Pressable>
              ))}
            </View>
          )}

          {suppliers.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Suppliers</Text>
              {suppliers.map((supplier: SellerSummary) => (
                <Pressable
                  key={getStableKey(supplier)}
                  style={styles.resultItem}
                  onPress={() => handleSelectSupplier(supplier)}>
                  <RemoteImage
                    uri={firstImage(supplier.logo, supplier.companyLogo, supplier.logoUrl)}
                    width={80}
                    height={80}
                    style={styles.resultImage}
                    fallback={
                      <View style={styles.supplierFallback}>
                        <Text style={styles.supplierInitial}>
                          {(supplier.companyName ?? 'S')[0]}
                        </Text>
                      </View>
                    }
                  />
                  <View style={styles.resultInfo}>
                    <Text style={styles.resultTitle} numberOfLines={1}>
                      {supplier.companyName ?? supplier.businessName}
                    </Text>
                    <Text style={styles.resultMeta}>
                      {supplier.address?.country ?? supplier.country ?? ''}
                    </Text>
                  </View>
                  <Icon name="chevron-right" size={18} color={P.muted} />
                </Pressable>
              ))}
            </View>
          )}

          {hasResults && (
            <Pressable style={styles.viewAllBtn} onPress={handleViewAll}>
              <Text style={styles.viewAllText}>View all results</Text>
              <Icon name="arrow-right" size={16} color={P.primary} />
            </Pressable>
          )}
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  searchShell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: P.bg,
    margin: 16,
    marginTop: 60,
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 50,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '500', color: P.text, padding: 0 },
  resultsContainer: {
    backgroundColor: P.bg,
    marginHorizontal: 16,
    borderRadius: 14,
    maxHeight: '70%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 6,
  },
  loaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 20 },
  searchingText: { fontSize: 13, color: P.muted },
  emptyRow: { alignItems: 'center', padding: 24, gap: 8 },
  emptyText: { fontSize: 13, color: P.muted },
  section: { paddingTop: 8 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: P.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: P.faint,
  },
  resultImage: { width: 44, height: 44, borderRadius: 8, backgroundColor: P.card },
  supplierFallback: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: P.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supplierInitial: { fontSize: 18, fontWeight: '800', color: P.primary },
  resultInfo: { flex: 1 },
  resultTitle: { fontSize: 13, fontWeight: '600', color: P.text, lineHeight: 17 },
  resultMeta: { fontSize: 11, fontWeight: '500', color: P.muted, marginTop: 2 },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: P.faint,
    backgroundColor: P.card,
  },
  viewAllText: { fontSize: 12, fontWeight: '700', color: P.primary },
});
