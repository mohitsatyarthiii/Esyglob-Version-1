import React, { useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { Product } from '../api/types';
import { spacing } from '../theme';
import { useCurrency } from '../currency/CurrencyContext';
import RemoteImage from './RemoteImage';
import SavedHeartButton from './SavedHeartButton';
import {
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = 172;
const GRID_WIDTH = (SCREEN_WIDTH - 40) / 2;
const IMAGE_HEIGHT = 140;

const badges = [
  { icon: 'rocket-launch-outline', text: 'Ready to dispatch', color: '#10B981' },
  { icon: 'trending-up', text: 'Most trending', color: '#F59E0B' },
  { icon: 'fire', text: 'Hot selling now', color: '#EF4444' },
  { icon: 'star-outline', text: 'Top rated', color: '#8B5CF6' },
  { icon: 'truck-fast-outline', text: 'Fast delivery', color: '#3B82F6' },
  { icon: 'shield-check-outline', text: 'Quality assured', color: '#6366F1' },
  { icon: 'certificate-outline', text: 'Certified', color: '#14B8A6' },
  { icon: 'flash-outline', text: 'Quick seller', color: '#F97316' },
  { icon: 'thumb-up-outline', text: 'Customer favorite', color: '#EC4899' },
  { icon: 'leaf-outline', text: 'Eco friendly', color: '#22C55E' },
  { icon: 'clock-fast', text: 'Limited stock', color: '#DC2626' },
  { icon: 'medal-outline', text: 'Premium quality', color: '#D97706' },
  { icon: 'sale', text: 'Best price', color: '#0891B2' },
  { icon: 'package-variant-closed', text: 'New arrival', color: '#7C3AED' },
  { icon: 'hand-coin-outline', text: 'Wholesale deal', color: '#059669' },
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
  const { formatPrice } = useCurrency();
  const navigation = useNavigation<any>();
  const location = getProductLocation(product);
  const verified = isVerifiedProduct(product);
  const rating = product.averageRating ? Number(product.averageRating).toFixed(1) : null;
  const badge = useMemo(() => getProductBadge(product), [product]);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const [activeSlide, setActiveSlide] = useState(0);

  const primaryImage = getProductImage(product);
  const gallery = useMemo(
    () => Array.from(new Set([primaryImage, ...(product.images ?? [])].filter(Boolean))) as string[],
    [product, primaryImage],
  );

  const productId = getId(product);
  const isValidId = productId && /^[a-f\d]{24}$/i.test(productId);

  const cardWidth = variant === 'grid' ? GRID_WIDTH : CARD_WIDTH;

  const openProduct = () => {
    if (productId) {
      navigation.navigate('ProductDetails', { productId });
    }
  };

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setActiveSlide(viewableItems[0].index);
    }
  }).current;

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
        
        {/* Image Gallery Slider */}
        <View style={[styles.imageWrap, { height: IMAGE_HEIGHT }]}>
          <FlatList
            data={gallery}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
            keyExtractor={(_, i) => i.toString()}
            renderItem={({ item: uri }) => (
              <View style={[styles.imageSlide, { width: cardWidth }]}>
                <RemoteImage
                  uri={uri}
                  width={cardWidth * 2}
                  height={IMAGE_HEIGHT * 2}
                  resizeMode="cover"
                  style={[styles.image, { width: cardWidth, height: IMAGE_HEIGHT }]}
                  fallback={
                    <View style={[styles.imageFallback, { width: cardWidth, height: IMAGE_HEIGHT }]}>
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
                <View key={i} style={[styles.dot, i === activeSlide && styles.dotActive]} />
              ))}
            </View>
          )}

          {/* Overlay buttons */}
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
          <Pressable
            accessibilityLabel="Search using a product image"
            onPress={event => { event.stopPropagation(); navigation.navigate('ProductSimilarSearch', { productId }); }}
            style={styles.imageSearchBtn}>
            <Icon name="qrcode-scan" size={15} color={PALETTE.primary} />
          </Pressable>

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
              {activeSlide + 1}/{gallery.length}
            </Text>
          )}
        </View>

        {/* Random badge strip */}
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

          <Text style={styles.price}>
            {formatPrice(Number(product.price ?? product.minPrice ?? 0), product.currency ?? 'INR')}
          </Text>

          <Text style={styles.moq} numberOfLines={1}>
            MOQ: 100
          </Text>
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
    overflow: 'hidden',
  },
  image: {
    backgroundColor: PALETTE.cardMuted,
  },
  imageFallback: {
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
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  dotActive: {
    backgroundColor: PALETTE.primary,
    width: 14,
    borderRadius: 3,
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
    zIndex: 2,
  },
  imageSearchBtn: {
    position: 'absolute',
    top: 38,
    right: 6,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 14,
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
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
    zIndex: 2,
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
    backgroundColor: 'rgba(0,0,0,0.55)',
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