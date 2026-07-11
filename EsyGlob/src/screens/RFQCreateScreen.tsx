import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { createProductEnquiry, createRFQ } from '../api/marketplace';
import { getId } from '../utils/format';

// ─── Palette ────────────────────────────────────────────────────────────────

const P = {
  bg: '#FAFAFA',
  surface: '#FFFFFF',
  primary: '#FF6A00',
  primaryDark: '#E05500',
  primaryLight: '#FFF3E8',
  accent: '#2563EB',
  accentLight: '#EFF6FF',
  text: '#1A1A1A',
  textSecondary: '#475569',
  muted: '#94A3B8',
  border: '#E2E8F0',
  inputBg: '#F8FAFC',
  danger: '#DC2626',
  success: '#059669',
};

// ─── Constants ──────────────────────────────────────────────────────────────

const UNITS = ['pcs', 'kg', 'boxes', 'tons', 'liters', 'meters', 'rolls', 'sheets', 'other'];
const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'CNY'];
const TIMELINES = ['flexible', '1week', '2weeks', '1month', '2months', '3months', 'immediate'];
const INCOTERMS = ['FOB', 'CIF', 'CFR', 'EXW', 'DDP', 'DAP', 'FAS', 'CPT', 'CIP', 'other'];

const contactPattern =
  /(\+?\d[\d\s().-]{7,}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|https?:\/\/|www\.)/i;

// ─── Types ──────────────────────────────────────────────────────────────────

type LineItem = {
  name: string;
  category: string;
  subcategory: string;
  quantity: string;
  unit: string;
  targetPrice: string;
  specifications: string;
  imageUrl: string;
};

type RFQForm = {
  title: string;
  description: string;
  category: string;
  subcategory: string;
  specifications: string;
  quantity: string;
  minimumOrderQuantity: string;
  unit: string;
  targetPrice: string;
  currency: string;
  deliveryCountry: string;
  deliveryPort: string;
  deliveryTimeline: string;
  incoterms: string;
  visibility: string;
  isVerifiedSuppliersOnly: boolean;
  items: LineItem[];
  imageUrls: string;
  documentUrls: string;
  attachmentUrls: string;
};

const emptyItem: LineItem = {
  name: '', category: '', subcategory: '', quantity: '1',
  unit: 'pcs', targetPrice: '', specifications: '', imageUrl: '',
};

// ─── Component ──────────────────────────────────────────────────────────────

function RFQCreateScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const queryClient = useQueryClient();
  const prefill = (route.params?.prefill ?? {}) as Record<string, any>;

  const [form, setForm] = useState<RFQForm>({
    title: String(prefill.title ?? prefill.productName ?? ''),
    description: String(prefill.description ?? ''),
    category: String(prefill.category ?? ''),
    subcategory: String(prefill.subcategory ?? ''),
    specifications: String(prefill.specifications ?? ''),
    quantity: String(prefill.quantity ?? '100'),
    minimumOrderQuantity: String(prefill.minimumOrderQuantity ?? ''),
    unit: String(prefill.unit ?? 'pcs'),
    targetPrice: String(prefill.targetPrice ?? ''),
    currency: String(prefill.currency ?? 'INR'),
    deliveryCountry: String(prefill.deliveryCountry ?? prefill.destinationCountry ?? 'India'),
    deliveryPort: String(prefill.deliveryPort ?? ''),
    deliveryTimeline: String(prefill.deliveryTimeline ?? 'flexible'),
    incoterms: String(prefill.incoterms ?? 'FOB'),
    visibility: String(prefill.visibility ?? 'public'),
    isVerifiedSuppliersOnly: false,
    items: [{ ...emptyItem, name: String(prefill.productName ?? ''), quantity: String(prefill.quantity ?? '1') }],
    imageUrls: '',
    documentUrls: '',
    attachmentUrls: '',
  });

  const updateField = (key: keyof RFQForm, value: string | boolean) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const updateItem = (index: number, field: keyof LineItem, value: string) => {
    setForm(prev => {
      const items = [...prev.items];
      items[index] = { ...items[index], [field]: value };
      const first = items[0] || emptyItem;
      return {
        ...prev,
        items,
        title: first.name || prev.title,
        category: first.category || prev.category,
        quantity: first.quantity || prev.quantity,
        unit: first.unit || prev.unit,
        targetPrice: first.targetPrice || prev.targetPrice,
        specifications: first.specifications || prev.specifications,
      };
    });
  };

  const addItem = () => {
    setForm(prev => ({ ...prev, items: [...prev.items, { ...emptyItem }] }));
  };

  const removeItem = (index: number) => {
    if (form.items.length <= 1) return;
    setForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
  };

  const submit = useMutation({
    mutationFn: async () => {
      const productId = String(prefill.productId ?? '');
      const sellerUserId = String(prefill.sellerUserId ?? '');

      if (productId && sellerUserId) {
        return createProductEnquiry({
          productId,
          sellerUserId,
          productName: form.title.trim(),
          quantity: Number(form.quantity) || 1,
          unit: form.unit || 'pcs',
          targetPrice: form.targetPrice ? Number(form.targetPrice) : undefined,
          destinationCountry: form.deliveryCountry.trim(),
          additionalNotes: [
            form.description,
            form.specifications,
            form.items.map(i => `${i.name}: ${i.specifications}`).join('\n'),
          ].filter(Boolean).join('\n\n'),
          attachments: [],
        });
      }

      return createRFQ({
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category.trim(),
        subcategory: form.subcategory.trim() || undefined,
        specifications: form.specifications.trim() || undefined,
        quantity: Number(form.quantity) || 1,
        minimumOrderQuantity: Number(form.minimumOrderQuantity) || undefined,
        unit: form.unit || 'pcs',
        targetPrice: form.targetPrice ? Number(form.targetPrice) : undefined,
        currency: form.currency || 'INR',
        deliveryCountry: form.deliveryCountry.trim(),
        deliveryPort: form.deliveryPort.trim() || undefined,
        deliveryTimeline: form.deliveryTimeline || 'flexible',
        incoterms: form.incoterms || 'FOB',
        visibility: form.visibility,
        isVerifiedSuppliersOnly: form.isVerifiedSuppliersOnly,
        items: form.items.filter(i => i.name.trim()),
        rfqType: form.items.length > 1 ? 'multi_product' : 'custom',
        attachments: [],
      });
    },
    onSuccess: async (result: any) => {
      await queryClient.invalidateQueries({ queryKey: ['rfqs'] });
      if (result?.chat) {
        navigation.replace('ChatDetails', { chatId: getId(result.chat), title: form.title || 'RFQ Chat' });
      } else {
        const id = getId(result?.rfq ?? result);
        if (id) {
          navigation.replace('RFQDetails', { rfqId: id });
        } else {
          Alert.alert('✓ Created', 'RFQ published successfully.');
          navigation.goBack();
        }
      }
    },
    onError: (error: unknown) =>
      Alert.alert('Failed', error instanceof Error ? error.message : 'Unable to create RFQ.'),
  });

  const validateAndSubmit = () => {
    if (!form.title.trim() || !form.description.trim() || !form.category.trim() || !form.deliveryCountry.trim()) {
      Alert.alert('Missing Fields', 'Title, description, category, and destination country are required.');
      return;
    }
    const moderated = [form.title, form.description, form.specifications];
    if (moderated.some(v => contactPattern.test(v))) {
      Alert.alert('Contact Blocked', 'Do not include phone numbers, emails, or links.');
      return;
    }
    submit.mutate();
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={P.surface} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="arrow-left" size={22} color={P.text} />
        </Pressable>
        <View>
          <Text style={styles.headerKicker}>Procurement Request</Text>
          <Text style={styles.headerTitle}>RFQ Details</Text>
        </View>
        <Pressable onPress={validateAndSubmit} disabled={submit.isPending} style={styles.headerPublish}>
          {submit.isPending ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.headerPublishText}>Publish</Text>}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* ── Section 1: Basic Info ── */}
        <View style={styles.section}>
          <Text style={styles.sectionKicker}>Basic Information</Text>
          <Text style={styles.sectionTitle}>RFQ details</Text>
          <View style={styles.card}>
            <InputField label="RFQ Title" value={form.title} onChangeText={v => updateField('title', v)} placeholder="Stainless steel bottles with logo" required icon="file-document" />
            <InputField label="Category" value={form.category} onChangeText={v => updateField('category', v)} placeholder="Kitchenware" required icon="layers" />
            <InputField label="Subcategory" value={form.subcategory} onChangeText={v => updateField('subcategory', v)} placeholder="Drinkware" icon="layers" />

            <Text style={styles.fieldLabel}>Visibility</Text>
            <View style={styles.chipRow}>
              {['public', 'private'].map(v => (
                <Pressable key={v} onPress={() => updateField('visibility', v)} style={[styles.chip, form.visibility === v && styles.chipActive]}>
                  <Icon name={v === 'public' ? 'earth' : 'lock'} size={14} color={form.visibility === v ? '#FFF' : P.textSecondary} />
                  <Text style={[styles.chipText, form.visibility === v && styles.chipTextActive]}>{v === 'public' ? 'Public' : 'Private'}</Text>
                </Pressable>
              ))}
            </View>

            <InputField label="Specifications & Requirements" value={form.description} onChangeText={v => updateField('description', v)} multiline placeholder="Material, grade, dimensions, color, packaging..." required icon="package-variant" />
            <InputField label="Detailed Specifications" value={form.specifications} onChangeText={v => updateField('specifications', v)} multiline placeholder="Technical specs, tolerances, quality standards..." icon="file-document" />
          </View>
        </View>

        {/* ── Section 2: Line Items ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionKicker}>Line Items</Text>
              <Text style={styles.sectionTitle}>Products to source</Text>
            </View>
            <Pressable onPress={addItem} style={styles.addItemBtn}>
              <Icon name="plus" size={16} color={P.primary} />
              <Text style={styles.addItemText}>Add</Text>
            </Pressable>
          </View>

          {form.items.map((item, index) => (
            <View key={index} style={styles.card}>
              <View style={styles.itemHeader}>
                <Text style={styles.itemTitle}>Item {index + 1}</Text>
                {form.items.length > 1 && (
                  <Pressable onPress={() => removeItem(index)} style={styles.removeBtn}>
                    <Icon name="trash-can-outline" size={16} color={P.danger} />
                  </Pressable>
                )}
              </View>
              <InputField label="Product Name" value={item.name} onChangeText={v => updateItem(index, 'name', v)} placeholder="Product name" />
              <View style={styles.row}>
                <View style={styles.half}><InputField label="Category" value={item.category} onChangeText={v => updateItem(index, 'category', v)} placeholder="Category" /></View>
                <View style={styles.half}><InputField label="Subcategory" value={item.subcategory} onChangeText={v => updateItem(index, 'subcategory', v)} placeholder="Subcategory" /></View>
              </View>
              <View style={styles.row}>
                <View style={styles.half}><InputField label="Quantity" value={item.quantity} onChangeText={v => updateItem(index, 'quantity', v)} keyboardType="numeric" placeholder="1" /></View>
                <View style={styles.half}>
                  <Text style={styles.fieldLabel}>Unit</Text>
                  <View style={styles.chipRow}>
                    {UNITS.slice(0, 4).map(u => (
                      <Pressable key={u} onPress={() => updateItem(index, 'unit', u)} style={[styles.chip, item.unit === u && styles.chipActive]}>
                        <Text style={[styles.chipText, item.unit === u && styles.chipTextActive]}>{u}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>
              <InputField label="Target Price/Unit" value={item.targetPrice} onChangeText={v => updateItem(index, 'targetPrice', v)} keyboardType="numeric" placeholder="500" />
              <InputField label="Specifications" value={item.specifications} onChangeText={v => updateItem(index, 'specifications', v)} multiline placeholder="Item-specific requirements" />
              <InputField label="Reference Image URL" value={item.imageUrl} onChangeText={v => updateItem(index, 'imageUrl', v)} placeholder="https://..." />
            </View>
          ))}

          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.half}><InputField label="Total Quantity" value={form.quantity} onChangeText={v => updateField('quantity', v)} keyboardType="numeric" required /></View>
              <View style={styles.half}><InputField label="Buyer MOQ" value={form.minimumOrderQuantity} onChangeText={v => updateField('minimumOrderQuantity', v)} keyboardType="numeric" /></View>
            </View>
            <View style={styles.row}>
              <View style={styles.half}>
                <Text style={styles.fieldLabel}>Currency</Text>
                <View style={styles.chipRow}>
                  {CURRENCIES.slice(0, 3).map(c => (
                    <Pressable key={c} onPress={() => updateField('currency', c)} style={[styles.chip, form.currency === c && styles.chipActive]}>
                      <Text style={[styles.chipText, form.currency === c && styles.chipTextActive]}>{c}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={styles.half}><InputField label="Target Price/Unit" value={form.targetPrice} onChangeText={v => updateField('targetPrice', v)} keyboardType="numeric" /></View>
            </View>
          </View>
        </View>

        {/* ── Section 3: Delivery ── */}
        <View style={styles.section}>
          <Text style={styles.sectionKicker}>Delivery</Text>
          <Text style={styles.sectionTitle}>Shipping & trade terms</Text>
          <View style={styles.card}>
            <InputField label="Shipping Destination" value={form.deliveryCountry} onChangeText={v => updateField('deliveryCountry', v)} placeholder="India, UAE, USA" required icon="map-marker" />
            <InputField label="Destination Port" value={form.deliveryPort} onChangeText={v => updateField('deliveryPort', v)} placeholder="Nhava Sheva, Jebel Ali" icon="map-marker" />
            <View style={styles.row}>
              <View style={styles.half}>
                <Text style={styles.fieldLabel}>Timeline</Text>
                <View style={styles.chipRow}>
                  {TIMELINES.slice(0, 3).map(t => (
                    <Pressable key={t} onPress={() => updateField('deliveryTimeline', t)} style={[styles.chip, form.deliveryTimeline === t && styles.chipActive]}>
                      <Text style={[styles.chipText, form.deliveryTimeline === t && styles.chipTextActive]}>{t}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={styles.half}>
                <Text style={styles.fieldLabel}>Incoterms</Text>
                <View style={styles.chipRow}>
                  {INCOTERMS.slice(0, 4).map(inc => (
                    <Pressable key={inc} onPress={() => updateField('incoterms', inc)} style={[styles.chip, form.incoterms === inc && styles.chipActive]}>
                      <Text style={[styles.chipText, form.incoterms === inc && styles.chipTextActive]}>{inc}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
            <Pressable onPress={() => updateField('isVerifiedSuppliersOnly', !form.isVerifiedSuppliersOnly)} style={styles.checkRow}>
              <Icon name={form.isVerifiedSuppliersOnly ? 'checkbox-marked' : 'checkbox-blank-outline'} size={20} color={form.isVerifiedSuppliersOnly ? P.primary : P.muted} />
              <View>
                <Text style={styles.checkTitle}>Verified suppliers only</Text>
                <Text style={styles.checkDesc}>Limit responses to verified suppliers.</Text>
              </View>
            </Pressable>
          </View>
        </View>

        {/* ── Section 4: Attachments ── */}
        <View style={styles.section}>
          <Text style={styles.sectionKicker}>Attachments</Text>
          <Text style={styles.sectionTitle}>Images, documents & files</Text>
          <View style={styles.card}>
            <InputField label="Image URL" value={form.imageUrls} onChangeText={v => updateField('imageUrls', v)} placeholder="https://..." icon="image" />
            <InputField label="Document URL" value={form.documentUrls} onChangeText={v => updateField('documentUrls', v)} placeholder="https://..." icon="file-document" />
            <InputField label="Attachment URL" value={form.attachmentUrls} onChangeText={v => updateField('attachmentUrls', v)} placeholder="https://..." icon="paperclip" />
          </View>
        </View>

        {/* Submit */}
        <Pressable onPress={validateAndSubmit} disabled={submit.isPending} style={[styles.submitBtn, submit.isPending && styles.submitBtnDisabled]}>
          {submit.isPending ? <ActivityIndicator size="small" color="#FFF" /> : (
            <><Icon name="send" size={18} color="#FFF" /><Text style={styles.submitBtnText}>Publish RFQ</Text></>
          )}
        </Pressable>
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ─── Input Field ────────────────────────────────────────────────────────────

function InputField({ label, required, icon, ...props }: { label: string; required?: boolean; icon?: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>
        {icon && <Icon name={icon} size={14} color={P.muted} />}  {label}
        {required && <Text style={styles.requiredStar}> *</Text>}
      </Text>
      <TextInput placeholderTextColor={P.muted} style={[styles.fieldInput, props.multiline && styles.fieldTextarea]} {...props} />
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: P.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingHorizontal: 14, paddingBottom: 10,
    backgroundColor: P.surface, borderBottomWidth: 1, borderBottomColor: P.border,
  },
  backBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: P.inputBg, alignItems: 'center', justifyContent: 'center' },
  headerKicker: { fontSize: 10, fontWeight: '700', color: P.primary, textTransform: 'uppercase', letterSpacing: 0.5 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: P.text },
  headerPublish: { backgroundColor: P.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  headerPublishText: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  content: { padding: 14 },

  section: { marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionKicker: { fontSize: 10, fontWeight: '700', color: P.primary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: P.text, marginBottom: 10 },
  card: { backgroundColor: P.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: P.border },

  fieldWrap: { marginBottom: 12 },
  fieldLabel: { fontSize: 11, fontWeight: '600', color: P.textSecondary, marginBottom: 5 },
  requiredStar: { color: P.danger },
  fieldInput: { backgroundColor: P.inputBg, borderRadius: 10, paddingHorizontal: 12, height: 44, fontSize: 13, fontWeight: '500', color: P.text, borderWidth: 1, borderColor: P.border },
  fieldTextarea: { height: 80, paddingTop: 12, textAlignVertical: 'top' },

  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, backgroundColor: P.inputBg, borderWidth: 1, borderColor: P.border },
  chipActive: { backgroundColor: P.primary, borderColor: P.primary },
  chipText: { fontSize: 11, fontWeight: '600', color: P.textSecondary },
  chipTextActive: { color: '#FFF' },

  addItemBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: P.primaryLight, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  addItemText: { fontSize: 11, fontWeight: '700', color: P.primary },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  itemTitle: { fontSize: 13, fontWeight: '700', color: P.text },
  removeBtn: { padding: 4 },

  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8 },
  checkTitle: { fontSize: 13, fontWeight: '600', color: P.text },
  checkDesc: { fontSize: 10, color: P.muted, marginTop: 2 },

  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: P.primary, borderRadius: 14, height: 50, marginTop: 8 },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});

export default RFQCreateScreen;