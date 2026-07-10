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
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  primary: '#0F172A',
  accent: '#2563EB',
  accentLight: '#EFF6FF',
  text: '#0F172A',
  textSecondary: '#475569',
  muted: '#94A3B8',
  border: '#E2E8F0',
  inputBg: '#F1F5F9',
};

// ─── Contact Pattern ────────────────────────────────────────────────────────

const contactPattern =
  /(\+?\d[\d\s().-]{7,}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|https?:\/\/|www\.)/i;

// ─── Types ──────────────────────────────────────────────────────────────────

type RFQForm = {
  title: string;
  description: string;
  category: string;
  quantity: string;
  unit: string;
  targetPrice: string;
  currency: string;
  destinationCountry: string;
  deliveryTimeline: string;
  visibility: string;
  customSpecifications: string;
  packagingRequirements: string;
  deliveryRequirements: string;
  additionalNotes: string;
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
    quantity: String(prefill.quantity ?? '100'),
    unit: String(prefill.unit ?? 'pcs'),
    targetPrice: String(prefill.targetPrice ?? ''),
    currency: String(prefill.currency ?? 'INR'),
    destinationCountry: String(prefill.destinationCountry ?? prefill.deliveryCountry ?? 'India'),
    deliveryTimeline: String(prefill.deliveryTimeline ?? '30 days'),
    visibility: String(prefill.visibility ?? 'public'),
    customSpecifications: String(prefill.customSpecifications ?? ''),
    packagingRequirements: String(prefill.packagingRequirements ?? ''),
    deliveryRequirements: String(prefill.deliveryRequirements ?? ''),
    additionalNotes: String(prefill.additionalNotes ?? ''),
  });

  const updateField = (key: keyof RFQForm, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const submit = useMutation({
    mutationFn: async () => {
      const productId = String(prefill.productId ?? '');
      const sellerUserId = String(prefill.sellerUserId ?? '');

      // If prefill has productId + sellerUserId → create enquiry directly
      if (productId && sellerUserId) {
        const prefillImages: string[] = Array.isArray(prefill.images) ? prefill.images : [];
        return createProductEnquiry({
          productId,
          sellerUserId,
          productName: form.title.trim(),
          quantity: Number(form.quantity) || 1,
          unit: form.unit.trim() || 'pcs',
          targetPrice: form.targetPrice ? Number(form.targetPrice) : undefined,
          destinationCountry: form.destinationCountry.trim(),
          additionalNotes: [
            form.description,
            form.customSpecifications,
            form.packagingRequirements,
            form.deliveryRequirements,
            form.additionalNotes,
          ]
            .filter(Boolean)
            .join('\n\n'),
          attachments: prefillImages.map(url => ({
            filename: url.split('/').pop() ?? 'image',
            type: 'image',
            url,
          })),
        });
      }

      // Otherwise create public/private RFQ
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category.trim(),
        quantity: Number(form.quantity) || 1,
        unit: form.unit.trim() || 'pcs',
        targetPrice: form.targetPrice ? Number(form.targetPrice) : undefined,
        currency: form.currency.trim() || 'INR',
        destinationCountry: form.destinationCountry.trim(),
        deliveryCountry: form.destinationCountry.trim(),
        deliveryTimeline: form.deliveryTimeline.trim(),
        visibility: form.visibility,
        customSpecifications: form.customSpecifications.trim() || undefined,
        packagingRequirements: form.packagingRequirements.trim() || undefined,
        deliveryRequirements: form.deliveryRequirements.trim() || undefined,
        additionalNotes: form.additionalNotes.trim() || undefined,
        rfqType: 'custom',
        attachments: [],
      };

      return createRFQ(payload);
    },
    onSuccess: async (result: any) => {
      await queryClient.invalidateQueries({ queryKey: ['rfqs'] });

      // Handle both enquiry response and RFQ response
      if (result?.chat) {
        // Enquiry response — navigate to chat
        navigation.replace('ChatDetails', {
          chatId: getId(result.chat),
          title: form.title || 'RFQ Chat',
        });
      } else {
        // RFQ response
        const rfq = result?.rfq ?? result;
        const id = getId(rfq);
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
    const required: Array<[string, string]> = [
      ['Title', form.title],
      ['Description', form.description],
      ['Category', form.category],
      ['Quantity', form.quantity],
      ['Destination Country', form.destinationCountry],
    ];

    const missing = required.find(([, v]) => !v.trim());
    if (missing) {
      Alert.alert('Missing Field', `${missing[0]} is required.`);
      return;
    }

    const moderatedFields = [
      form.title,
      form.description,
      form.customSpecifications,
      form.packagingRequirements,
      form.deliveryRequirements,
      form.additionalNotes,
    ];

    if (moderatedFields.some(v => contactPattern.test(v))) {
      Alert.alert(
        'Contact Blocked',
        'Do not include phone numbers, emails, or links. Use EsyGlob chat after suppliers respond.',
      );
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
        <Text style={styles.headerTitle}>Create RFQ</Text>
        <Pressable
          onPress={validateAndSubmit}
          disabled={submit.isPending}
          style={styles.headerPublish}>
          {submit.isPending ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Text style={styles.headerPublishText}>Publish</Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">

        {/* Basic Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Basic Information</Text>
          <View style={styles.card}>
            <InputField
              label="RFQ Title"
              value={form.title}
              onChangeText={v => updateField('title', v)}
              placeholder="e.g. Stainless Steel Pipes"
              required
            />
            <InputField
              label="Description"
              value={form.description}
              onChangeText={v => updateField('description', v)}
              multiline
              placeholder="Describe your requirement in detail..."
              required
            />
            <InputField
              label="Category"
              value={form.category}
              onChangeText={v => updateField('category', v)}
              placeholder="e.g. Industrial Machinery"
              required
            />
          </View>
        </View>

        {/* Commercial Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Commercial Details</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.half}>
                <InputField
                  label="Quantity"
                  value={form.quantity}
                  onChangeText={v => updateField('quantity', v)}
                  keyboardType="numeric"
                  placeholder="100"
                  required
                />
              </View>
              <View style={styles.half}>
                <InputField
                  label="Unit"
                  value={form.unit}
                  onChangeText={v => updateField('unit', v)}
                  placeholder="pcs"
                />
              </View>
            </View>
            <View style={styles.row}>
              <View style={styles.half}>
                <InputField
                  label="Target Price (optional)"
                  value={form.targetPrice}
                  onChangeText={v => updateField('targetPrice', v)}
                  keyboardType="numeric"
                  placeholder="500"
                />
              </View>
              <View style={styles.half}>
                <InputField
                  label="Currency"
                  value={form.currency}
                  onChangeText={v => updateField('currency', v)}
                  placeholder="INR"
                />
              </View>
            </View>
            <InputField
              label="Destination Country"
              value={form.destinationCountry}
              onChangeText={v => updateField('destinationCountry', v)}
              placeholder="India"
              required
            />
            <InputField
              label="Delivery Timeline"
              value={form.deliveryTimeline}
              onChangeText={v => updateField('deliveryTimeline', v)}
              placeholder="30 days"
            />
          </View>
        </View>

        {/* Specifications */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Specifications (Optional)</Text>
          <View style={styles.card}>
            <InputField
              label="Custom Specifications"
              value={form.customSpecifications}
              onChangeText={v => updateField('customSpecifications', v)}
              multiline
              placeholder="Material, size, color, grade..."
            />
            <InputField
              label="Packaging Requirements"
              value={form.packagingRequirements}
              onChangeText={v => updateField('packagingRequirements', v)}
              multiline
              placeholder="Export packaging, palletizing..."
            />
            <InputField
              label="Delivery Requirements"
              value={form.deliveryRequirements}
              onChangeText={v => updateField('deliveryRequirements', v)}
              multiline
              placeholder="Incoterms, shipping method..."
            />
            <InputField
              label="Additional Notes"
              value={form.additionalNotes}
              onChangeText={v => updateField('additionalNotes', v)}
              multiline
              placeholder="Any other details..."
            />
          </View>
        </View>

        {/* Visibility */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Visibility</Text>
          <View style={styles.card}>
            <View style={styles.visibilityRow}>
              <Pressable
                onPress={() => updateField('visibility', 'public')}
                style={[
                  styles.visibilityOption,
                  form.visibility === 'public' && styles.visibilityActive,
                ]}>
                <Icon
                  name="earth"
                  size={20}
                  color={form.visibility === 'public' ? P.accent : P.muted}
                />
                <View>
                  <Text
                    style={[
                      styles.visibilityLabel,
                      form.visibility === 'public' && styles.visibilityLabelActive,
                    ]}>
                    Public
                  </Text>
                  <Text style={styles.visibilityDesc}>Visible to all suppliers</Text>
                </View>
              </Pressable>
              <Pressable
                onPress={() => updateField('visibility', 'private')}
                style={[
                  styles.visibilityOption,
                  form.visibility === 'private' && styles.visibilityActive,
                ]}>
                <Icon
                  name="lock"
                  size={20}
                  color={form.visibility === 'private' ? P.accent : P.muted}
                />
                <View>
                  <Text
                    style={[
                      styles.visibilityLabel,
                      form.visibility === 'private' && styles.visibilityLabelActive,
                    ]}>
                    Private
                  </Text>
                  <Text style={styles.visibilityDesc}>Only invited suppliers</Text>
                </View>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Submit Button */}
        <Pressable
          onPress={validateAndSubmit}
          disabled={submit.isPending}
          style={[styles.submitBtn, submit.isPending && styles.submitBtnDisabled]}>
          {submit.isPending ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              <Icon name="send" size={18} color="#FFF" />
              <Text style={styles.submitBtnText}>Publish RFQ</Text>
            </>
          )}
        </Pressable>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

// ─── Input Field ────────────────────────────────────────────────────────────

function InputField({
  label,
  required,
  ...props
}: { label: string; required?: boolean } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>
        {label}
        {required && <Text style={styles.requiredStar}> *</Text>}
      </Text>
      <TextInput
        placeholderTextColor={P.muted}
        style={[styles.fieldInput, props.multiline && styles.fieldTextarea]}
        {...props}
      />
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  bottomSpacer: { height: 40 },
  screen: { flex: 1, backgroundColor: P.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: P.surface,
    borderBottomWidth: 1,
    borderBottomColor: P.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: P.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: P.text, letterSpacing: -0.3 },
  headerPublish: {
    backgroundColor: P.primary,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  headerPublishText: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  content: { padding: 16 },

  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: P.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
    marginLeft: 4,
  },
  card: {
    backgroundColor: P.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: P.border,
  },

  fieldWrap: { marginBottom: 14 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: P.textSecondary, marginBottom: 6 },
  requiredStar: { color: '#DC2626' },
  fieldInput: {
    backgroundColor: P.inputBg,
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 46,
    fontSize: 14,
    fontWeight: '500',
    color: P.text,
    borderWidth: 1,
    borderColor: P.border,
  },
  fieldTextarea: { height: 90, paddingTop: 12, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },

  visibilityRow: { gap: 10 },
  visibilityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: P.inputBg,
    borderWidth: 1,
    borderColor: P.border,
  },
  visibilityActive: {
    backgroundColor: P.accentLight,
    borderColor: P.accent,
  },
  visibilityLabel: { fontSize: 14, fontWeight: '600', color: P.textSecondary },
  visibilityLabelActive: { color: P.accent },
  visibilityDesc: { fontSize: 11, color: P.muted, marginTop: 2 },

  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: P.primary,
    borderRadius: 14,
    height: 52,
    marginTop: 8,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});

export default RFQCreateScreen;