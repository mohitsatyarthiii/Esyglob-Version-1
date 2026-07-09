import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { fetchSellerDetails } from '../api/marketplace';
import { Product, SellerSummary } from '../api/types';
import ProductCard from '../components/ProductCard';
import RemoteImage from '../components/RemoteImage';
import ReviewsPanel from '../components/ReviewsPanel';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { colors, radii, shadow, spacing } from '../theme';
import { formatValue, humanize } from '../utils/display';
import { getId } from '../utils/format';
import { logPerf, perfNow } from '../utils/performance';

type Tab = 'overview' | 'products' | 'company' | 'factory' | 'certificates' | 'reviews';

const detailTabs: Array<{ key: Tab; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'products', label: 'Products' },
  { key: 'company', label: 'Company' },
  { key: 'factory', label: 'Factory' },
  { key: 'certificates', label: 'Certificates' },
  { key: 'reviews', label: 'Reviews' },
];

function SellerDetailsScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { sellerId, sellerName } = route.params as { sellerId: string; sellerName?: string };
  const screenStart = useRef(perfNow()).current;
  const visibleLogged = useRef(false);
  const tabVisibleLogged = useRef<Record<string, boolean>>({});
  const [tab, setTab] = useState<Tab>('overview');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'latest' | 'rating' | 'price_asc'>('latest');
  const seller = useQuery({
    queryKey: ['seller-details', sellerId],
    queryFn: () => fetchSellerDetails(sellerId),
    enabled: Boolean(sellerId),
    staleTime: 120_000,
  });
  const data = seller.data;
  const profile = data?.seller;
  const products = useMemo(() => {
    const rows = data?.products ?? [];
    const searched = query.trim()
      ? rows.filter(product => `${product.name ?? product.title ?? ''} ${product.category ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()))
      : rows;

    return [...searched].sort((a, b) => sortProducts(a, b, sort));
  }, [data?.products, query, sort]);

  useEffect(() => {
    if (!visibleLogged.current && profile) {
      visibleLogged.current = true;
      logPerf('screen:supplier-profile-visible', {
        sellerId,
        products: data?.products?.length ?? 0,
        factoryImages: profile.factoryImages?.length ?? 0,
        hasFactoryProfile: Boolean(data?.factoryProfile),
        ms: Math.round(perfNow() - screenStart),
      });
    }
  }, [data?.factoryProfile, data?.products?.length, profile, screenStart, sellerId]);

  useEffect(() => {
    if (!profile || tabVisibleLogged.current[tab]) {
      return;
    }

    tabVisibleLogged.current[tab] = true;
    logPerf('screen:supplier-tab-visible', {
      sellerId,
      tab,
      products: data?.products?.length ?? 0,
      factoryImages: profile.factoryImages?.length ?? 0,
      ms: Math.round(perfNow() - screenStart),
    });
  }, [data?.products?.length, profile, screenStart, sellerId, tab]);

  if (seller.isLoading) {
    return <LoadingState label="Loading supplier profile" />;
  }

  if (seller.isError || !profile) {
    return <ErrorState message={(seller.error as Error)?.message ?? 'Supplier was not returned.'} onRetry={() => seller.refetch()} />;
  }

  const title = sellerTitle(profile, sellerName);
  const verified = profile.isVerified || profile.verificationStatus === 'verified';
  const location = profile.address?.city ?? profile.address?.country ?? profile.country;
  const images = [...(profile.factoryImages ?? []), ...products.flatMap(product => product.images ?? [])].filter(Boolean).slice(0, 5);
  const categories = profile.mainCategories?.filter(Boolean).slice(0, 6) ?? [];

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconButton}>
          <Icon name="arrow-left" size={24} color={colors.ink} />
        </Pressable>
        <Text numberOfLines={1} style={styles.headerTitle}>{title}</Text>
        <Pressable style={styles.iconButton}>
          <Icon name="share-variant-outline" size={22} color={colors.ink} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.logo}>
              <RemoteImage
                uri={profile.logo ?? profile.companyLogo}
                width={148}
                height={148}
                style={styles.logoImage}
                fallback={<Text style={styles.logoText}>{title.slice(0, 1).toUpperCase()}</Text>}
              />
            </View>
            <View style={styles.heroBody}>
              <Text style={styles.title}>{title}</Text>
              <View style={styles.badges}>
                {verified ? <Badge icon="check-decagram" text="Verified supplier" /> : null}
                {profile.factoryVerified ? <Badge icon="factory" text="Factory verified" /> : null}
              </View>
              <Text style={styles.meta}>{[profile.businessType ?? profile.companyType ?? profile.supplierType, location].filter(Boolean).join(' • ')}</Text>
            </View>
          </View>
          <View style={styles.stats}>
            <Metric label="Products" value={profile.productCount ?? products.length} />
            <Metric label="Rating" value={profile.rating ?? '-'} />
            <Metric label="Response" value={profile.responseRate ?? '-'} />
            <Metric label="Years" value={profile.yearsInBusiness ?? '-'} />
          </View>
          <View style={styles.actions}>
            <Pressable onPress={() => navigation.navigate('Messages')} style={styles.primaryAction}>
              <Icon name="message-text-outline" size={18} color="#fff" />
              <Text style={styles.primaryActionText}>Message</Text>
            </Pressable>
            <Pressable onPress={() => navigation.navigate('RFQ')} style={styles.secondaryAction}>
              <Icon name="bullseye-arrow" size={18} color={colors.primaryDark} />
              <Text style={styles.secondaryActionText}>RFQ</Text>
            </Pressable>
            <Pressable style={styles.roundAction}>
              <Icon name="heart-outline" size={19} color={colors.ink} />
            </Pressable>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {detailTabs.map(item => (
            <Pressable key={item.key} onPress={() => setTab(item.key)} style={[styles.tab, tab === item.key && styles.activeTab]}>
              <Text style={[styles.tabText, tab === item.key && styles.activeTabText]}>{item.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {tab === 'overview' ? (
          <>
            <Section title="Company overview">
              <Text style={styles.paragraph}>
                {profile.companyIntroduction ?? profile.description ?? 'Supplier profile information is available from the marketplace database.'}
              </Text>
            </Section>
            {images.length ? (
              <Section title="Factory images">
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {images.map((uri, index) => (
                    <RemoteImage key={`${uri}-${index}`} uri={uri} width={280} height={216} style={styles.factoryImage} />
                  ))}
                </ScrollView>
              </Section>
            ) : null}
            {categories.length ? (
              <Section title="Top categories">
                <View style={styles.tagWrap}>
                  {categories.map(category => <Text key={category} style={styles.tag}>{category}</Text>)}
                </View>
              </Section>
            ) : null}
            <Section title="Featured products">
              {products.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {products.slice(0, 8).map(product => <ProductCard key={getId(product)} product={product} />)}
                </ScrollView>
              ) : (
                <EmptyState title="No products" />
              )}
            </Section>
          </>
        ) : null}

        {tab === 'products' ? (
          <View>
            <View style={styles.searchRow}>
              <TextInput value={query} onChangeText={setQuery} placeholder="Search this supplier" placeholderTextColor={colors.muted} style={styles.searchInput} />
              {(['latest', 'rating', 'price_asc'] as const).map(item => (
                <Pressable key={item} onPress={() => setSort(item)} style={[styles.sortChip, sort === item && styles.sortChipActive]}>
                  <Text style={[styles.sortText, sort === item && styles.sortTextActive]}>{item === 'price_asc' ? 'Price' : humanize(item)}</Text>
                </Pressable>
              ))}
            </View>
            {products.length ? products.map(product => <ProductCard key={getId(product)} product={product} variant="full" />) : <EmptyState title="No products found" />}
          </View>
        ) : null}

        {tab === 'company' ? (
          <>
            <PublicBusinessDetails seller={profile} factory={data.factoryProfile} verification={data.verification} mode="company" />
            <BusinessBlock title="Export markets" value={profile.mainMarkets ?? profile.exportCountries} />
            <BusinessBlock title="Business capabilities" value={{ annualRevenue: profile.annualRevenue, packaging: profile.packaging, oemOdmSupport: profile.oemOdmSupport }} />
          </>
        ) : null}

        {tab === 'factory' ? (
          <>
            <PublicBusinessDetails seller={profile} factory={data.factoryProfile} verification={data.verification} mode="factory" />
            {images.length ? (
              <Section title="Company and factory images">
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {images.map((uri, index) => (
                    <RemoteImage key={`${uri}-${index}`} uri={uri} width={320} height={220} style={styles.factoryImageLarge} />
                  ))}
                </ScrollView>
              </Section>
            ) : <EmptyState title="No factory media available" />}
          </>
        ) : null}

        {tab === 'certificates' ? (
          <>
            <BusinessBlock title="Company certificates" value={profile.certifications ?? data.factoryProfile?.certifications} />
            <BusinessBlock title="Verification status" value={data.verification ?? { status: profile.verificationStatus, businessLicense: profile.businessLicense, gst: profile.gst }} />
          </>
        ) : null}

        {tab === 'reviews' ? (
          <ReviewsPanel sellerId={profile._id ?? profile.id ?? sellerId} showForm title="Supplier Reviews" />
        ) : null}
      </ScrollView>
    </View>
  );
}

function sortProducts(a: Product, b: Product, sort: 'latest' | 'rating' | 'price_asc') {
  if (sort === 'rating') {
    return (b.averageRating ?? 0) - (a.averageRating ?? 0);
  }

  if (sort === 'price_asc') {
    return Number(a.price ?? a.minPrice ?? 0) - Number(b.price ?? b.minPrice ?? 0);
  }

  return String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''));
}

function sellerTitle(profile: SellerSummary, fallback?: string) {
  return profile.companyName ?? profile.businessName ?? profile.displayName ?? fallback ?? 'Supplier';
}

function Badge({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.badge}>
      <Icon name={icon} size={14} color={colors.green} />
      <Text style={styles.badgeText}>{text}</Text>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: unknown }) {
  return (
    <View style={styles.metric}>
      <Text numberOfLines={1} style={styles.metricValue}>{String(value)}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function BusinessBlock({ title, value }: { title: string; value?: unknown }) {
  const text = formatValue(value);

  if (!text) {
    return null;
  }

  return (
    <Section title={title}>
      <Text style={styles.paragraph}>{text}</Text>
    </Section>
  );
}

function PublicBusinessDetails({
  seller,
  factory,
  verification,
  mode = 'company',
}: {
  seller: SellerSummary;
  factory?: Record<string, unknown> | null;
  verification?: Record<string, unknown> | null;
  mode?: 'company' | 'factory';
}) {
  const companyRows = [
    ['Business type', seller.businessType ?? seller.companyType ?? seller.supplierType],
    ['Location', seller.address?.city ?? seller.address?.country ?? seller.country],
    ['Years in business', seller.yearsInBusiness],
    ['Response rate', seller.responseRate],
    ['Response time', seller.responseTime],
    ['Main markets', seller.mainMarkets ?? seller.exportCountries],
    ['Annual revenue', seller.annualRevenue],
    ['Business license', seller.businessLicense],
    ['GST', seller.gst],
    ['Verification status', seller.verificationStatus ?? verification?.status],
  ] as Array<[string, unknown]>;
  const factoryRows = [
    ['Factory size', seller.factorySize ?? factory?.factorySize ?? factory?.factoryArea],
    ['Employees', seller.employeeCount ?? factory?.employeeCount],
    ['Established', seller.establishedYear ?? factory?.establishedYear],
    ['Production capacity', seller.productionCapacity ?? factory?.productionCapacity],
    ['Quality control', seller.qualityControl ?? factory?.qualityControl],
    ['OEM / ODM', seller.oemOdmSupport ?? factory?.oemOdmSupport],
    ['Certifications', seller.certifications ?? factory?.certifications],
  ] as Array<[string, unknown]>;
  const rows = (mode === 'factory' ? factoryRows : companyRows).filter(([, value]) => formatValue(value));

  return (
    <Section title={mode === 'factory' ? 'Factory information' : 'Business information'}>
      <View style={styles.detailGrid}>
        {rows.map(([label, value]) => (
          <View key={String(label)} style={styles.detailRow}>
            <Text style={styles.detailLabel}>{label}</Text>
            <Text style={styles.detailValue}>{formatValue(value)}</Text>
          </View>
        ))}
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  header: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderBottomColor: colors.faint,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.sm,
  },
  iconButton: {
    alignItems: 'center',
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  headerTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'center',
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  hero: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.lg,
    ...shadow,
  },
  heroTop: {
    flexDirection: 'row',
  },
  logo: {
    alignItems: 'center',
    backgroundColor: '#fff2eb',
    borderRadius: radii.md,
    height: 74,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 74,
  },
  logoImage: {
    height: '100%',
    width: '100%',
  },
  logoText: {
    color: colors.primaryDark,
    fontSize: 28,
    fontWeight: '900',
  },
  heroBody: {
    flex: 1,
    marginLeft: spacing.md,
  },
  title: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 25,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  badge: {
    alignItems: 'center',
    backgroundColor: '#eefaf4',
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  badgeText: {
    color: colors.green,
    fontSize: 11,
    fontWeight: '900',
  },
  meta: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
    marginTop: spacing.sm,
  },
  stats: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  metric: {
    backgroundColor: colors.cardMuted,
    borderRadius: radii.md,
    flex: 1,
    padding: spacing.sm,
  },
  metricValue: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  primaryAction: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 44,
  },
  primaryActionText: {
    color: '#fff',
    fontWeight: '900',
  },
  secondaryAction: {
    alignItems: 'center',
    backgroundColor: '#fff8f3',
    borderRadius: radii.pill,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 44,
  },
  secondaryActionText: {
    color: colors.primaryDark,
    fontWeight: '900',
  },
  roundAction: {
    alignItems: 'center',
    backgroundColor: colors.cardMuted,
    borderRadius: radii.pill,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  tabs: {
    backgroundColor: colors.cardMuted,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    marginVertical: spacing.lg,
    padding: spacing.xs,
  },
  tab: {
    alignItems: 'center',
    borderRadius: radii.pill,
    minWidth: 96,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  activeTab: {
    backgroundColor: colors.card,
  },
  tabText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  activeTabText: {
    color: colors.primaryDark,
  },
  section: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    marginBottom: spacing.lg,
    padding: spacing.lg,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '900',
    marginBottom: spacing.md,
  },
  paragraph: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 22,
  },
  factoryImage: {
    backgroundColor: colors.cardMuted,
    borderRadius: radii.md,
    height: 108,
    marginRight: spacing.sm,
    width: 140,
  },
  factoryImageLarge: {
    backgroundColor: colors.cardMuted,
    borderRadius: radii.md,
    height: 132,
    marginRight: spacing.sm,
    width: 190,
  },
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tag: {
    backgroundColor: colors.cardMuted,
    borderRadius: radii.pill,
    color: colors.ink,
    fontSize: 12,
    fontWeight: '900',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  detailGrid: {
    gap: spacing.sm,
  },
  detailRow: {
    borderBottomColor: colors.faint,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: spacing.sm,
  },
  detailLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '900',
    marginBottom: spacing.xs,
  },
  detailValue: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  searchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  searchInput: {
    backgroundColor: colors.card,
    borderRadius: radii.pill,
    color: colors.ink,
    flexBasis: '100%',
    fontSize: 14,
    fontWeight: '800',
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  sortChip: {
    backgroundColor: colors.card,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sortChipActive: {
    backgroundColor: colors.primary,
  },
  sortText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '900',
  },
  sortTextActive: {
    color: '#fff',
  },
});

export default SellerDetailsScreen;
