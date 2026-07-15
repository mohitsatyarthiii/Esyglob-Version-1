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
import RemoteImage from './RemoteImage';
import { getId, getStableKey } from '../utils/format';
import { firstImage } from '../utils/images';

// ─── Palette ────────────────────────────────────────────────────────────────

const P = {
  bg: '#FFFFFF',
  primary: '#2563EB',
  primaryLight: '#EFF6FF',
  text: '#0F172A',
  textSecondary: '#575a5f',
  muted: '#94A3B8',
  faint: '#E2E8F0',
  card: '#F8FAFC',
  backdrop: 'rgba(15, 23, 42, 0.5)',
  emerald: '#10B981',
};
const SEARCH_DESTINATIONS: Array<{ title: string; subtitle: string; type: string; icon: string; route: string; params?: Record<string, string> }> = [
  { title: 'Trade Assurance', subtitle: 'Secure trade and protection center', type: 'Service', icon: 'shield-check-outline', route: 'TradeAssurance' },
  { title: 'Shipping & Logistics', subtitle: 'Freight and shipment services', type: 'Service category', icon: 'truck-fast-outline', route: 'Services' },
  { title: 'Esy Calculator', subtitle: 'Trade cost and margin calculators', type: 'Trade tool', icon: 'calculator-variant-outline', route: 'EsyCalculator' },
  { title: 'Currency Converter', subtitle: 'Convert global trade currencies', type: 'Trade tool', icon: 'currency-usd', route: 'EsyCalculator', params: { tab: 'currency' } },
  { title: 'HS Code Finder', subtitle: 'Find product classification codes', type: 'Trade tool', icon: 'barcode-scan', route: 'HSCodeFinder' },
  { title: 'Image Search', subtitle: 'Find visually similar products', type: 'AI tool', icon: 'image-search-outline', route: 'ImageSearch' },
  { title: 'Market Insights', subtitle: 'Marketplace trends and intelligence', type: 'Market insight', icon: 'chart-timeline-variant', route: 'MarketInsights' },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function getProductName(product: any): string {
  return product?.name ?? product?.title ?? product?.productName ?? product?.productTitle ?? product?.label ?? 'Marketplace product';
}

function getProductImage(product: any): string | undefined {
  return firstImage(product?.primaryImage, product?.images, product?.image, product?.thumbnail, product?.product?.images, product?.product?.image) ?? undefined;
}

function getSupplierName(supplier: any): string {
  return supplier?.companyName || supplier?.businessName || supplier?.displayName || supplier?.sellerName || supplier?.fullName || supplier?.userId?.companyName || supplier?.userId?.name || supplier?.label || 'Marketplace seller';
}

function getSupplierLogo(supplier: any): string | undefined {
  return firstImage(supplier?.companyLogo, supplier?.logoUrl, supplier?.logo, supplier?.avatar, supplier?.avatarUrl, supplier?.profileImage, supplier?.userId?.profileImage, supplier?.userId?.avatarUrl) ?? undefined;
}

function getSupplierCountry(supplier: any): string {
  return supplier?.country || supplier?.address?.country || '';
}

function isSupplierVerified(supplier: any): boolean {
  return supplier?.isVerified === true || supplier?.verificationStatus === 'verified' || supplier?.verificationStatus === 'approved';
}

function getProductSeller(product: any) {
  const seller = typeof product?.sellerId === 'object' ? product.sellerId : typeof product?.seller === 'object' ? product.seller : undefined;
  return seller;
}

type Props = {
  visible: boolean;
  onClose: () => void;
  navigation: any;
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function LiveSearchDropdown({ visible, onClose, navigation }: Props) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput>(null);

  // Debounce search
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  // Slide animation
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

  // Search API
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['live-search', debouncedQuery],
    queryFn: () => searchMarketplace(debouncedQuery),
    enabled: debouncedQuery.length > 1,
    staleTime: 30_000,
  });

  const searchData = data as any;
  const products: any[] = searchData?.products?.slice(0, 5) ?? [];
  const suppliers: any[] = searchData?.suppliers?.slice(0, 3) ?? [];
  const categories: any[] = searchData?.categories?.slice(0, 4) ?? [];
  const destinations = SEARCH_DESTINATIONS.filter(item =>
    [item.title, item.subtitle, item.type].some(value =>
      value.toLowerCase().includes(debouncedQuery.toLowerCase()),
    ),
  ).slice(0, 4);

  const handleSelectProduct = useCallback(
    (product: any) => {
      const productId = product._id || product.id || getId(product);
      if (!productId) return;
      onClose();
      setQuery('');
      navigation.navigate('ProductDetails', {
        productId,
      });
    },
    [navigation, onClose],
  );

  const handleSelectSupplier = useCallback(
    (supplier: any) => {
      const sellerId = supplier._id || supplier.id || getStableKey(supplier);
      if (!sellerId) return;
      onClose();
      setQuery('');
      navigation.navigate('SellerDetails', {
        sellerId,
        sellerName: getSupplierName(supplier),
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

  const hasResults = products.length > 0 || suppliers.length > 0 || categories.length > 0 || destinations.length > 0;
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
      {/* Backdrop */}
      <Pressable style={styles.backdrop} onPress={onClose} />

      {/* Search Input */}
      <View style={styles.searchShell}>
        <Icon name="magnify" size={20} color={P.muted} />
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
          <Pressable onPress={() => setQuery('')} hitSlop={10} style={styles.clearBtn}>
            <Icon name="close-circle" size={20} color={P.muted} />
          </Pressable>
        )}
      </View>

      {/* Results */}
      {debouncedQuery.length > 1 && (
        <View style={styles.resultsContainer}>
          {/* Loading */}
          {showLoader && (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={P.primary} />
              <Text style={styles.statusText}>Searching...</Text>
            </View>
          )}

          {/* Empty */}
          {!showLoader && !hasResults && (
            <View style={styles.statusRow}>
              <Icon name="magnify-remove-outline" size={22} color={P.muted} />
              <Text style={styles.statusText}>No results for "{debouncedQuery}"</Text>
            </View>
          )}

          {/* ── Products ── */}
          {destinations.length > 0 && (
            <View>
              <Text style={styles.sectionTitle}>Services, tools & insights</Text>
              {destinations.map(item => (
                <Pressable key={item.title} onPress={() => { onClose(); setQuery(''); navigation.navigate(item.route, item.params); }} style={styles.resultItem}>
                  <View style={styles.destinationIcon}><Icon name={item.icon} size={21} color={P.primary} /></View>
                  <View style={styles.resultInfo}><Text style={styles.resultTitle}>{item.title}</Text><Text numberOfLines={1} style={styles.resultMeta}>{item.subtitle} · {item.type}</Text></View>
                  <Icon name="chevron-right" size={18} color={P.muted} />
                </Pressable>
              ))}
            </View>
          )}
          {categories.length > 0 && (
            <View>
              <Text style={styles.sectionTitle}>Categories & sub-categories</Text>
              {categories.map(category => (
                <Pressable key={getStableKey(category)} onPress={() => { onClose(); setQuery(''); const isSubcategory = (category as any).resultType === 'subcategory'; navigation.navigate('ProductListing', isSubcategory ? { subcategory: category._id ?? category.slug, subcategoryName: category.name, category: (category as any).categoryId?._id, categoryName: (category as any).categoryId?.name } : { category: category._id ?? category.slug, categoryName: category.name }); }} style={styles.resultItem}>
                  <View style={styles.destinationIcon}><Icon name="shape-outline" size={21} color={P.primary} /></View>
                  <View style={styles.resultInfo}><Text style={styles.resultTitle}>{category.name ?? category.title}</Text><Text style={styles.resultMeta}>{category.parent?.name ?? 'Product category'} · Category</Text></View>
                  <Icon name="chevron-right" size={18} color={P.muted} />
                </Pressable>
              ))}
            </View>
          )}
          {products.length > 0 && (
            <View>
              <Text style={styles.sectionTitle}>Products</Text>
              {products.map((product: any) => {
                const name = getProductName(product);
                const image = getProductImage(product);
                const category = product?.category || '';
                const seller = getProductSeller(product);
                const sellerName = seller ? getSupplierName(seller) : product?.sellerName;
                const country = product?.countryOfOrigin || product?.originCountry || product?.country || getSupplierCountry(seller);
                const verified = Boolean(product?.verified || product?.isVerifiedSeller || (seller && isSupplierVerified(seller)));

                return (
                  <Pressable
                    key={product._id || Math.random().toString()}
                    style={({ pressed }) => [
                      styles.resultItem,
                      pressed && styles.resultItemPressed,
                    ]}
                    onPress={() => handleSelectProduct(product)}>
                    <RemoteImage
                      uri={image}
                      width={48}
                      height={48}
                      style={styles.resultImage}
                      fallback={
                        <Icon name="package-variant" size={22} color={P.muted} />
                      }
                    />
                    <View style={styles.resultInfo}>
                      <View style={styles.resultTitleRow}>
                        <Text style={styles.resultTitle} numberOfLines={1}>
                          {name}
                        </Text>
                        {verified && (
                          <Icon name="check-decagram" size={14} color={P.emerald} />
                        )}
                      </View>
                      <Text style={styles.resultMeta} numberOfLines={1}>
                        {[typeof category === 'string' ? category : (category as any)?.name, sellerName, country].filter(Boolean).join(' · ') || 'Marketplace product'}
                      </Text>
                    </View>
                    <Icon name="chevron-right" size={18} color={P.muted} />
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* ── Suppliers ── */}
          {suppliers.length > 0 && (
            <View>
              <Text style={styles.sectionTitle}>Suppliers</Text>
              {suppliers.map((supplier: any) => {
                const name = getSupplierName(supplier);
                const logo = getSupplierLogo(supplier);
                const country = getSupplierCountry(supplier);
                const verified = isSupplierVerified(supplier);
                const businessName = supplier.businessName && supplier.businessName !== name ? supplier.businessName : '';
                const businessType = supplier.companyType || supplier.businessType || supplier.supplierType || 'Supplier';

                return (
                  <Pressable
                    key={supplier._id || Math.random().toString()}
                    style={({ pressed }) => [
                      styles.resultItem,
                      pressed && styles.resultItemPressed,
                    ]}
                    onPress={() => handleSelectSupplier(supplier)}>
                    <RemoteImage
                      uri={logo}
                      width={48}
                      height={48}
                      style={styles.resultImage}
                      fallback={
                        <View style={styles.supplierFallback}>
                          <Text style={styles.supplierInitial}>
                            {(name[0] || 'S').toUpperCase()}
                          </Text>
                        </View>
                      }
                    />
                    <View style={styles.resultInfo}>
                      <View style={styles.resultTitleRow}>
                        <Text style={styles.resultTitle} numberOfLines={1}>
                          {name}
                        </Text>
                        {verified && (
                          <Icon name="check-decagram" size={14} color={P.emerald} />
                        )}
                      </View>
                      <Text style={styles.resultMeta} numberOfLines={1}>
                        {[businessName, businessType, country || 'Worldwide'].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <Icon name="chevron-right" size={18} color={P.muted} />
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* ── View All ── */}
          {hasResults && (
            <Pressable
              style={({ pressed }) => [
                styles.viewAllBtn,
                pressed && styles.viewAllPressed,
              ]}
              onPress={handleViewAll}>
              <Text style={styles.viewAllText}>
                View all results for "{debouncedQuery}"
              </Text>
              <Icon name="arrow-right" size={16} color={P.primary} />
            </Pressable>
          )}
        </View>
      )}
    </Animated.View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

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
    backgroundColor: P.backdrop,
  },

  // Search Input
  searchShell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: P.bg,
    marginHorizontal: 16,
    marginTop: 60,
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 52,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: P.text,
    padding: 0,
  },
  clearBtn: {
    padding: 4,
  },

  // Results Container
  resultsContainer: {
    backgroundColor: P.bg,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 16,
    maxHeight: '65%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
  },

  // Status Row
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 20,
  },
  statusText: {
    fontSize: 14,
    color: P.textSecondary,
    fontWeight: '500',
  },

  // Section Title
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: P.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },

  // Result Item
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  resultItemPressed: {
    backgroundColor: P.card,
  },
  resultImage: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: P.card,
  },
  supplierFallback: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: P.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supplierInitial: {
    fontSize: 20,
    fontWeight: '800',
    color: P.primary,
  },
  destinationIcon: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: P.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultInfo: {
    flex: 1,
    gap: 3,
  },
  resultTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  resultTitle: {
    fontSize: 10,
    color: P.text,
    flex: 1,
  },
  resultMeta: {
    fontSize: 12,
    fontWeight: '400',
    color: P.textSecondary,
  },

  // View All
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: P.faint,
    backgroundColor: P.card,
  },
  viewAllPressed: {
    backgroundColor: P.faint,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: P.primary,
  },
});
