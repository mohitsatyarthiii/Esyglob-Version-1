import React, { useMemo, useRef } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { Product } from '../api/types';
import { spacing } from '../theme';
import RemoteImage from './RemoteImage';
import SavedHeartButton from './SavedHeartButton';
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

const CARD_WIDTH = 172;
const IMAGE_HEIGHT = 130;

const badges = [
  { icon: 'rocket-launch-outline', text: 'Ready to dispatch', color: '#10B981' },
  { icon: 'trending-up', text: 'Most trending product', color: '#F59E0B' },
  { icon: 'fire', text: 'Hot selling', color: '#EF4444' },
  { icon: 'star-outline', text: 'Top rated', color: '#8B5CF6' },
  { icon: 'truck-fast-outline', text: 'Fast delivery', color: '#3B82F6' },
  { icon: 'shield-check-outline', text: 'Quality assured', color: '#6366F1' },
  { icon: 'certificate-outline', text: 'Certified product', color: '#14B8A6' },
  { icon: 'flash-outline', text: 'Quick seller', color: '#F97316' },
  { icon: 'thumb-up-outline', text: 'Customer favourite', color: '#EC4899' },
  { icon: 'leaf-outline', text: 'Eco friendly', color: '#22C55E' },
  { icon: 'clock-fast', text: 'Limited stock', color: '#DC2626' },
  { icon: 'medal-outline', text: 'Premium quality', color: '#D97706' },
];

const PALETTE = {
  primary: '#FF6A00',
  primaryLight: '#FFF3E8',
  primaryDark: '#E05500',
  emerald: '#00B578',
  amber: '#FF9500',
  violet: '#7B61FF',
  rose: '#FF3B6E',
  sky: '#3B9CFF',
  ink: '#1A1A1A',
  text: '#333333',
  muted: '#8C8C8C',
  faint: '#E8E8E8',
  surface: '#FFFFFF',
  cardMuted: '#F8F9FB',
} as const;

function getProductBadge(product: Product) {
  const hash = (getId(product) || '0')
    .split('')
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return badges[hash % badges.length];
}

