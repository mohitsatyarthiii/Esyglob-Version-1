import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { fetchProductDetails, fetchProducts } from '../api/products';
import { searchMarketplaceByImage } from '../api/ai';
import { useAuth } from '../auth/AuthContext';
import RemoteImage from '../components/RemoteImage';
import ProductCard from '../components/ProductCard';
import { ErrorState, LoadingState, EmptyState } from '../components/StateViews';
import { getId } from '../utils/format';
export default function ProductSimilarSearchScreen() {
  const nav = useNavigation<any>();
  const { productId } = useRoute<any>().params;
  const { activeRole } = useAuth();
  const productQ = useQuery({
    queryKey: ['product', productId],
    queryFn: () => fetchProductDetails(productId),
  });
  const product: any = productQ.data;
  const image = product?.images?.[0] ?? product?.image;
  const visual = useQuery({
    queryKey: ['product-similar', productId, image],
    queryFn: () => searchMarketplaceByImage(image, activeRole),
    enabled: Boolean(image),
  });
  const category =
    typeof product?.categoryId === 'object'
      ? product.categoryId?._id ?? product.categoryId?.name
      : product?.categoryId ?? product?.category;
  const categoryQ = useQuery({
    queryKey: ['same-category', category],
    queryFn: () => fetchProducts({ category: String(category), limit: 12 }),
    enabled: Boolean(category),
  });
  if (productQ.isLoading || visual.isLoading)
    return <LoadingState label="Finding similar products" />;
  if (productQ.isError || !product)
    return (
      <ErrorState
        message="The selected product could not be loaded."
        onRetry={() => productQ.refetch()}
      />
    );
  const matches = (visual.data?.products ?? []).filter(
    p => getId(p) !== productId,
  );
  const same = (categoryQ.data?.products ?? []).filter(
    p => getId(p) !== productId,
  );
  const sellers = visual.data?.suppliers ?? [];
  return (
    <View style={s.screen}>
      <View style={s.header}>
        <Pressable onPress={() => nav.goBack()} style={s.icon}>
          <Icon name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <View style={s.headBody}>
          <Text style={s.title}>Find similar products</Text>
          <Text style={s.subtitle}>Visual and marketplace matches</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.source}>
          <RemoteImage
            uri={image}
            width={500}
            height={340}
            resizeMode="contain"
            style={s.preview}
          />
          <View style={s.sourceInfo}>
            <Text style={s.productName}>{product.name ?? product.title}</Text>
            <Text style={s.meta}>
              {[
                readName(product.categoryId ?? product.category),
                readName(product.subcategoryId ?? product.subcategory),
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        </View>
        <Section title="Visually similar products" count={matches.length}>
          {matches.length ? (
            <View style={s.grid}>
              {matches.map(p => (
                <View key={getId(p)} style={s.gridItem}>
                  <ProductCard product={p} />
                </View>
              ))}
            </View>
          ) : (
            <EmptyState
              title="No strong visual matches"
              detail="Category matches are shown below."
            />
          )}
        </Section>
        <Section title="Same category and sub-category" count={same.length}>
          <View style={s.grid}>
            {same.map(p => (
              <View key={getId(p)} style={s.gridItem}>
                <ProductCard product={p} />
              </View>
            ))}
          </View>
        </Section>
        <Section
          title="Related manufacturers and sellers"
          count={sellers.length}
        >
          {sellers.map((seller: any) => (
            <Pressable
              key={getId(seller)}
              onPress={() =>
                nav.navigate('SellerDetails', {
                  sellerId: getId(seller),
                  sellerName: seller.companyName,
                })
              }
              style={s.seller}
            >
              <View style={s.sellerIcon}>
                <Icon name="factory" size={19} color="#2563EB" />
              </View>
              <View style={s.sellerBody}>
                <Text style={s.sellerName}>
                  {seller.companyName ?? seller.businessName ?? 'Manufacturer'}
                </Text>
                <Text style={s.sellerMeta}>
                  {[
                    seller.country,
                    seller.isVerified ? 'Verified seller' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              <Icon name="chevron-right" size={20} color="#94A3B8" />
            </Pressable>
          ))}
        </Section>
      </ScrollView>
    </View>
  );
}
function readName(v: any) {
  return typeof v === 'object' ? v?.name ?? v?.title : String(v ?? '');
}
function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <View style={s.section}>
      <View style={s.sectionHead}>
        <Text style={s.sectionTitle}>{title}</Text>
        <Text style={s.count}>{count}</Text>
      </View>
      {children}
    </View>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderBottomColor: '#E2E8F0',
    borderBottomWidth: 1,
    flexDirection: 'row',
    padding: 13,
    paddingTop: 48,
  },
  icon: {
    height: 40,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headBody: { flex: 1 },
  title: { color: '#0F172A', fontSize: 17, fontWeight: '900' },
  subtitle: { color: '#64748B', fontSize: 10, marginTop: 2 },
  content: { padding: 16, paddingBottom: 70 },
  source: {
    backgroundColor: '#fff',
    borderColor: '#E2E8F0',
    borderRadius: 17,
    borderWidth: 1,
    overflow: 'hidden',
  },
  preview: { backgroundColor: '#F8FAFC', height: 230, width: '100%' },
  sourceInfo: { padding: 14 },
  productName: { color: '#0F172A', fontSize: 15, fontWeight: '900' },
  meta: { color: '#64748B', fontSize: 11, marginTop: 4 },
  section: { marginTop: 18 },
  sectionHead: { alignItems: 'center', flexDirection: 'row', marginBottom: 10 },
  sectionTitle: { color: '#0F172A', flex: 1, fontSize: 14, fontWeight: '900' },
  count: {
    backgroundColor: '#DBEAFE',
    borderRadius: 12,
    color: '#1D4ED8',
    fontSize: 10,
    fontWeight: '900',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridItem: { width: '48%' },
  seller: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#E2E8F0',
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 8,
    padding: 12,
  },
  sellerIcon: {
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    height: 39,
    justifyContent: 'center',
    width: 39,
  },
  sellerBody: { flex: 1, marginLeft: 10 },
  sellerName: { color: '#0F172A', fontSize: 12, fontWeight: '900' },
  sellerMeta: { color: '#64748B', fontSize: 10, marginTop: 3 },
});
