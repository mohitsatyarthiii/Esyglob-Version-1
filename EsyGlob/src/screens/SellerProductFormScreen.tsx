import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { fetchCategories } from '../api/categories';
import { createSellerProduct, fetchSellerProductDetails, updateSellerProduct, uploadFiles } from '../api/marketplace';
import RemoteImage from '../components/RemoteImage';
import { ErrorState, LoadingState } from '../components/StateViews';
import { colors, radii, spacing } from '../theme';
import { getId } from '../utils/format';
import { firstImage } from '../utils/images';
import { Header, Card, Field, Chip } from '../components/SellerFormPrimitives';

const PRODUCT_UNITS = ['piece', 'kg', 'gram', 'metric_ton', 'litre', 'millilitre', 'meter', 'centimeter', 'roll', 'pack', 'box', 'bottle', 'carton', 'bag', 'set'];
const PAYMENT_TERMS = ['prepayment', 'partial_prepayment', 'bank_transfer', 'credit', 'negotiable'];
type PriceTier = { minimumQuantity: string; maximumQuantity: string; unitPrice: string };

function SearchDropdown({ label, value, options, onChange, disabled }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false); const [search, setSearch] = useState('');
  const filtered = useMemo(() => options.filter(option => option.label.toLowerCase().includes(search.trim().toLowerCase())), [options, search]);
  const selected = options.find(option => option.value === value);
  return <View><Text style={styles.label}>{label}</Text><Pressable disabled={disabled} onPress={() => setOpen(true)} style={[styles.dropdown, disabled && styles.disabled]}><Text style={[styles.dropdownValue, !selected && styles.dropdownPlaceholder]}>{selected?.label ?? `Select ${label.toLowerCase()}`}</Text><Icon name="chevron-down" size={20} color={colors.muted} /></Pressable><Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}><Pressable style={styles.dropdownBackdrop} onPress={() => setOpen(false)}><Pressable style={styles.dropdownSheet} onPress={() => undefined}><Text style={styles.dropdownTitle}>Select {label}</Text><View style={styles.dropdownSearch}><Icon name="magnify" size={19} color={colors.muted} /><TextInput autoFocus value={search} onChangeText={setSearch} placeholder={`Search ${label.toLowerCase()}`} placeholderTextColor={colors.muted} style={styles.dropdownSearchInput} /></View><FlatList data={filtered} keyExtractor={item => item.value} ListEmptyComponent={<Text style={styles.dropdownEmpty}>No matching options</Text>} renderItem={({ item }) => <Pressable onPress={() => { onChange(item.value); setOpen(false); setSearch(''); }} style={styles.dropdownOption}><Text style={[styles.dropdownOptionText, item.value === value && styles.dropdownOptionActive]}>{item.label}</Text>{item.value === value ? <Icon name="check" size={19} color={colors.primary} /> : null}</Pressable>} /></Pressable></Pressable></Modal></View>;
}

function SellerProductFormScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const productId = route.params?.productId as string | undefined;
  const editing = Boolean(productId);
  const categories = useQuery({ queryKey: ['categories'], queryFn: fetchCategories });
  const product = useQuery({ queryKey: ['seller-product-edit', productId], queryFn: () => fetchSellerProductDetails(productId as string), enabled: editing });
  const [form, setForm] = useState({
    name: '',
    categoryId: '',
    subcategoryId: '',
    productType: 'Finished Product',
    description: '',
    price: '',
    minimumOrderQuantity: '1',
    unit: 'piece',
    orderType: 'inquiry_only',
    directOrderEnabled: false,
    sampleAvailable: false,
    samplePrice: '',
    paymentTerms: 'prepayment',
    leadTime: '',
    leadTimeUnit: 'days',
    deliveryTime: '',
    deliveryTimeUnit: 'days',
    warrantyPeriod: '',
    warranty: '',
    shippingAvailable: true,
    originPort: '',
    shippingMethods: '',
    shippingEstimate: '',
    specifications: '',
    processType: '',
    capacity: '',
    automationLevel: '',
    packagingType: '',
    packagingWeight: '',
    packagingDimensions: '',
    certifications: '',
    tags: '',
    status: 'draft',
    images: [] as string[],
    priceTiers: [] as PriceTier[],
  });
  const selectedCategory = categories.data?.find(item => getId(item) === form.categoryId);
  const subcategories = selectedCategory?.subcategories ?? [];
  const save = useMutation({
    mutationFn: (status: string) => {
      const body = buildPayload(form, categories.data ?? [], status);
      return editing ? updateSellerProduct(productId as string, body) : createSellerProduct(body);
    },
    onSuccess: result => {
      queryClient.invalidateQueries({ queryKey: ['seller-products'] });
      Alert.alert('Product saved', result.visibilityNotice ?? 'Product was saved.');
      navigation.goBack();
    },
    onError: error => Alert.alert('Save failed', error instanceof Error ? error.message : 'Unable to save product.'),
  });

  useEffect(() => {
    if (!product.data) return;
    const item = product.data as any;
    setForm(value => ({
      ...value,
      name: item.name ?? '',
      categoryId: typeof item.categoryId === 'object' ? getId(item.categoryId) : item.categoryId ?? '',
      subcategoryId: item.subcategoryId ?? '',
      productType: item.productType ?? 'Finished Product',
      description: item.description ?? '',
      price: String(item.price ?? ''),
      minimumOrderQuantity: String(item.minimumOrderQuantity ?? item.moq ?? 1),
      unit: item.unit ?? 'piece',
      orderType: item.orderType ?? 'inquiry_only',
      directOrderEnabled: Boolean(item.directOrderEnabled),
      sampleAvailable: Boolean(item.sampleAvailable),
      samplePrice: String(item.samplePrice ?? ''),
      paymentTerms: Array.isArray(item.paymentTerms) ? item.paymentTerms.join(', ') : item.paymentTerms ?? 'prepayment',
      leadTime: String(item.leadTime?.value ?? item.leadTime ?? ''),
      leadTimeUnit: item.leadTime?.unit ?? item.leadTimeUnit ?? 'days',
      deliveryTime: String(item.deliveryTime?.value ?? item.deliveryTime ?? ''),
      deliveryTimeUnit: item.deliveryTime?.unit ?? item.deliveryTimeUnit ?? 'days',
      warrantyPeriod: item.warrantyPeriod ?? '',
      warranty: typeof item.warranty === 'string' ? item.warranty : '',
      shippingAvailable: item.shipping?.available !== false,
      originPort: item.shipping?.originPort ?? '',
      shippingMethods: Array.isArray(item.shipping?.methods) ? item.shipping.methods.join(', ') : '',
      shippingEstimate: item.shipping?.estimateText ?? '',
      specifications: specsToText(item.specifications),
      processType: item.manufacturingDetails?.processType ?? '',
      capacity: item.manufacturingDetails?.capacity ?? '',
      automationLevel: item.manufacturingDetails?.automationLevel ?? '',
      packagingType: item.packaging?.type ?? '',
      packagingWeight: item.packaging?.weight ?? '',
      packagingDimensions: item.packaging?.dimensions ?? '',
      certifications: Array.isArray(item.certifications) ? item.certifications.map((cert: any) => cert.name ?? cert).join(', ') : '',
      tags: Array.isArray(item.tags) ? item.tags.join(', ') : '',
      status: item.status ?? 'draft',
      images: item.images ?? [],
      priceTiers: Array.isArray(item.priceTiers) ? item.priceTiers.map((tier: any) => ({
        minimumQuantity: String(tier.minimumQuantity ?? ''),
        maximumQuantity: String(tier.maximumQuantity ?? ''),
        unitPrice: String(tier.unitPrice ?? ''),
      })) : [],
    }));
  }, [product.data]);

  const addImages = async () => {
    try {
      const response = await launchImageLibrary({ mediaType: 'photo', quality: 0.8, selectionLimit: Math.max(1, 8 - form.images.length) });
      const files = (response.assets ?? []).filter(asset => asset.uri).map(asset => ({ uri: asset.uri as string, name: asset.fileName ?? `product-${Date.now()}.jpg`, type: asset.type ?? 'image/jpeg' }));
      if (!files.length) return;
      const uploaded = await uploadFiles('products', files);
      setForm({ ...form, images: [...form.images, ...((uploaded.uploads ?? []).map(item => item.url).filter(Boolean) as string[])] });
    } catch (error) {
      Alert.alert('Upload failed', error instanceof Error ? error.message : 'Unable to upload product images.');
    }
  };

  const updateTier = (index: number, key: keyof PriceTier, value: string) => {
    setForm(current => ({ ...current, priceTiers: current.priceTiers.map((tier, tierIndex) => tierIndex === index ? { ...tier, [key]: value } : tier) }));
  };
  const moveTier = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= form.priceTiers.length) return;
    const priceTiers = [...form.priceTiers];
    [priceTiers[index], priceTiers[target]] = [priceTiers[target], priceTiers[index]];
    setForm({ ...form, priceTiers });
  };
  const tierError = validatePriceTiers(form.priceTiers);

  if (categories.isLoading || product.isLoading) return <LoadingState label="Loading product form" />;
  if (categories.isError || product.isError) return <ErrorState message={((categories.error ?? product.error) as Error).message} onRetry={() => { categories.refetch(); product.refetch(); }} />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Header title={editing ? 'Edit Product' : 'Add Product'} onBack={() => navigation.goBack()} />
      <Card title="Basic Information">
        <Field label="Product Name" value={form.name} onChangeText={name => setForm({ ...form, name })} />
        <SearchDropdown label="Category" value={form.categoryId} options={(categories.data ?? []).map(item => ({ value: getId(item), label: item.name ?? 'Category' }))} onChange={categoryId => setForm({ ...form, categoryId, subcategoryId: '' })} />
        <SearchDropdown label="Subcategory" value={form.subcategoryId} options={subcategories.map(item => ({ value: getId(item), label: item.name ?? 'Subcategory' }))} onChange={subcategoryId => setForm({ ...form, subcategoryId })} disabled={!form.categoryId} />
        <Field label="Product Type" value={form.productType} onChangeText={productType => setForm({ ...form, productType })} />
        <Field label="Description" value={form.description} onChangeText={description => setForm({ ...form, description })} multiline />
      </Card>
      <Card title="Media">
        <View style={styles.images}>{form.images.map((uri, index) => <View key={uri} style={styles.imageWrap}><RemoteImage uri={firstImage(uri)} width={180} height={180} style={styles.image} /><Pressable onPress={() => setForm({ ...form, images: form.images.filter(item => item !== uri) })} style={styles.removeImage}><Icon name="close" size={14} color="#fff" /></Pressable>{index === 0 ? <Text style={styles.cover}>Cover</Text> : null}</View>)}<Pressable onPress={addImages} style={styles.addImage}><Icon name="image-plus" size={24} color={colors.primary} /><Text style={styles.addImageText}>Add images</Text></Pressable></View>
      </Card>
      <Card title="Pricing, MOQ and Orders">
        <Field label="Price" value={form.price} onChangeText={price => setForm({ ...form, price })} keyboardType="numeric" />
        <Field label="MOQ" value={form.minimumOrderQuantity} onChangeText={minimumOrderQuantity => setForm({ ...form, minimumOrderQuantity })} keyboardType="numeric" />
        <View style={styles.tierHeader}><Text style={styles.label}>MOQ Price Tiers</Text><Pressable onPress={() => setForm({ ...form, priceTiers: [...form.priceTiers, { minimumQuantity: '', maximumQuantity: '', unitPrice: '' }] })} style={styles.addTier}><Icon name="plus" size={16} color="#fff" /><Text style={styles.addTierText}>Add tier</Text></Pressable></View>
        {form.priceTiers.map((tier, index) => <View key={`tier-${index}`} style={styles.tierCard}>
          <Text style={styles.tierTitle}>Tier {index + 1}</Text>
          <View style={styles.tierFields}><View style={styles.tierField}><Field label="From" value={tier.minimumQuantity} onChangeText={value => updateTier(index, 'minimumQuantity', value)} keyboardType="numeric" /></View><View style={styles.tierField}><Field label="To" value={tier.maximumQuantity} onChangeText={value => updateTier(index, 'maximumQuantity', value)} keyboardType="numeric" /></View><View style={styles.tierField}><Field label="Unit price" value={tier.unitPrice} onChangeText={value => updateTier(index, 'unitPrice', value)} keyboardType="decimal-pad" /></View></View>
          <View style={styles.tierActions}><Pressable disabled={index === 0} onPress={() => moveTier(index, -1)}><Icon name="arrow-up" size={20} color={index === 0 ? colors.faint : colors.ink} /></Pressable><Pressable disabled={index === form.priceTiers.length - 1} onPress={() => moveTier(index, 1)}><Icon name="arrow-down" size={20} color={index === form.priceTiers.length - 1 ? colors.faint : colors.ink} /></Pressable><Pressable onPress={() => setForm({ ...form, priceTiers: form.priceTiers.filter((_, tierIndex) => tierIndex !== index) })}><Icon name="trash-can-outline" size={20} color={colors.rose} /></Pressable></View>
        </View>)}
        {tierError ? <Text style={styles.tierError}>{tierError}</Text> : null}
        <SearchDropdown label="Unit" value={form.unit} options={PRODUCT_UNITS.map(item => ({ value: item, label: item.replace(/_/g, ' ') }))} onChange={unit => setForm({ ...form, unit })} />
        <Text style={styles.label}>Order Type</Text><View style={styles.chips}>{['inquiry_only', 'rfq_only', 'direct_order_enabled'].map(item => <Chip key={item} label={item.replace(/_/g, ' ')} active={form.orderType === item} onPress={() => setForm({ ...form, orderType: item, directOrderEnabled: item === 'direct_order_enabled' })} />)}</View>
        <Text style={styles.label}>Sample Orders</Text><View style={styles.chips}>{[false, true].map(value => <Chip key={String(value)} label={value ? 'Sample available' : 'No sample'} active={form.sampleAvailable === value} onPress={() => setForm({ ...form, sampleAvailable: value })} />)}</View>
        <Field label="Sample Price" value={form.samplePrice} onChangeText={samplePrice => setForm({ ...form, samplePrice })} keyboardType="numeric" />
        <Text style={styles.label}>Payment Terms</Text><View style={styles.chips}>{PAYMENT_TERMS.map(item => <Chip key={item} label={item.replace(/_/g, ' ')} active={form.paymentTerms === item} onPress={() => setForm({ ...form, paymentTerms: item })} />)}</View>
      </Card>
      <Card title="Shipping and Warranty">
        <Field label="Lead Time" value={form.leadTime} onChangeText={leadTime => setForm({ ...form, leadTime })} keyboardType="numeric" />
        <Field label="Delivery Time" value={form.deliveryTime} onChangeText={deliveryTime => setForm({ ...form, deliveryTime })} keyboardType="numeric" />
        <Field label="Origin Port" value={form.originPort} onChangeText={originPort => setForm({ ...form, originPort })} />
        <Field label="Shipping Methods CSV" value={form.shippingMethods} onChangeText={shippingMethods => setForm({ ...form, shippingMethods })} />
        <Field label="Estimated Delivery" value={form.shippingEstimate} onChangeText={shippingEstimate => setForm({ ...form, shippingEstimate })} />
        <Field label="Warranty Period" value={form.warrantyPeriod} onChangeText={warrantyPeriod => setForm({ ...form, warrantyPeriod })} />
        <Field label="Warranty Details" value={form.warranty} onChangeText={warranty => setForm({ ...form, warranty })} />
      </Card>
      <Card title="Specifications and Manufacturing">
        <Field label="Specifications (Name: Value per line)" value={form.specifications} onChangeText={specifications => setForm({ ...form, specifications })} multiline />
        <Field label="Processing Type" value={form.processType} onChangeText={processType => setForm({ ...form, processType })} />
        <Field label="Production Capacity" value={form.capacity} onChangeText={capacity => setForm({ ...form, capacity })} />
        <Field label="Automation Level" value={form.automationLevel} onChangeText={automationLevel => setForm({ ...form, automationLevel })} />
      </Card>
      <Card title="Packaging, Certifications and Tags">
        <Field label="Packaging Type" value={form.packagingType} onChangeText={packagingType => setForm({ ...form, packagingType })} />
        <Field label="Weight (kg)" value={form.packagingWeight} onChangeText={packagingWeight => setForm({ ...form, packagingWeight })} />
        <Field label="Dimensions (cm)" value={form.packagingDimensions} onChangeText={packagingDimensions => setForm({ ...form, packagingDimensions })} />
        <Field label="Certifications CSV" value={form.certifications} onChangeText={certifications => setForm({ ...form, certifications })} />
        <Field label="Tags CSV" value={form.tags} onChangeText={tags => setForm({ ...form, tags })} />
        <Text style={styles.label}>Status</Text><View style={styles.chips}>{['draft', 'published', 'paused'].map(item => <Chip key={item} label={item} active={form.status === item} onPress={() => setForm({ ...form, status: item })} />)}</View>
      </Card>
      <View style={styles.actions}>
        <Pressable disabled={save.isPending} onPress={() => save.mutate('draft')} style={[styles.secondary, save.isPending && styles.disabled]}><Text style={styles.secondaryText}>Save Draft</Text></Pressable>
        <Pressable disabled={save.isPending} onPress={() => {
          if (!form.name.trim() || !form.categoryId || !form.subcategoryId) {
            Alert.alert('Missing information', 'Product name, category and subcategory are required to publish.');
            return;
          }
          if (tierError) {
            Alert.alert('Invalid MOQ tiers', tierError);
            return;
          }
          save.mutate('published');
        }} style={[styles.primary, save.isPending && styles.disabled]}><Text style={styles.primaryText}>{save.isPending ? 'Saving…' : editing ? 'Update & Publish' : 'Publish Product'}</Text></Pressable>
      </View>
    </ScrollView>
  );
}