function ProductCard({ product, variant = 'carousel' }: Props) {
  const navigation = useNavigation<any>();
  const location = getProductLocation(product);
  const verified = isVerifiedProduct(product);
  const rating = product.averageRating ? Number(product.averageRating).toFixed(1) : null;
  const badge = useMemo(() => getProductBadge(product), [product]);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const [currentImage, setCurrentImage] = React.useState(0);

  const primaryImage = getProductImage(product);
  const gallery = React.useMemo(
    () => Array.from(new Set([primaryImage, ...(product.images ?? [])].filter(Boolean))) as string[],
    [product, primaryImage],
  );

  const productId = getId(product);
  
  // Validate productId
  const isValidId = productId && /^[a-f\d]{24}$/i.test(productId);

  const openProduct = () => {
    if (productId) {
      navigation.navigate('ProductDetails', { productId });
    }
  };

  const onImageSwipe = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / CARD_WIDTH);
    if (index !== currentImage) setCurrentImage(index);
  };

  return (
    <Animated.View
      style={[
        styles.card,
        variant === 'carousel' && styles.carousel,
        variant === 'grid' && styles.grid,
        variant === 'full' && styles.full,
        { transform: [{ scale: scaleAnim }] },
      ]}>
      <Pressable
        onPress={openProduct}
        onPressIn={() => {
          Animated.spring(scaleAnim, { toValue: 0.97, tension: 200, friction: 10, useNativeDriver: true }).start();
        }}
        onPressOut={() => {
          Animated.spring(scaleAnim, { toValue: 1, tension: 200, friction: 10, useNativeDriver: true }).start();
        }}>
        {/* Swipeable Image Gallery */}
        <View style={styles.imageWrap}>
          <FlatList
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            data={gallery}
            keyExtractor={(uri, i) => `${uri}-${i}`}
            onMomentumScrollEnd={onImageSwipe}
            getItemLayout={(_, index) => ({
              length: variant === 'carousel' ? CARD_WIDTH : Dimensions.get('window').width,
              offset: (variant === 'carousel' ? CARD_WIDTH : Dimensions.get('window').width) * index,
              index,
            })}
            renderItem={({ item: uri }) => (
              <View style={[styles.imageSlide, variant === 'carousel' ? styles.imageSlideCarousel : styles.imageSlideFull]}>
                <RemoteImage
                  uri={uri}
                  width={420}
                  height={300}
                  style={styles.image}
                  fallback={
                    <View style={styles.imageFallback}>
                      <Icon name="package-variant-closed" size={28} color={PALETTE.muted} />
                    </View>
                  }
                />
              </View>
            )}
          />

          {/* Dot indicators */}
          {gallery.length > 1 && (
            <View style={styles.dotRow}>
              {gallery.map((_, i) => (
                <View
                  key={i}
                  style={[styles.dot, currentImage === i && styles.dotActive]}
                />
              ))}
            </View>
          )}

          {/* Save button - only render if valid ID */}
          {isValidId && (
            <SavedHeartButton
              type="product"
              itemId={productId}
              target={product}
              size={15}
              style={styles.heartBtn}
              iconColor={PALETTE.muted}
            />
          )}

          {/* Verified badge */}
          {verified && (
            <View style={styles.verifiedBadge}>
              <Icon name="check-decagram" size={9} color="#fff" />
              <Text style={styles.verifiedBadgeText}>Verified</Text>
            </View>
          )}

          {/* Image counter */}
          {gallery.length > 1 && (
            <Text style={styles.imageCounter}>
              {currentImage + 1}/{gallery.length}
            </Text>
          )}
        </View>

        {/* Product badge */}
        <View style={[styles.badgeStrip, { backgroundColor: `${badge.color}12` }]}>
          <Icon name={badge.icon} size={9} color={badge.color} />
          <Text style={[styles.badgeStripText, { color: badge.color }]} numberOfLines={1}>
            {badge.text}
          </Text>
        </View>

        {/* Body */}
        <View style={styles.body}>
          <Text numberOfLines={2} style={styles.title}>
            {product.name ?? product.title}
          </Text>

          <Text style={styles.price}>{formatProductPrice(product)}</Text>

          <Text style={styles.moq} numberOfLines={1}>
            {formatMoq(product)}
          </Text>

          <View style={styles.sellerRow}>
            <Icon
              name={verified ? 'check-decagram' : 'store-outline'}
              size={10}
              color={verified ? PALETTE.emerald : PALETTE.muted}
            />
            <Text numberOfLines={1} style={styles.sellerName}>
              {getSellerName(product)}
            </Text>
          </View>

          <View style={styles.statsRow}>
            {rating && (
              <View style={styles.statPill}>
                <Icon name="star" size={8} color={PALETTE.amber} />
                <Text style={styles.statText}>{rating}</Text>
              </View>
            )}
            {location && (
              <View style={styles.statPill}>
                <Icon name="map-marker-outline" size={8} color={PALETTE.rose} />
                <Text style={styles.statText} numberOfLines={1}>{location}</Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: PALETTE.surface,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  carousel: {
    width: CARD_WIDTH,
    marginRight: spacing.sm,
  },
  grid: {
    flex: 1,
    marginBottom: spacing.sm,
    marginHorizontal: spacing.xs,
    minWidth: 0,
  },
  full: {
    marginBottom: spacing.sm,
    marginRight: 0,
    width: '100%',
  },

  // Image
  imageWrap: {
    position: 'relative',
    backgroundColor: PALETTE.cardMuted,
  },
  imageSlide: {
    height: IMAGE_HEIGHT,
  },
  imageSlideCarousel: { width: CARD_WIDTH },
  imageSlideFull: { width: '100%' },
  image: {
    width: '100%',
    height: IMAGE_HEIGHT,
    backgroundColor: PALETTE.cardMuted,
  },
  imageFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PALETTE.cardMuted,
  },

  // Dot indicators
  dotRow: {
    position: 'absolute',
    bottom: 6,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  dotActive: {
    backgroundColor: PALETTE.primary,
    width: 12,
    borderRadius: 2,
  },

  // Heart
  heartBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 14,
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Verified
  verifiedBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(0,181,120,0.92)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  verifiedBadgeText: {
    color: '#fff',
    fontSize: 7,
    fontWeight: '800',
  },

  // Image counter
  imageCounter: {
    position: 'absolute',
    bottom: 22,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
    color: '#fff',
    fontSize: 8,
    fontWeight: '700',
    paddingHorizontal: 5,
    paddingVertical: 1,
    overflow: 'hidden',
  },

  // Badge strip
  badgeStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeStripText: {
    fontSize: 8,
    fontWeight: '700',
    flex: 1,
  },

  // Body
  body: {
    padding: 8,
    paddingTop: 6,
  },
  title: {
    fontSize: 10.5,
    fontWeight: '700',
    color: PALETTE.ink,
    lineHeight: 14,
    minHeight: 28,
    letterSpacing: -0.1,
  },
  price: {
    fontSize: 13,
    fontWeight: '800',
    color: PALETTE.primaryDark,
    marginTop: 4,
    letterSpacing: -0.2,
  },
  moq: {
    fontSize: 8.5,
    fontWeight: '600',
    color: PALETTE.muted,
    marginTop: 2,
  },
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 5,
  },
  sellerName: {
    fontSize: 8.5,
    fontWeight: '600',
    color: PALETTE.text,
    flex: 1,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 5,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: PALETTE.cardMuted,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  statText: {
    fontSize: 7.5,
    fontWeight: '700',
    color: PALETTE.text,
    maxWidth: 60,
  },
});

export default React.memo(ProductCard);
