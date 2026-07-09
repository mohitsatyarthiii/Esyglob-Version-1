import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createRFQ } from '../api/marketplace';
import { colors, radii, shadow, spacing } from '../theme';

const contactPattern = /(\+?\d[\d\s().-]{7,}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|https?:\/\/|www\.)/i;

function RFQCreateScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const queryClient = useQueryClient();
  const prefill = (route.params?.prefill ?? {}) as Record<string, unknown>;
  const [form, setForm] = React.useState({
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

  const submit = useMutation({
    mutationFn: () => createRFQ({
      ...form,
      quantity: Number(form.quantity) || 1,
      targetPrice: form.targetPrice ? Number(form.targetPrice) : undefined,
      deliveryCountry: form.destinationCountry,
      destinationCountry: form.destinationCountry,
      rfqType: 'custom',
      visibility: form.visibility,
      attachments: [],
    }),
    onSuccess: async rfq => {
      await queryClient.invalidateQueries({ queryKey: ['rfqs'] });
      navigation.replace('RFQDetails', { rfqId: rfq._id ?? rfq.id });
    },
    onError: error => Alert.alert('RFQ failed', error instanceof Error ? error.message : 'Unable to create RFQ.'),
  });

  const validateAndSubmit = () => {
    const required = [
      ['Title', form.title],
      ['Description', form.description],
      ['Category', form.category],
      ['Quantity', form.quantity],
      ['Destination country', form.destinationCountry],
    ].find(([, value]) => !String(value).trim());

    if (required) {
      Alert.alert('Missing field', `${required[0]} is required.`);
      return;
    }

    const moderatedFields = [form.title, form.description, form.customSpecifications, form.packagingRequirements, form.deliveryRequirements, form.additionalNotes];
    if (moderatedFields.some(value => contactPattern.test(value))) {
      Alert.alert('Contact information blocked', 'Keep phone numbers, email addresses, and website links out of RFQ text. Use EsyGlob chat after suppliers respond.');
      return;
    }

    submit.mutate();
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconButton}>
          <Icon name="arrow-left" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Create RFQ</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Requirement</Text>
        <Field label="RFQ Title" value={form.title} onChangeText={title => setForm({ ...form, title })} />
        <Field label="Description" value={form.description} onChangeText={description => setForm({ ...form, description })} multiline />
        <Field label="Category" value={form.category} onChangeText={category => setForm({ ...form, category })} />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Commercial Details</Text>
        <View style={styles.row}>
          <Field compact label="Quantity" value={form.quantity} onChangeText={quantity => setForm({ ...form, quantity })} keyboardType="numeric" />
          <Field compact label="Unit" value={form.unit} onChangeText={unit => setForm({ ...form, unit })} />
        </View>
        <View style={styles.row}>
          <Field compact label="Target Price" value={form.targetPrice} onChangeText={targetPrice => setForm({ ...form, targetPrice })} keyboardType="numeric" />
          <Field compact label="Currency" value={form.currency} onChangeText={currency => setForm({ ...form, currency })} />
        </View>
        <Field label="Destination Country" value={form.destinationCountry} onChangeText={destinationCountry => setForm({ ...form, destinationCountry })} />
        <Field label="Delivery Timeline" value={form.deliveryTimeline} onChangeText={deliveryTimeline => setForm({ ...form, deliveryTimeline })} />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Visibility</Text>
        <View style={styles.segment}>
          {['public', 'private'].map(value => (
            <Pressable key={value} onPress={() => setForm({ ...form, visibility: value })} style={[styles.segmentButton, form.visibility === value && styles.segmentActive]}>
              <Text style={[styles.segmentText, form.visibility === value && styles.segmentTextActive]}>{value}</Text>
            </Pressable>
          ))}
        </View>
        {form.visibility === 'private' ? <Text style={styles.helper}>Manual private RFQ supplier picking is not exposed by the current backend. Product and chat enquiries target a supplier directly.</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Specifications</Text>
        <Field label="Custom Specifications" value={form.customSpecifications} onChangeText={customSpecifications => setForm({ ...form, customSpecifications })} multiline />
        <Field label="Packaging Requirements" value={form.packagingRequirements} onChangeText={packagingRequirements => setForm({ ...form, packagingRequirements })} multiline />
        <Field label="Delivery Requirements" value={form.deliveryRequirements} onChangeText={deliveryRequirements => setForm({ ...form, deliveryRequirements })} multiline />
        <Field label="Additional Notes" value={form.additionalNotes} onChangeText={additionalNotes => setForm({ ...form, additionalNotes })} multiline />
      </View>

      <Pressable disabled={submit.isPending} onPress={validateAndSubmit} style={[styles.primary, submit.isPending && styles.disabled]}>
        <Text style={styles.primaryText}>{submit.isPending ? 'Publishing...' : 'Publish RFQ'}</Text>
      </Pressable>
    </ScrollView>
  );
}

function Field({ label, value, onChangeText, multiline, keyboardType, compact }: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
  keyboardType?: 'default' | 'numeric';
  compact?: boolean;
}) {
  return (
    <View style={[styles.field, compact && styles.fieldCompact]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        keyboardType={keyboardType}
        placeholderTextColor={colors.muted}
        style={[styles.input, multiline && styles.textarea]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 120, paddingTop: spacing.xxl },
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  iconButton: { alignItems: 'center', backgroundColor: colors.card, borderRadius: radii.pill, height: 42, justifyContent: 'center', width: 42, ...shadow },
  headerTitle: { color: colors.ink, fontSize: 24, fontWeight: '900' },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, marginBottom: spacing.md, padding: spacing.lg, ...shadow },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: '900', marginBottom: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  field: { marginBottom: spacing.md },
  fieldCompact: { flex: 1 },
  label: { color: colors.muted, fontSize: 11, fontWeight: '900', marginBottom: spacing.xs, textTransform: 'uppercase' },
  input: { backgroundColor: colors.cardMuted, borderRadius: radii.md, color: colors.ink, fontSize: 15, fontWeight: '700', minHeight: 46, paddingHorizontal: spacing.md },
  textarea: { minHeight: 92, paddingTop: spacing.md, textAlignVertical: 'top' },
  segment: { backgroundColor: colors.cardMuted, borderRadius: radii.pill, flexDirection: 'row', padding: spacing.xs },
  segmentButton: { alignItems: 'center', borderRadius: radii.pill, flex: 1, paddingVertical: spacing.md },
  segmentActive: { backgroundColor: colors.card },
  segmentText: { color: colors.muted, fontWeight: '900', textTransform: 'capitalize' },
  segmentTextActive: { color: colors.primaryDark },
  helper: { color: colors.muted, fontSize: 12, fontWeight: '700', lineHeight: 18, marginTop: spacing.md },
  primary: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.pill, minHeight: 50, justifyContent: 'center' },
  primaryText: { color: '#fff', fontWeight: '900' },
  disabled: { opacity: 0.5 },
});

export default RFQCreateScreen;