function buildPayload(form: Record<string, any>, categories: any[], status: string) {
  const category = categories.find(item => getId(item) === form.categoryId);
  const subcategory = category?.subcategories?.find?.((item: any) => getId(item) === form.subcategoryId);
  return {
    ...form,
    status,
    category: category?.name,
    subcategory: subcategory?.name,
    price: Number(form.price) || 0,
    minimumOrderQuantity: Number(form.minimumOrderQuantity) || 1,
    priceTiers: (form.priceTiers as PriceTier[]).map(tier => ({ minimumQuantity: Number(tier.minimumQuantity), maximumQuantity: Number(tier.maximumQuantity), unitPrice: Number(tier.unitPrice) })),
    samplePrice: Number(form.samplePrice) || 0,
    leadTime: Number(form.leadTime) || undefined,
    deliveryTime: Number(form.deliveryTime) || undefined,
    paymentTerms: form.paymentTerms,
    shipping: { available: form.shippingAvailable, originPort: form.originPort, methods: split(form.shippingMethods), countries: [], estimateText: form.shippingEstimate },
    specifications: textToSpecs(form.specifications),
    manufacturingDetails: { processType: form.processType, capacity: form.capacity, automationLevel: form.automationLevel },
    packaging: { type: form.packagingType, weight: form.packagingWeight, dimensions: form.packagingDimensions },
    certifications: split(form.certifications),
    tags: split(form.tags),
  };
}

