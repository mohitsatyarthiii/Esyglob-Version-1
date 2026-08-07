import React, { useMemo, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { Product } from '../api/types';
import { useCurrency } from '../currency/CurrencyContext';
import RemoteImage from './RemoteImage';
import SavedHeartButton from './SavedHeartButton';
import {
  formatMoq,
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

const C = {
  primary: '#F26A21',
  primarySoft: '#FFF4ED',
  ink: '#15171D',
  text: '#394150',
  muted: '#737984',
  line: '#E2E5EA',
  surface: '#FFFFFF',
  image: '#F3F5F8',
  blue: '#2563EB',
  green: '#138A5B',
  amber: '#E99A16',
} as const;

function ProductCard({ product, variant = 'carousel' }: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const { formatPrice } = useCurrency();
  const navigation = useNavigation<any>();
  const scale = useRef(new Animated.Value(1)).current;
  const productId = getId(product);
  const validProductId = Boolean(productId && /^[a-f\d]{24}$/i.test(productId));
  const verified = isVerifiedProduct(product);
  const sellerName = getSellerName(product);
  const location = getProductLocation(product);
  const rating = Number(product.averageRating ?? 0);
  const reviews = Number(product.reviewCount ?? 0);
  const image = getProductImage(product);
  const isList = variant === 'full';
  const cardWidth = variant === 'carousel'
    ? Math.min(176, screenWidth * 0.46)
    : Math.max(148, (screenWidth - 36) / 2);
  const imageHeight = isList ? 142 : Math.round(cardWidth * 0.82);
  const price = Number(product.price ?? product.minPrice);
  const priceLabel = Number.isFinite(price) && price > 0
    ? formatPrice(price, product.currency ?? 'INR')
    : 'Price on request';
  const unitLabel = product.unit ? ` / ${product.unit}` : '';
  const leadTime = useMemo(() => formatLeadTime(product.leadTime ?? product.deliveryTime), [product.deliveryTime, product.leadTime]);

  const openProduct = () => {
    if (productId) navigation.navigate('ProductDetails', { productId });
  };

  return (
    <Animated.View
      style={[
        styles.card,
        variant === 'carousel' && [styles.carousel, { width: cardWidth }],
        variant === 'grid' && styles.grid,
        isList && styles.full,
        { transform: [{ scale }] },
      ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${product.name ?? product.title ?? 'product'}`}
        onPress={openProduct}
        onPressIn={() => Animated.spring(scale, { toValue: 0.985, speed: 30, bounciness: 0, useNativeDriver: true }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1, speed: 30, bounciness: 0, useNativeDriver: true }).start()}
        style={[styles.pressable, isList && styles.pressableList]}>
        <View style={[styles.imageWrap, isList ? styles.imageList : { height: imageHeight }]}>
          <RemoteImage
            uri={image}
            width={Math.round((isList ? 132 : cardWidth) * 2)}
            height={imageHeight * 2}
            resizeMode="cover"
            style={styles.image}
            fallback={<Icon name="package-variant-closed" size={30} color="#A4ABB5" />}
          />

          {validProductId ? (
            <SavedHeartButton
              type="product"
              itemId={productId}
              target={product}
              size={17}
              style={styles.heart}
              iconColor="#4B5563"
            />
          ) : null}

          {verified ? (
            <View style={styles.verifiedBadge}>
              <Icon name="check-decagram" size={12} color="#FFFFFF" />
              <Text style={styles.verifiedBadgeText}>Verified</Text>
            </View>
          ) : null}

          {validProductId ? (
            <Pressable
              accessibilityLabel="Find visually similar products"
              hitSlop={6}
              onPress={event => {
                event.stopPropagation();
                navigation.navigate('ProductSimilarSearch', { productId });
              }}
              style={styles.visualSearch}>
              <Icon name="image-search-outline" size={16} color={C.primary} />
            </Pressable>
          ) : null}
        </View>

        <View style={[styles.body, isList && styles.bodyList]}>
          <Text numberOfLines={2} style={[styles.title, isList && styles.titleList]}>
            {product.name ?? product.title ?? 'Marketplace product'}
          </Text>

          <View style={styles.priceRow}>
            <Text numberOfLines={1} style={styles.price}>{priceLabel}</Text>
            {priceLabel !== 'Price on request' && unitLabel ? <Text style={styles.unit}>{unitLabel}</Text> : null}
          </View>

          <View style={styles.ratingRow}>
            {rating > 0 ? (
              <>
                <Icon name="star" size={13} color={C.amber} />
                <Text style={styles.rating}>{rating.toFixed(1)}</Text>
                <Text style={styles.reviewCount}>({reviews})</Text>
              </>
            ) : (
              <Text style={styles.newLabel}>New listing</Text>
            )}
          </View>

          <View style={styles.tradeRow}>
            <Text numberOfLines={1} style={styles.tradeText}>{formatMoq(product)}</Text>
            {leadTime ? <Text numberOfLines={1} style={styles.tradeText}>{leadTime}</Text> : null}
          </View>

          <View style={styles.divider} />

          <View style={styles.sellerRow}>
            <Icon name="storefront-outline" size={14} color={C.muted} />
            <Text numberOfLines={1} style={styles.sellerName}>{sellerName}</Text>
            {verified ? <Icon name="check-decagram" size={14} color={C.blue} /> : null}
          </View>

          {location ? (
            <View style={styles.locationRow}>
              <Icon name="map-marker-outline" size={13} color={C.muted} />
              <Text numberOfLines={1} style={styles.location}>{location}</Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

function formatLeadTime(value: Product['leadTime'] | Product['deliveryTime']) {
  if (!value) return '';
  if (typeof value === 'string') return value.toLowerCase().includes('lead') ? value : `${value} lead time`;
  if (value.value == null) return '';
  return `${value.value} ${value.unit ?? 'days'} lead`;
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  carousel: { marginRight: 10 },
  grid: { flex: 1, minWidth: 0, marginHorizontal: 4, marginBottom: 10 },
  full: { width: '100%', marginBottom: 10 },
  pressable: { flex: 1 },
  pressableList: { flexDirection: 'row', minHeight: 174 },
  imageWrap: { position: 'relative', width: '100%', overflow: 'hidden', backgroundColor: C.image },
  imageList: { flex: 0, width: 132, height: 174 },
  image: { width: '100%', height: '100%' },
  heart: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 3,
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 15,
    elevation: 1,
  },
  visualSearch: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    zIndex: 3,
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 15,
  },
  verifiedBadge: {
    position: 'absolute',
    top: 9,
    left: 8,
    zIndex: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 4,
    backgroundColor: C.green,
    borderRadius: 6,
  },
  verifiedBadgeText: { color: '#FFFFFF', fontSize: 8, fontWeight: '800' },
  body: { padding: 10, paddingTop: 9 },
  bodyList: { flex: 1, justifyContent: 'center', padding: 13 },
  title: { minHeight: 34, color: C.ink, fontSize: 12.5, fontWeight: '700', lineHeight: 17 },
  titleList: { minHeight: 0, fontSize: 14, lineHeight: 19 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 7 },
  price: { flexShrink: 1, color: C.primary, fontSize: 15, fontWeight: '900', letterSpacing: -0.2 },
  unit: { color: C.muted, fontSize: 9, fontWeight: '600' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', minHeight: 19, marginTop: 3 },
  rating: { marginLeft: 3, color: C.text, fontSize: 10, fontWeight: '800' },
  reviewCount: { marginLeft: 2, color: C.muted, fontSize: 9 },
  newLabel: { color: C.green, fontSize: 9, fontWeight: '700' },
  tradeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  tradeText: {
    maxWidth: '100%',
    paddingHorizontal: 6,
    paddingVertical: 3,
    overflow: 'hidden',
    color: C.text,
    fontSize: 8.5,
    fontWeight: '600',
    backgroundColor: '#F3F5F8',
    borderRadius: 5,
  },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 8, backgroundColor: C.line },
  sellerRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sellerName: { flex: 1, color: C.text, fontSize: 9.5, fontWeight: '600' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 },
  location: { flex: 1, color: C.muted, fontSize: 8.5 },
});

export default React.memo(ProductCard);
