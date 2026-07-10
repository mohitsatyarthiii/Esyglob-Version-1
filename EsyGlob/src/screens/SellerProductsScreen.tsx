import React, { useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { deleteSellerProduct, fetchSellerProducts } from '../api/marketplace';
import { Product } from '../api/types';
import RemoteImage from '../components/RemoteImage';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { colors, radii, spacing } from '../theme';
import { formatProductPrice, getId } from '../utils/format';
import { firstImage } from '../utils/images';
import { Header, Chip } from '../components/SellerFormPrimitives';

const filters = ['all', 'draft', 'published', 'active', 'paused', 'pending_review', 'rejected'];

function SellerProductsScreen() {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const products = useQuery({
    queryKey: ['seller-products', q, status],
    queryFn: () => fetchSellerProducts({ q: q.trim() || undefined, status: status === 'all' ? undefined : status }),
  });
  const remove = useMutation({
    mutationFn: deleteSellerProduct,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['seller-products'] }),
    onError: error => Alert.alert('Delete failed', error instanceof Error ? error.message : 'Unable to delete product.'),
  });

  if (products.isLoading) return <LoadingState label="Loading seller products" />;
  if (products.isError) return <ErrorState message={(products.error as Error).message} onRetry={() => products.refetch()} />;

  return (
    <View style={styles.screen}>
      <FlatList
        data={products.data?.products ?? []}
        keyExtractor={item => getId(item)}
        refreshControl={<RefreshControl refreshing={products.isRefetching} onRefresh={() => products.refetch()} />}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            <Header title="Products" onBack={() => navigation.goBack()} />
            <Pressable onPress={() => navigation.navigate('SellerProductForm', {})} style={styles.addButton}>
              <Icon name="plus" size={20} color="#fff" />
              <Text style={styles.addButtonText}>Add Product</Text>
            </Pressable>
            <View style={styles.searchBox}>
              <Icon name="magnify" size={20} color={colors.muted} />
              <TextInput value={q} onChangeText={setQ} placeholder="Search products" placeholderTextColor={colors.muted} style={styles.searchInput} />
            </View>
            <FlatList horizontal data={filters} keyExtractor={item => item} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} renderItem={({ item }) => <Chip label={item} active={status === item} onPress={() => setStatus(item)} />} />
          </View>
        }
        ListEmptyComponent={<EmptyState title="No products" detail="Add products to publish your seller catalog." />}
        renderItem={({ item }) => (
          <ProductCard
            product={item}
            onEdit={() => navigation.navigate('SellerProductForm', { productId: getId(item) })}
            onDelete={() => Alert.alert('Delete product?', 'Delete this product? This cannot be undone.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(getId(item)) },
            ])}
          />
        )}
      />
    </View>
  );
}

function ProductCard({ product, onEdit, onDelete }: { product: Product; onEdit: () => void; onDelete: () => void }) {
  const record = product as Product & { updatedAt?: string };
  return (
    <View style={styles.card}>
      <RemoteImage uri={firstImage(product.image, product.images)} width={170} height={170} style={styles.image} fallback={<Icon name="package-variant-closed" size={28} color={colors.muted} />} />
      <View style={styles.body}>
        <View style={styles.topRow}>
          <Text numberOfLines={2} style={styles.name}>{product.name ?? product.title ?? 'Product'}</Text>
          <Text style={styles.status}>{product.status ?? 'draft'}</Text>
        </View>
        <Text style={styles.price}>{formatProductPrice(product)}</Text>
        <Text style={styles.meta}>MOQ {product.minimumOrderQuantity ?? product.moq ?? 1} {product.unit ?? 'pcs'}</Text>
        <Text style={styles.meta}>{[product.category, product.subcategory].filter(Boolean).join(' / ') || 'No category'}</Text>
        <Text style={styles.meta}>Updated {record.updatedAt ? new Date(record.updatedAt).toLocaleDateString() : '-'}</Text>
        <View style={styles.actions}>
          <Pressable onPress={onEdit} style={styles.action}><Icon name="pencil-outline" size={17} color={colors.primaryDark} /><Text style={styles.actionText}>Edit</Text></Pressable>
          <Pressable onPress={onDelete} style={styles.action}><Icon name="delete-outline" size={17} color={colors.rose} /><Text style={[styles.actionText, { color: colors.rose }]}>Delete</Text></Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  addButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.pill, flexDirection: 'row', gap: spacing.xs, justifyContent: 'center', marginBottom: spacing.md, padding: spacing.md },
  addButtonText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  searchBox: { alignItems: 'center', backgroundColor: colors.card, borderRadius: radii.md, flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md, minHeight: 46, paddingHorizontal: spacing.md },
  searchInput: { color: colors.ink, flex: 1, fontSize: 14, fontWeight: '800' },
  filters: { gap: spacing.sm, paddingBottom: spacing.md },
  card: { backgroundColor: colors.card, borderRadius: radii.md, flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md, padding: spacing.md },
  image: { backgroundColor: colors.cardMuted, borderRadius: radii.sm, height: 92, width: 92 },
  body: { flex: 1 },
  topRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  name: { color: colors.ink, flex: 1, fontSize: 15, fontWeight: '900', lineHeight: 20 },
  status: { backgroundColor: '#fff8f3', borderRadius: radii.pill, color: colors.primaryDark, fontSize: 10, fontWeight: '900', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, textTransform: 'uppercase' },
  price: { color: colors.primaryDark, fontSize: 15, fontWeight: '900', marginTop: spacing.xs },
  meta: { color: colors.muted, fontSize: 12, fontWeight: '800', marginTop: 2 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  action: { alignItems: 'center', backgroundColor: colors.cardMuted, borderRadius: radii.pill, flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  actionText: { color: colors.primaryDark, fontSize: 12, fontWeight: '900' },
});

export default SellerProductsScreen;
