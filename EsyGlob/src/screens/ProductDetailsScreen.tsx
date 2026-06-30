import React from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery } from '@tanstack/react-query';
import { fetchProductDetails, fetchProducts } from '../api/products';
import { createProductEnquiry, startProductChat } from '../api/marketplace';
import { Product } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import ProductCard from '../components/ProductCard';
import RemoteImage from '../components/RemoteImage';
import { ErrorState, LoadingState } from '../components/StateViews';
import { colors, radii, spacing } from '../theme';
import {
  formatMoq,
  formatProductPrice,
  getId,
  getProductImage,
  getProductLocation,
  getSellerName,
  isVerifiedProduct,
} from '../utils/format';

type RouteParams = {
  productId: string;
};

function ProductDetailsScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { status } = useAuth();
  const { productId } = route.params as RouteParams;
  const [enquiryOpen, setEnquiryOpen] = React.useState(false);
  const [quantity, setQuantity] = React.useState('100');
  const [targetPrice, setTargetPrice] = React.useState('');
  const [destinationCountry, setDestinationCountry] = React.useState('India');
  const [additionalNotes, setAdditionalNotes] = React.useState('');
  const product = useQuery({
    queryKey: ['product', productId],
    queryFn: () => fetchProductDetails(productId),
    enabled: Boolean(productId),
  });
  const related = useQuery({
    queryKey: ['related-products', product.data?.category, product.data?.subcategory],
    queryFn: () => fetchProducts({
      category: product.data?.category,
      subcategory: product.data?.subcategory,
      limit: 8,
    }),
    enabled: Boolean(product.data?.category || product.data?.subcategory),
  });
  const item = product.data;
  const seller = item && typeof item.sellerId === 'object' ? item.sellerId : item && typeof item.seller === 'object' ? item.seller : undefined;
  const sellerRouteId = seller?._id ?? seller?.id;
  const sellerUser = typeof seller?.userId === 'object' ? seller.userId : undefined;
  const sellerUserId = typeof seller?.userId === 'string' ? seller.userId : sellerUser?._id ?? sellerUser?.id ?? (item as (Product & { sellerUserId?: string }) | undefined)?.sellerUserId;
  const chatNow = useMutation({
    mutationFn: () => {
      if (!item) {
        throw new Error('Product details were not returned by the backend.');
      }

      if (!sellerUserId) {
        throw new Error('Supplier user ID was not returned for this product.');
      }

      return startProductChat({
        otherUserId: sellerUserId,
        productId: getId(item),
        role: 'buyer',
        enquiry: false,
      });
    },
    onSuccess: result => {
      if (!item) {
        return;
      }

      if (!result.chat) {
        Alert.alert('Chat unavailable', 'Conversation was not returned by the backend.');
        return;
      }

      navigation.navigate('ChatDetails', { chatId: getId(result.chat), title: getSellerName(item) });
    },
    onError: error => Alert.alert('Chat unavailable', error instanceof Error ? error.message : 'Unable to open conversation.'),
  });
  const sendEnquiry = useMutation({
    mutationFn: () => {
      if (!item) {
        throw new Error('Product details were not returned by the backend.');
      }

      if (!sellerUserId) {
        throw new Error('Supplier user ID was not returned for this product.');
      }

      return createProductEnquiry({
        productId: getId(item),
        sellerUserId,
        productName: item.name ?? item.title,
        quantity: Number(quantity) || Number(item.minimumOrderQuantity ?? item.moq ?? 1),
        unit: item.unit ?? 'pcs',
        targetPrice: targetPrice ? Number(targetPrice) : undefined,
        destinationCountry,
        additionalNotes,
        attachments: [],
      });
    },
    onSuccess: result => {
      if (!item) {
        return;
      }

      if (!result.chat) {
        Alert.alert('Enquiry created', 'RFQ was created but the backend did not return a conversation.');
        return;
      }

      setEnquiryOpen(false);
      navigation.navigate('ChatDetails', { chatId: getId(result.chat), title: getSellerName(item) });
    },
    onError: error => Alert.alert('Enquiry failed', error instanceof Error ? error.message : 'Unable to send enquiry.'),
  });

  if (product.isLoading) {
    return <LoadingState label="Loading product" />;
  }

  if (product.isError || !item) {
    return <ErrorState message={(product.error as Error)?.message ?? 'Product was not returned.'} onRetry={() => product.refetch()} />;
  }

  const image = getProductImage(item);
  const sellerVerified = isVerifiedProduct(item);
  const location = getProductLocation(item);
  const categoryName = typeof item.categoryId === 'object' ? item.categoryId.name : item.category;
  const gallery = Array.from(new Set([image, ...(item.images ?? [])].filter(Boolean))) as string[];
  const directOrderEnabled = Boolean((item.directOrderEnabled || item.orderEnabled) && (seller?.trustedSeller || seller?.isTrusted || seller?.trustedBadgeActive || sellerVerified));
  const specifications = [
    ['Product type', item.productType],
    ['Sample price', item.samplePrice],
    ['Order type', item.orderType],
    ['Payment terms', formatValue(item.paymentTerms)],
    ['Trade terms', formatValue(item.tradeTerms)],
    ['Lead time', item.leadTime],
    ['Delivery', item.deliveryTime],
    ['Warranty', item.warrantyPeriod ?? (typeof item.warranty === 'boolean' ? (item.warranty ? 'Available' : undefined) : item.warranty)],
  ].filter(([, value]) => Boolean(value)) as string[][];
  const relatedProducts = (related.data?.products ?? []).filter(next => getId(next) !== getId(item)).slice(0, 6);

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.iconButton}>
          <Icon name="arrow-left" size={24} color={colors.ink} />
        </Pressable>
        <Text numberOfLines={1} style={styles.headerTitle}>Product details</Text>
        <Pressable hitSlop={10} style={styles.iconButton}>
          <Icon name="heart-outline" size={22} color={colors.ink} />
        </Pressable>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <RemoteImage
          uri={gallery[0]}
          width={900}
          height={620}
          style={styles.image}
          fallback={
            <Icon name="package-variant-closed" size={54} color={colors.muted} />
          }
        />

        <View style={styles.body}>
          <Text style={styles.title}>{item.name ?? item.title ?? 'Product'}</Text>
          <Text style={styles.price}>{formatProductPrice(item)}</Text>
          <Text style={styles.moq}>{formatMoq(item)}</Text>

          {gallery.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.gallery}>
              {gallery.map(uri => (
                <RemoteImage key={uri} uri={uri} width={180} height={180} style={styles.galleryImage} />
              ))}
            </ScrollView>
          ) : null}

          <Pressable
            disabled={!sellerRouteId}
            onPress={() => navigation.navigate('SellerDetails', { sellerId: sellerRouteId, sellerName: getSellerName(item) })}
            style={styles.sellerPanel}>
            <View style={styles.sellerIcon}>
              <Icon name={sellerVerified ? 'check-decagram' : 'store-outline'} size={24} color={sellerVerified ? colors.green : colors.primary} />
            </View>
            <View style={styles.sellerBody}>
              <Text numberOfLines={1} style={styles.sellerName}>{getSellerName(item)}</Text>
              <Text style={styles.sellerMeta}>
                {sellerVerified ? 'Verified supplier' : 'Supplier'}{location ? ` from ${location}` : ''}
              </Text>
            </View>
            {sellerRouteId ? <Icon name="chevron-right" size={22} color={colors.muted} /> : null}
          </Pressable>

          <View style={styles.factGrid}>
            {categoryName ? <Fact label="Category" value={categoryName} /> : null}
            {item.subcategory ? <Fact label="Subcategory" value={item.subcategory} /> : null}
            {item.unit ? <Fact label="Unit" value={item.unit} /> : null}
            {item.averageRating ? <Fact label="Rating" value={`${Number(item.averageRating).toFixed(1)} / 5`} /> : null}
            {item.totalOrders ? <Fact label="Orders" value={String(item.totalOrders)} /> : null}
            {item.responseRate ? <Fact label="Response" value={String(item.responseRate)} /> : null}
          </View>

          {specifications.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Specifications</Text>
              <View style={styles.specGrid}>
                {specifications.map(([label, value]) => (
                  <Fact key={label} label={label} value={String(value)} />
                ))}
              </View>
            </View>
          ) : null}

          {item.priceTiers?.length ? (
            <InfoSection title="Price tiers">
              {item.priceTiers.map((tier, index) => (
                <View key={`${tier.minQuantity}-${index}`} style={styles.tierRow}>
                  <Text style={styles.tierQty}>
                    {tier.minQuantity}
                    {tier.maxQuantity ? ` - ${tier.maxQuantity}` : '+'} {tier.unit ?? item.unit ?? 'units'}
                  </Text>
                  <Text style={styles.tierPrice}>{formatTierPrice(tier.price, item.currency)}</Text>
                </View>
              ))}
            </InfoSection>
          ) : null}

          <DataSection title="Certifications" value={item.certifications} />
          <DataSection title="Packaging" value={item.packaging} />
          <DataSection title="Shipping" value={item.shipping} />
          <DataSection title="Factory details" value={item.manufacturingDetails ?? item.factoryDetails} />

          {item.variants?.length ? (
            <InfoSection title="Variants">
              {item.variants.slice(0, 6).map((variant, index) => (
                <Text key={index} style={styles.description}>{formatObject(variant)}</Text>
              ))}
            </InfoSection>
          ) : null}

          {item.description ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Description</Text>
              <Text style={styles.description}>{item.description}</Text>
            </View>
          ) : null}

          {relatedProducts.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Related products</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.relatedList}>
                {relatedProducts.map(next => (
                  <ProductCard key={getId(next)} product={next} />
                ))}
              </ScrollView>
            </View>
          ) : null}
        </View>
      </ScrollView>
      <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
        <Pressable disabled={!sellerRouteId} onPress={() => navigation.navigate('SellerDetails', { sellerId: sellerRouteId, sellerName: getSellerName(item) })} style={styles.storeAction}>
          <Icon name="storefront-outline" size={20} color={colors.ink} />
          <Text style={styles.storeActionText}>Store</Text>
        </Pressable>
        <Pressable disabled={status !== 'authenticated' || !sellerUserId || chatNow.isPending} onPress={() => chatNow.mutate()} style={[styles.secondaryAction, (status !== 'authenticated' || !sellerUserId || chatNow.isPending) && styles.disabledAction]}>
          <Icon name="message-text-outline" size={18} color={colors.primaryDark} />
          <Text style={styles.secondaryActionText}>Chat Now</Text>
        </Pressable>
        <Pressable disabled={status !== 'authenticated' || !sellerUserId} onPress={() => setEnquiryOpen(true)} style={[styles.primaryAction, (status !== 'authenticated' || !sellerUserId) && styles.disabledAction]}>
          <Icon name="send-outline" size={18} color="#fff" />
          <Text style={styles.primaryActionText}>Send Enquiry</Text>
        </Pressable>
      </View>
      <View pointerEvents="box-none" style={styles.floatingOrderActions}>
        {item.sampleAvailable ? (
          <Pressable onPress={() => navigation.navigate('OrderCheckout', { mode: 'sample', productId: getId(item) })} style={styles.floatingButton}>
            <Icon name="flask-outline" size={17} color={colors.ink} />
            <Text style={styles.floatingButtonText}>Sample Order</Text>
          </Pressable>
        ) : null}
        {directOrderEnabled ? (
          <Pressable onPress={() => navigation.navigate('OrderCheckout', { mode: 'trade', productId: getId(item) })} style={styles.floatingButton}>
            <Icon name="cart-arrow-right" size={17} color={colors.ink} />
            <Text style={styles.floatingButtonText}>Start Order</Text>
          </Pressable>
        ) : null}
      </View>
      <Modal animationType="slide" transparent visible={enquiryOpen} onRequestClose={() => setEnquiryOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.enquirySheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Send enquiry</Text>
              <Pressable onPress={() => setEnquiryOpen(false)} style={styles.iconButton}>
                <Icon name="close" size={22} color={colors.ink} />
              </Pressable>
            </View>
            <Text style={styles.modalMeta}>{item.name ?? item.title}</Text>
            <Field label="Quantity" value={quantity} onChangeText={setQuantity} keyboardType="numeric" />
            <Field label="Target price" value={targetPrice} onChangeText={setTargetPrice} keyboardType="numeric" />
            <Field label="Destination country" value={destinationCountry} onChangeText={setDestinationCountry} />
            <Field label="Additional notes" value={additionalNotes} onChangeText={setAdditionalNotes} multiline />
            <Pressable disabled={sendEnquiry.isPending || !destinationCountry.trim()} onPress={() => sendEnquiry.mutate()} style={[styles.submitEnquiry, (sendEnquiry.isPending || !destinationCountry.trim()) && styles.disabledAction]}>
              <Text style={styles.primaryActionText}>{sendEnquiry.isPending ? 'Creating RFQ...' : 'Create RFQ and open chat'}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.modalField}>
      <Text style={styles.modalLabel}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} style={styles.modalInput} {...props} />
    </View>
  );
}

function InfoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.infoBox}>{children}</View>
    </View>
  );
}

function DataSection({ title, value }: { title: string; value?: Product[keyof Product] }) {
  const formatted = formatValue(value);

  if (!formatted) {
    return null;
  }

  return (
    <InfoSection title={title}>
      <Text style={styles.description}>{formatted}</Text>
    </InfoSection>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text numberOfLines={2} style={styles.factValue}>{value}</Text>
    </View>
  );
}

function formatValue(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map(item => formatValue(item)).filter(Boolean).join(', ');
  }

  if (typeof value === 'object') {
    return formatObject(value as Record<string, unknown>);
  }

  return String(value);
}

function formatObject(value: Record<string, unknown>) {
  return Object.entries(value)
    .filter(([, item]) => item !== undefined && item !== null && item !== '')
    .map(([key, item]) => `${humanize(key)}: ${formatValue(item)}`)
    .join('\n');
}

function humanize(value: string) {
  return value.replace(/([A-Z])/g, ' $1').replace(/[_-]+/g, ' ').replace(/^./, char => char.toUpperCase());
}

function formatTierPrice(price: unknown, currency?: string) {
  if (price === undefined || price === null || price === '') {
    return 'Contact supplier';
  }

  return `${currency ?? '$'}${price}`;
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
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: radii.pill,
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
    paddingBottom: 190,
  },
  image: {
    backgroundColor: colors.cardMuted,
    height: 320,
    width: '100%',
  },
  body: {
    padding: spacing.lg,
  },
  title: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 31,
  },
  price: {
    color: colors.primaryDark,
    fontSize: 25,
    fontWeight: '900',
    marginTop: spacing.md,
  },
  moq: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  gallery: {
    marginTop: spacing.lg,
  },
  galleryImage: {
    backgroundColor: colors.cardMuted,
    borderRadius: radii.md,
    height: 78,
    marginRight: spacing.sm,
    width: 78,
  },
  sellerPanel: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    flexDirection: 'row',
    marginTop: spacing.lg,
    padding: spacing.md,
  },
  sellerIcon: {
    alignItems: 'center',
    backgroundColor: '#fff8f3',
    borderRadius: radii.pill,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  sellerBody: {
    flex: 1,
    marginLeft: spacing.md,
  },
  sellerName: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  sellerMeta: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  factGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  specGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  fact: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    minHeight: 74,
    padding: spacing.md,
    width: '48%',
  },
  factLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  factValue: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '900',
    marginTop: spacing.xs,
  },
  section: {
    marginTop: spacing.xl,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '900',
  },
  description: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 22,
    marginTop: spacing.sm,
  },
  infoBox: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    marginTop: spacing.sm,
    padding: spacing.md,
  },
  tierRow: {
    alignItems: 'center',
    borderBottomColor: colors.faint,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  tierQty: {
    color: colors.text,
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
  },
  tierPrice: {
    color: colors.primaryDark,
    fontSize: 14,
    fontWeight: '900',
  },
  relatedList: {
    marginTop: spacing.md,
  },
  actionBar: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderTopColor: colors.faint,
    borderTopWidth: StyleSheet.hairlineWidth,
    bottom: 0,
    flexDirection: 'row',
    gap: spacing.sm,
    left: 0,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    position: 'absolute',
    right: 0,
  },
  storeAction: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    width: 56,
  },
  storeActionText: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: '900',
    marginTop: 2,
  },
  secondaryAction: {
    alignItems: 'center',
    backgroundColor: '#fff8f3',
    borderRadius: radii.pill,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 48,
  },
  secondaryActionText: {
    color: colors.primaryDark,
    fontWeight: '900',
  },
  primaryAction: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 48,
  },
  primaryActionText: {
    color: '#fff',
    fontWeight: '900',
  },
  disabledAction: {
    opacity: 0.45,
  },
  floatingOrderActions: {
    bottom: 82,
    flexDirection: 'row',
    gap: spacing.sm,
    left: spacing.md,
    position: 'absolute',
    right: spacing.md,
  },
  floatingButton: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.faint,
    borderRadius: radii.pill,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 42,
  },
  floatingButtonText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '900',
  },
  modalBackdrop: {
    backgroundColor: 'rgba(15, 23, 42, 0.38)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  enquirySheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    padding: spacing.lg,
  },
  modalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  modalTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: 21,
    fontWeight: '900',
  },
  modalMeta: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: spacing.md,
    marginTop: spacing.xs,
  },
  modalField: {
    marginBottom: spacing.md,
  },
  modalLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '900',
    marginBottom: spacing.xs,
  },
  modalInput: {
    backgroundColor: colors.cardMuted,
    borderRadius: radii.md,
    color: colors.ink,
    fontSize: 14,
    fontWeight: '800',
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  submitEnquiry: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    justifyContent: 'center',
    minHeight: 48,
  },
});

export default React.memo(ProductDetailsScreen);
