import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { Product } from '../api/types';
import { colors, radii, shadow, spacing } from '../theme';
import RemoteImage from './RemoteImage';
import {
  formatMoq,
  formatProductPrice,
  getId,
  getProductImage,
  getProductLocation,
  getSellerName,
  isVerifiedProduct,
} from '../utils/format';

type Props = {
  product: Product;
  variant?: 'carousel' | 'grid' | 'full';
};

function ProductCard({ product, variant = 'carousel' }: Props) {
  const navigation = useNavigation<any>();
  const image = getProductImage(product);
  const location = getProductLocation(product);
  const verified = isVerifiedProduct(product);
  const rating = product.averageRating ? Number(product.averageRating).toFixed(1) : null;

  const openProduct = () => {
    navigation.navigate('ProductDetails', { productId: getId(product) });
  };

  return (
    <Pressable
      onPress={openProduct}
      style={({ pressed }) => [styles.card, styles[variant], pressed && styles.pressed]}>
      <RemoteImage
        uri={image}
        width={420}
        height={300}
        style={styles.image}
        fallback={
          <Icon name="package-variant-closed" size={36} color={colors.muted} />
        }
      />
      <Pressable hitSlop={10} style={styles.save}>
        <Icon name="heart-outline" size={18} color={colors.ink} />
      </Pressable>
      <View style={styles.body}>
        <Text numberOfLines={2} style={styles.name}>{product.name ?? product.title}</Text>
        <Text style={styles.price}>{formatProductPrice(product)}</Text>
        <Text style={styles.moq}>{formatMoq(product)}</Text>
        <View style={styles.supplierRow}>
          <Icon name={verified ? 'check-decagram' : 'store-outline'} size={15} color={verified ? colors.green : colors.muted} />
          <Text numberOfLines={1} style={styles.supplier}>{getSellerName(product)}</Text>
        </View>
        <View style={styles.metaRow}>
          {location ? <Text numberOfLines={1} style={styles.country}>Ships from {location}</Text> : null}
          {rating ? <Text style={styles.rating}>Rating {rating}</Text> : null}
        </View>
        {product.responseRate ? <Text style={styles.response}>{product.responseRate} response rate</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    marginRight: spacing.md,
    overflow: 'hidden',
    ...shadow,
  },
  carousel: {
    width: 188,
  },
  grid: {
    flex: 1,
    marginBottom: spacing.md,
    marginHorizontal: spacing.xs,
    marginRight: spacing.xs,
    minWidth: 0,
  },
  full: {
    marginBottom: spacing.md,
    marginRight: 0,
    width: '100%',
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
  },
  image: {
    backgroundColor: colors.cardMuted,
    height: 128,
    width: '100%',
  },
  save: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: radii.pill,
    height: 34,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.sm,
    top: spacing.sm,
    width: 34,
  },
  body: {
    padding: spacing.sm,
  },
  name: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
    minHeight: 36,
  },
  price: {
    color: colors.primaryDark,
    fontSize: 16,
    fontWeight: '900',
    marginTop: spacing.sm,
  },
  moq: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  supplierRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  supplier: {
    color: colors.text,
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
  },
  country: {
    color: colors.muted,
    flex: 1,
    fontSize: 11,
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  rating: {
    color: colors.amber,
    fontSize: 11,
    fontWeight: '900',
  },
  response: {
    color: colors.secondary,
    fontSize: 11,
    fontWeight: '900',
    marginTop: spacing.xs,
  },
});

export default React.memo(ProductCard);