function validatePriceTiers(tiers: PriceTier[]) {
  const normalized = tiers.map((tier, index) => ({ index, min: Number(tier.minimumQuantity), max: Number(tier.maximumQuantity), price: Number(tier.unitPrice) }));
  for (const tier of normalized) {
    if (!Number.isInteger(tier.min) || !Number.isInteger(tier.max) || tier.min < 1 || tier.max < tier.min) return `Tier ${tier.index + 1} must have a valid whole-number range.`;
    if (!Number.isFinite(tier.price) || tier.price <= 0) return `Tier ${tier.index + 1} must have a price greater than zero.`;
  }
  const sorted = [...normalized].sort((a, b) => a.min - b.min);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].min <= sorted[index - 1].max) return `Tier ${sorted[index].index + 1} overlaps another MOQ range.`;
  }
  return undefined;
}

function split(value: string) {
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

function textToSpecs(value: string) {
  return Object.fromEntries(value.split('\n').map(line => line.split(':')).filter(parts => parts.length >= 2).map(([key, ...rest]) => [key.trim(), rest.join(':').trim()]).filter(([key, val]) => key && val));
}

function specsToText(value: Record<string, unknown> | undefined) {
  return value && typeof value === 'object' ? Object.entries(value).map(([key, val]) => `${key}: ${String(val)}`).join('\n') : '';
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  label: { color: colors.muted, fontSize: 12, fontWeight: '900', marginBottom: spacing.xs, textTransform: 'uppercase' },
  dropdown: { alignItems: 'center', backgroundColor: colors.cardMuted, borderRadius: radii.sm, flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md, minHeight: 48, paddingHorizontal: spacing.md },
  dropdownValue: { color: colors.ink, fontSize: 14, fontWeight: '800', textTransform: 'capitalize' },
  dropdownPlaceholder: { color: colors.muted },
  dropdownBackdrop: { backgroundColor: 'rgba(15,23,42,0.45)', flex: 1, justifyContent: 'flex-end' },
  dropdownSheet: { backgroundColor: colors.card, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, maxHeight: '72%', padding: spacing.lg },
  dropdownTitle: { color: colors.ink, fontSize: 18, fontWeight: '900', marginBottom: spacing.md },
  dropdownSearch: { alignItems: 'center', backgroundColor: colors.cardMuted, borderRadius: radii.sm, flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md, paddingHorizontal: spacing.md },
  dropdownSearchInput: { color: colors.ink, flex: 1, minHeight: 46 },
  dropdownOption: { alignItems: 'center', borderBottomColor: colors.faint, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', minHeight: 48 },
  dropdownOptionText: { color: colors.ink, fontSize: 14, fontWeight: '700', textTransform: 'capitalize' },
  dropdownOptionActive: { color: colors.primary },
  dropdownEmpty: { color: colors.muted, padding: spacing.xl, textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  images: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tierHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  addTier: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.pill, flexDirection: 'row', gap: 4, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  addTierText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  tierCard: { backgroundColor: colors.cardMuted, borderRadius: radii.md, marginBottom: spacing.sm, padding: spacing.md },
  tierTitle: { color: colors.ink, fontSize: 13, fontWeight: '900', marginBottom: spacing.sm },
  tierFields: { flexDirection: 'row', gap: spacing.sm },
  tierField: { flex: 1 },
  tierActions: { flexDirection: 'row', gap: spacing.lg, justifyContent: 'flex-end' },
  tierError: { color: colors.rose, fontSize: 12, fontWeight: '800', marginBottom: spacing.md },
  imageWrap: { position: 'relative' },
  image: { backgroundColor: colors.cardMuted, borderRadius: radii.sm, height: 86, width: 86 },
  removeImage: { alignItems: 'center', backgroundColor: colors.rose, borderRadius: radii.pill, height: 22, justifyContent: 'center', position: 'absolute', right: 4, top: 4, width: 22 },
  cover: { backgroundColor: colors.green, borderRadius: radii.pill, bottom: 4, color: '#fff', fontSize: 10, fontWeight: '900', left: 4, paddingHorizontal: spacing.xs, position: 'absolute' },
  addImage: { alignItems: 'center', backgroundColor: colors.cardMuted, borderRadius: radii.sm, height: 86, justifyContent: 'center', width: 86 },
  addImageText: { color: colors.primaryDark, fontSize: 11, fontWeight: '900', marginTop: spacing.xs },
  actions: { flexDirection: 'row', gap: spacing.md },
  primary: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.pill, flex: 1, padding: spacing.md },
  primaryText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  secondary: { alignItems: 'center', backgroundColor: colors.card, borderRadius: radii.pill, flex: 1, padding: spacing.md },
  secondaryText: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  disabled: { opacity: 0.55 },
});

export default SellerProductFormScreen;
