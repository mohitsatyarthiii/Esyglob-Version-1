import React, { useMemo, useState } from 'react';
import {
  Pressable,
  Alert,
  Linking,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { fetchSellerDetails, startProductChat } from '../api/marketplace';
import { fetchProducts } from '../api/products';
import { Product, SellerSummary } from '../api/types';
import ProductCard from '../components/ProductCard';
import RemoteImage from '../components/RemoteImage';
import ReviewsPanel from '../components/ReviewsPanel';
import SavedHeartButton from '../components/SavedHeartButton';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { formatValue } from '../utils/display';
import { getId, getStableKey } from '../utils/format';
import { firstImage } from '../utils/images';

// ─── Types ──────────────────────────────────────────────────────────────────

type Tab = 'products' | 'company' | 'factory' | 'certificates' | 'reviews' | 'about' | 'contact';

const TABS: Array<{ key: Tab; label: string; icon: string }> = [
  { key: 'products', label: 'Products', icon: 'package-variant' },
  { key: 'company', label: 'Company', icon: 'office-building' },
  { key: 'factory', label: 'Factory', icon: 'factory' },
  { key: 'certificates', label: 'Certs', icon: 'certificate' },
  { key: 'reviews', label: 'Reviews', icon: 'star' },
  { key: 'about', label: 'About', icon: 'information-outline' },
  { key: 'contact', label: 'Contact', icon: 'card-account-phone-outline' },
];

// ─── Palette ────────────────────────────────────────────────────────────────

const P = {
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  primary: '#0F172A',
  accent: '#2563EB',
  accentLight: '#EFF6FF',
  text: '#0F172A',
  textSecondary: '#475569',
  muted: '#94A3B8',
  border: '#E2E8F0',
  inputBg: '#F1F5F9',
  success: '#059669',
  successLight: '#ECFDF5',
  warning: '#D97706',
  warningLight: '#FFFBEB',
  rose: '#E11D48',
  roseLight: '#FFF1F2',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function sellerTitle(profile: SellerSummary, fallback?: string): string {
  return (
    profile.companyName ??
    profile.businessName ??
    profile.displayName ??
    fallback ??
    'Supplier'
  );
}

function getCategoryString(product: Product): string {
  if (typeof product.category === 'string') return product.category;
  if (product.category && typeof product.category === 'object') {
    return (product.category as any).name ?? '';
  }
  return '';
}

function sortProducts(
  a: Product,
  b: Product,
  sort: 'latest' | 'rating' | 'price_asc',
): number {
  if (sort === 'rating') return (b.averageRating ?? 0) - (a.averageRating ?? 0);
  if (sort === 'price_asc')
    return Number(a.price ?? 0) - Number(b.price ?? 0);
  return String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''));
}

function hasData(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

// ─── Component ──────────────────────────────────────────────────────────────

function SellerDetailsScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { sellerId, sellerName } = route.params as {
    sellerId: string;
    sellerName?: string;
  };
  const [tab, setTab] = useState<Tab>('products');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'latest' | 'rating' | 'price_asc'>('latest');
  const [certificatePreview, setCertificatePreview] = useState<{ name: string; url: string } | null>(null);

  const seller = useQuery({
    queryKey: ['seller-details', sellerId],
    queryFn: () => fetchSellerDetails(sellerId),
    enabled: Boolean(sellerId),
    staleTime: 120_000,
  });

  const data = seller.data;
  const profile = data?.seller;
  const factory = data?.factoryProfile as Record<string, any> | null;
  const verification = data?.verification as Record<string, any> | null;
  const productPages = useInfiniteQuery({
    queryKey: ['seller-products-public', sellerId, query, sort],
    queryFn: ({ pageParam }) => fetchProducts({ seller: sellerId, q: query || undefined, sort, page: pageParam, limit: 12 }),
    initialPageParam: 1,
    getNextPageParam: lastPage => {
      const page = lastPage.pagination?.page ?? 1;
      const totalPages = lastPage.pagination?.totalPages ?? 1;
      return page < totalPages ? page + 1 : undefined;
    },
    enabled: Boolean(sellerId) && tab === 'products',
    staleTime: 90_000,
  });
  const allProducts = useMemo<Product[]>(() => {
    const paged = productPages.data?.pages.flatMap(page => page.products) ?? [];
    return paged.length ? paged : data?.products ?? [];
  }, [data?.products, productPages.data?.pages]);

  const products = useMemo(() => {
    const searched: Product[] = query.trim()
      ? allProducts.filter((product: Product) => {
          const name = product.name ?? product.title ?? '';
          const cat = getCategoryString(product);
          return `${name} ${cat}`.toLowerCase().includes(query.trim().toLowerCase());
        })
      : allProducts;
    return [...searched].sort((a, b) => sortProducts(a, b, sort));
  }, [allProducts, query, sort]);

  const tabAvailability = useMemo(() => {
    const certs = profile?.certifications ?? factory?.certifications ?? [];
    const hasCerts = Array.isArray(certs) ? certs.length > 0 : hasData(certs);
    const hasFactory = hasData(factory);

    return {
      products: true,
      company: true,
      factory: hasFactory,
      certificates: hasCerts,
      reviews: true,
      about: true,
      contact: true,
    };
  }, [profile?.certifications, factory]);

  const title = sellerTitle(profile ?? {}, sellerName);
  const supplierId = profile ? getStableKey(profile) : sellerId;
  const sellerUserId = typeof profile?.userId === 'string'
    ? profile.userId
    : profile?.userId?._id ?? profile?.userId?.id;
  const chat = useMutation({
    mutationFn: () => {
      if (!sellerUserId) throw new Error('Supplier contact is unavailable.');
      return startProductChat({ otherUserId: sellerUserId, productId: '', enquiry: false });
    },
    onSuccess: result => navigation.navigate('ChatDetails', { chatId: getId(result.chat!), title }),
    onError: error => Alert.alert('Chat unavailable', error instanceof Error ? error.message : 'Unable to contact supplier.'),
  });

  if (seller.isLoading) return <LoadingState label="Loading supplier..." />;
  if (seller.isError || !profile)
    return (
      <ErrorState
        message={(seller.error as Error)?.message ?? 'Supplier not found'}
        onRetry={() => seller.refetch()}
      />
    );

  const verified = profile.isVerified || profile.verificationStatus === 'verified';
  const location = [
    profile.address?.city,
    profile.address?.country ?? profile.country,
  ]
    .filter(Boolean)
    .join(', ');
  const logoUri = firstImage(
    profile.logo,
    profile.companyLogo,
    profile.logoUrl,
  );

  const visibleTabs = TABS.filter(t => tabAvailability[t.key]);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={P.surface} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="arrow-left" size={22} color={P.text} />
        </Pressable>
        <Text numberOfLines={1} style={styles.headerTitle}>
          {title}
        </Text>
        <SavedHeartButton
          type="supplier"
          itemId={supplierId}
          target={profile}
          size={18}
          iconColor={P.muted}
          savedColor={P.rose}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[1]}>
        {/* Hero Card */}
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.logoWrap}>
              {logoUri ? (
                <RemoteImage
                  uri={logoUri}
                  width={120}
                  height={120}
                  style={styles.logo}
                />
              ) : (
                <View style={styles.logoPlaceholder}>
                  <Text style={styles.logoText}>
                    {title.slice(0, 2).toUpperCase()}
                  </Text>
                </View>
              )}
              {verified && (
                <View style={styles.verifiedBadge}>
                  <Icon name="check-decagram" size={14} color={P.success} />
                </View>
              )}
            </View>

            <View style={styles.heroInfo}>
              <Text style={styles.sellerName}>{title}</Text>
              {location ? (
                <View style={styles.locationRow}>
                  <Icon name="map-marker-outline" size={12} color={P.muted} />
                  <Text style={styles.locationText}>{location}</Text>
                </View>
              ) : null}
              <View style={styles.badgeRow}>
                {verified && (
                  <View style={styles.verifiedPill}>
                    <Text style={styles.verifiedPillText}>Verified</Text>
                  </View>
                )}
                {profile.businessType && (
                  <View style={styles.typePill}>
                    <Text style={styles.typePillText}>
                      {String(profile.businessType).replace(/_/g, ' ')}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Stats */}
          <View style={styles.statsRow}>
            <StatItem
              icon="package-variant"
              label="Products"
              value={profile.productCount ?? allProducts.length}
            />
            <StatItem
              icon="star"
              label="Rating"
              value={profile.rating ? Number(profile.rating).toFixed(1) : '-'}
            />
            <StatItem
              icon="timer-outline"
              label="Response"
              value={profile.responseRate ?? '-'}
            />
            <StatItem
              icon="calendar"
              label="Years"
              value={profile.yearsInBusiness ?? '-'}
            />
          </View>

          {/* Actions */}
          <View style={styles.actionRow}>
            <Pressable
              disabled={chat.isPending || !sellerUserId}
              onPress={() => chat.mutate()}
              style={styles.chatBtn}>
              <Icon name="message-text-outline" size={16} color="#FFF" />
              <Text style={styles.chatBtnText}>{chat.isPending ? 'Opening...' : 'Chat'}</Text>
            </Pressable>
            <Pressable
              onPress={() =>
                navigation.navigate('RFQCreate', {
                  prefill: { sellerId: supplierId, supplierName: title },
                })
              }
              style={styles.rfqBtn}>
              <Icon name="bullseye-arrow" size={16} color="#FFF" />
              <Text style={styles.rfqBtnText}>Send RFQ</Text>
            </Pressable>
          </View>
        </View>

        {/* Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabBarContent}>
          {visibleTabs.map(t => {
            const active = tab === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                style={[styles.tab, active && styles.tabActive]}>
                <Icon
                  name={t.icon}
                  size={16}
                  color={active ? P.accent : P.muted}
                />
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Content */}
        {tab === 'products' && (
          <View style={styles.tabContent}>
            <View style={styles.searchRow}>
              <View style={styles.searchBox}>
                <Icon name="magnify" size={16} color={P.muted} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search products..."
                  placeholderTextColor={P.muted}
                  style={styles.searchInput}
                />
              </View>
              <View style={styles.sortRow}>
                {(['latest', 'rating', 'price_asc'] as const).map(s => (
                  <Pressable
                    key={s}
                    onPress={() => setSort(s)}
                    style={[styles.sortChip, sort === s && styles.sortChipActive]}>
                    <Text
                      style={[
                        styles.sortText,
                        sort === s && styles.sortTextActive,
                      ]}>
                      {s === 'price_asc' ? 'Price' : s === 'rating' ? 'Rating' : 'Latest'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {products.length > 0 ? (
              <View style={styles.productGrid}>
                {products.map((product: Product) => (
                  <View key={getId(product)} style={styles.productItem}>
                    <ProductCard product={product} variant="grid" />
                  </View>
                ))}
              </View>
            ) : (
              <EmptyState title="No products" detail="This supplier has no products yet." />
            )}
            {productPages.hasNextPage ? (
              <Pressable disabled={productPages.isFetchingNextPage} onPress={() => productPages.fetchNextPage()} style={styles.loadMoreBtn}>
                <Text style={styles.loadMoreText}>{productPages.isFetchingNextPage ? 'Loading...' : 'Load more products'}</Text>
              </Pressable>
            ) : null}
          </View>
        )}

        {tab === 'company' && (
          <View style={styles.tabContent}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Business Information</Text>
              <DetailRow label="Company Name" value={profile.companyName} />
              <DetailRow label="Business Type" value={profile.businessType ?? profile.companyType} />
              <DetailRow label="Location" value={location} />
              <DetailRow label="Years in Business" value={profile.yearsInBusiness} />
              <DetailRow label="Response Rate" value={profile.responseRate} />
              <DetailRow label="Response Time" value={profile.responseTime} />
              <DetailRow label="Main Markets" value={profile.mainMarkets ?? profile.exportCountries} />
              <DetailRow label="Annual Revenue" value={profile.annualRevenue} />
              <DetailRow label="GST" value={profile.gst} />
              <DetailRow label="Business License" value={profile.businessLicense} />
              <DetailRow label="Verification Status" value={profile.verificationStatus ?? verification?.status} />
            </View>

            {profile.companyIntroduction || profile.description ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>About</Text>
                <Text style={styles.aboutText}>
                  {profile.companyIntroduction ?? profile.description}
                </Text>
              </View>
            ) : null}
          </View>
        )}

        {tab === 'factory' && (
          <View style={styles.tabContent}>
            {factory ? (
              <>
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Factory Details</Text>
                  <DetailRow label="Factory Name" value={factory.name ?? factory.factoryName} />
                  <DetailRow label="Floor Area" value={factory.floorArea ?? factory.factorySize} />
                  <DetailRow label="Employees" value={factory.employeeCount} />
                  <DetailRow label="Production Lines" value={factory.productionLines} />
                  <DetailRow label="Monthly Capacity" value={factory.monthlyCapacity ?? factory.productionCapacity} />
                  <DetailRow label="Annual Capacity" value={factory.annualCapacity} />
                  <DetailRow label="Machinery" value={factory.machinery} />
                  <DetailRow label="Quality Control" value={factory.qualityControl} />
                  <DetailRow label="OEM / ODM Support" value={factory.oemOdmSupport ?? profile.oemOdmSupport} />
                </View>

                {factory.images?.length > 0 && (
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>Factory Images</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.imageRow}>
                      {(factory.images as string[]).map((uri: string, i: number) => (
                        <RemoteImage
                          key={`${uri}-${i}`}
                          uri={uri}
                          width={280}
                          height={200}
                          style={styles.factoryImg}
                        />
                      ))}
                    </ScrollView>
                  </View>
                )}

                {factory.capabilities?.length > 0 && (
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>Capabilities</Text>
                    <View style={styles.chipRow}>
                      {(factory.capabilities as string[]).map((cap: string) => (
                        <View key={cap} style={styles.capChip}>
                          <Text style={styles.capText}>{cap}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </>
            ) : (
              <EmptyState
                title="No factory data"
                detail="This supplier hasn't added factory details yet."
              />
            )}
          </View>
        )}

        {tab === 'certificates' && (
          <View style={styles.tabContent}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Certifications</Text>
              {(() => {
                const certs = profile.certifications ?? factory?.certifications ?? [];
                const certList: any[] = Array.isArray(certs)
                  ? certs
                  : typeof certs === 'string'
                  ? certs.split(',').map(s => s.trim()).filter(Boolean)
                  : [];

                if (certList.length === 0) {
                  return <EmptyState title="No certificates" />;
                }

                return (
                  <View style={styles.certList}>
                    {certList.map((cert: any, i: number) => {
                      const name = typeof cert === 'string' ? cert : cert.name ?? cert.certificateNumber ?? `Certificate ${i + 1}`;
                      const url = typeof cert === 'object' ? cert.documentUrl ?? cert.url : '';
                      return <Pressable key={`${name}-${i}`} disabled={!url} onPress={() => setCertificatePreview({ name, url })} style={styles.certItem}>
                        <Icon name="certificate" size={20} color={P.warning} />
                        <Text style={styles.certText}>{name}</Text>
                        {url ? <Icon name="magnify-plus-outline" size={18} color={P.accent} /> : null}
                      </Pressable>;
                    })}
                  </View>
                );
              })()}
            </View>
          </View>
        )}

        {tab === 'reviews' && (
          <View style={styles.tabContent}>
            <ReviewsPanel
              sellerId={supplierId}
              showForm
              title="Supplier Reviews"
            />
          </View>
        )}

        {tab === 'about' && (
          <View style={styles.tabContent}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>About {title}</Text>
              {profile.companyDescription ? <Text style={styles.aboutText}>{profile.companyDescription}</Text> : <EmptyState title="No company introduction" detail="The supplier has not published an introduction yet." />}
              <DetailRow label="Established" value={profile.yearEstablished} />
              <DetailRow label="Employees" value={profile.employeeCount} />
              <DetailRow label="Main Markets" value={profile.exportMarkets} />
              <DetailRow label="Product Categories" value={profile.productCategories} />
            </View>
          </View>
        )}

        {tab === 'contact' && (
          <View style={styles.tabContent}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Business Contact</Text>
              <DetailRow label="Email" value={profile.businessEmail} />
              <DetailRow label="Phone" value={profile.businessPhone} />
              <DetailRow label="Website" value={profile.companyWebsite} />
              <DetailRow label="Address" value={profile.address} />
              <Pressable disabled={chat.isPending || !sellerUserId} onPress={() => chat.mutate()} style={styles.contactAction}>
                <Icon name="message-text-outline" size={17} color="#FFF" /><Text style={styles.contactActionText}>Contact Supplier</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>
      <Modal visible={Boolean(certificatePreview)} animationType="fade" onRequestClose={() => setCertificatePreview(null)}>
        <View style={styles.certificateViewer}>
          <View style={styles.certificateViewerHeader}><Pressable onPress={() => setCertificatePreview(null)}><Icon name="close" size={25} color="#FFF" /></Pressable><Text numberOfLines={1} style={styles.certificateViewerTitle}>{certificatePreview?.name}</Text><Pressable onPress={() => certificatePreview?.url && Linking.openURL(certificatePreview.url)}><Icon name="download" size={24} color="#FFF" /></Pressable></View>
          <ScrollView maximumZoomScale={4} minimumZoomScale={1} contentContainerStyle={styles.certificateZoom}>
            <RemoteImage uri={certificatePreview?.url} width={1200} height={1600} resizeMode="contain" style={styles.certificateImage} fallback={<View style={styles.certificateFallback}><Icon name="file-document-outline" size={60} color={P.muted} /><Text style={styles.certificateFallbackText}>Open the document to preview or download it.</Text><Pressable onPress={() => certificatePreview?.url && Linking.openURL(certificatePreview.url)} style={styles.contactAction}><Text style={styles.contactActionText}>Open Document</Text></Pressable></View>} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ─── Sub-Components ─────────────────────────────────────────────────────────

function StatItem({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string | number;
}) {
  return (
    <View style={styles.statItem}>
      <Icon name={icon} size={14} color={P.accent} />
      <Text style={styles.statValue}>{String(value)}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: unknown }) {
  const display = formatValue(value);
  if (!display) return null;

  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{display}</Text>
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
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: P.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: P.text,
    textAlign: 'center',
    marginHorizontal: 10,
  },
  content: { paddingBottom: 40 },

  // Hero
  heroCard: {
    backgroundColor: P.surface,
    margin: 14,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: P.border,
  },
  heroTop: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  logoWrap: { position: 'relative' },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: P.inputBg,
  },
  logoPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: P.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { fontSize: 22, fontWeight: '800', color: P.accent },
  verifiedBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: P.successLight,
    borderRadius: 10,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: P.surface,
  },
  heroInfo: { flex: 1, gap: 4 },
  sellerName: { fontSize: 17, fontWeight: '700', color: P.text },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationText: { fontSize: 12, color: P.muted },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  verifiedPill: {
    backgroundColor: P.successLight,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  verifiedPillText: { fontSize: 10, fontWeight: '700', color: P.success },
  typePill: {
    backgroundColor: P.accentLight,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  typePillText: {
    fontSize: 10,
    fontWeight: '600',
    color: P.accent,
    textTransform: 'capitalize',
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: P.border,
  },
  statItem: { alignItems: 'center', gap: 2 },
  statValue: { fontSize: 14, fontWeight: '700', color: P.text },
  statLabel: { fontSize: 10, color: P.muted },

  // Actions
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  chatBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: P.primary,
    borderRadius: 12,
    height: 44,
  },
  chatBtnText: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  rfqBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: P.accent,
    borderRadius: 12,
    height: 44,
  },
  rfqBtnText: { color: '#FFF', fontSize: 13, fontWeight: '600' },

  // Tabs
  tabBarContent: { paddingHorizontal: 10 },
  contactAction: { marginTop: 16, height: 44, borderRadius: 12, backgroundColor: P.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  contactActionText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  loadMoreBtn: { alignSelf: 'center', marginTop: 16, borderRadius: 10, backgroundColor: P.accent, paddingHorizontal: 18, paddingVertical: 11 },
  loadMoreText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  certificateViewer: { flex: 1, backgroundColor: '#050505' },
  certificateViewerHeader: { paddingTop: 50, paddingHorizontal: 16, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 14 },
  certificateViewerTitle: { flex: 1, color: '#FFF', fontSize: 15, fontWeight: '700' },
  certificateZoom: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  certificateImage: { width: '100%', height: 620 },
  certificateFallback: { width: '100%', height: 620, alignItems: 'center', justifyContent: 'center', padding: 30 },
  certificateFallbackText: { color: '#CBD5E1', textAlign: 'center', marginTop: 12 },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: P.surface,
    marginHorizontal: 14,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: P.border,
  },
  tab: {
    minWidth: 105,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    borderRadius: 10,
  },
  tabActive: { backgroundColor: P.accentLight },
  tabText: { fontSize: 11, fontWeight: '600', color: P.muted },
  tabTextActive: { color: P.accent, fontWeight: '700' },

  // Content
  tabContent: { padding: 14 },

  // Cards
  card: {
    backgroundColor: P.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: P.border,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: P.text,
    marginBottom: 12,
  },

  // Detail Rows
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: P.border,
  },
  detailLabel: { fontSize: 12, color: P.textSecondary, flex: 1 },
  detailValue: { fontSize: 12, fontWeight: '600', color: P.text, flex: 1, textAlign: 'right' },

  // About
  aboutText: { fontSize: 13, lineHeight: 20, color: P.textSecondary },

  // Search
  searchRow: { marginBottom: 12, gap: 8 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: P.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    borderWidth: 1,
    borderColor: P.border,
  },
  searchInput: { flex: 1, fontSize: 13, color: P.text },
  sortRow: { flexDirection: 'row', gap: 6 },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: P.surface,
    borderWidth: 1,
    borderColor: P.border,
  },
  sortChipActive: { backgroundColor: P.primary, borderColor: P.primary },
  sortText: { fontSize: 11, fontWeight: '600', color: P.muted },
  sortTextActive: { color: '#FFF' },

  // Product Grid
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  productItem: {
    width: '48%',
    minWidth: 0,
  },

  // Factory Images
  imageRow: { gap: 10 },
  factoryImg: {
    width: 240,
    height: 160,
    borderRadius: 10,
    backgroundColor: P.inputBg,
  },

  // Chips
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  capChip: {
    backgroundColor: P.inputBg,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: P.border,
  },
  capText: { fontSize: 11, fontWeight: '600', color: P.textSecondary },

  // Certificates
  certList: { gap: 8 },
  certItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: P.warningLight,
    borderRadius: 10,
    padding: 10,
  },
  certText: { fontSize: 12, fontWeight: '600', color: P.text },
});

export default SellerDetailsScreen;
