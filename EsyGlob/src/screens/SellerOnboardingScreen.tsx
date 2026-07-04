import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { pick, types as documentTypes } from '@react-native-documents/picker';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { fetchSellerOnboarding, saveSellerOnboarding, uploadSellerDocument } from '../api/marketplace';
import { ErrorState, LoadingState } from '../components/StateViews';
import { colors, radii, spacing } from '../theme';
import { formatValue } from '../utils/display';

const companyTypes = ['manufacturer', 'wholesaler', 'distributor', 'trader', 'exporter', 'other'];
const documents = [
  ['gst_certificate', 'GST Certificate'],
  ['pan_card', 'PAN Card'],
  ['business_registration', 'Business Registration'],
  ['address_proof', 'Address Proof'],
  ['bank_statement', 'Bank Statement'],
  ['government_id', 'Owner Government ID'],
] as const;

function SellerOnboardingScreen() {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const onboarding = useQuery({ queryKey: ['seller-onboarding'], queryFn: fetchSellerOnboarding });
  const [form, setForm] = useState({
    companyName: '',
    companyType: 'manufacturer',
    businessEmail: '',
    businessPhone: '',
    gstNumber: '',
    panNumber: '',
    street: '',
    city: '',
    state: '',
    country: 'India',
    pincode: '',
  });
  const [uploading, setUploading] = useState('');
  const save = useMutation({
    mutationFn: (draft: boolean) => saveSellerOnboarding(payload(form), draft),
    onSuccess: (_, draft) => {
      queryClient.invalidateQueries({ queryKey: ['seller-onboarding'] });
      if (!draft) {
        Alert.alert('Submitted', 'Business setup was submitted for verification.');
        navigation.goBack();
      }
    },
    onError: error => Alert.alert('Save failed', error instanceof Error ? error.message : 'Unable to save onboarding.'),
  });

  useEffect(() => {
    const seller = onboarding.data?.seller as Record<string, any> | undefined;
    if (!seller) return;
    setForm(value => ({
      ...value,
      companyName: seller.companyName ?? seller.businessName ?? '',
      companyType: seller.companyType ?? 'manufacturer',
      businessEmail: seller.businessEmail ?? '',
      businessPhone: seller.businessPhone ?? '',
      gstNumber: seller.gstNumber ?? '',
      panNumber: seller.panNumber ?? '',
      street: seller.address?.street ?? '',
      city: seller.address?.city ?? '',
      state: seller.address?.state ?? '',
      country: seller.address?.country ?? 'India',
      pincode: seller.address?.pincode ?? '',
    }));
  }, [onboarding.data?.seller]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (onboarding.data?.seller) {
        save.mutate(true);
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [form, onboarding.data?.seller, save]);

  if (onboarding.isLoading) return <LoadingState label="Loading seller setup" />;
  if (onboarding.isError) return <ErrorState message={(onboarding.error as Error).message} onRetry={() => onboarding.refetch()} />;

  const verification = onboarding.data?.verification as Record<string, any> | undefined;
  const completion = onboarding.data?.completion as Record<string, any> | undefined;

  const uploadDocument = async (documentType: string) => {
    try {
      const [file] = await pick({ allowMultiSelection: false, type: [documentTypes.pdf, documentTypes.images] });
      if (!file?.uri) return;
      setUploading(documentType);
      await uploadSellerDocument(documentType, { uri: file.uri, name: file.name ?? `${documentType}.pdf`, type: file.type ?? 'application/octet-stream' });
      await queryClient.invalidateQueries({ queryKey: ['seller-onboarding'] });
    } catch (error) {
      const maybe = error as { code?: string };
      if (maybe.code !== 'OPERATION_CANCELED') Alert.alert('Upload failed', error instanceof Error ? error.message : 'Unable to upload document.');
    } finally {
      setUploading('');
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Header title="Business Setup" onBack={() => navigation.goBack()} />
      <StatusPanel status={String(verification?.status ?? 'pending')} completion={completion} reason={verification?.rejectionReason ?? verification?.informationRequests} />
      <Card title="Company Details">
        <Field label="Company Name" value={form.companyName} onChangeText={companyName => setForm({ ...form, companyName })} />
        <Text style={styles.label}>Company Type</Text>
        <View style={styles.chips}>{companyTypes.map(type => <Chip key={type} label={type} active={form.companyType === type} onPress={() => setForm({ ...form, companyType: type })} />)}</View>
        <Field label="Business Email" value={form.businessEmail} onChangeText={businessEmail => setForm({ ...form, businessEmail })} keyboardType="email-address" />
        <Field label="Business Phone" value={form.businessPhone} onChangeText={businessPhone => setForm({ ...form, businessPhone })} keyboardType="phone-pad" />
        <Field label="GST Number" value={form.gstNumber} onChangeText={gstNumber => setForm({ ...form, gstNumber })} />
        <Field label="PAN Number" value={form.panNumber} onChangeText={panNumber => setForm({ ...form, panNumber })} />
      </Card>
      <Card title="Business Address">
        <Field label="Street Address" value={form.street} onChangeText={street => setForm({ ...form, street })} />
        <Field label="City" value={form.city} onChangeText={city => setForm({ ...form, city })} />
        <Field label="State" value={form.state} onChangeText={state => setForm({ ...form, state })} />
        <Field label="Country" value={form.country} onChangeText={country => setForm({ ...form, country })} />
        <Field label="Pincode" value={form.pincode} onChangeText={pincode => setForm({ ...form, pincode })} />
      </Card>
      <Card title="Documents">
        {documents.map(([type, label]) => {
          const existing = verification?.documents?.find?.((doc: Record<string, unknown>) => doc.documentType === type);
          return (
            <Pressable key={type} onPress={() => uploadDocument(type)} style={styles.documentRow}>
              <Icon name={existing ? 'file-check-outline' : 'file-upload-outline'} size={22} color={existing ? colors.green : colors.primary} />
              <View style={styles.documentBody}>
                <Text style={styles.documentTitle}>{label}</Text>
                <Text style={styles.documentMeta}>{uploading === type ? 'Uploading...' : existing ? String(existing.status ?? 'Uploaded') : 'PDF, JPG or PNG up to 5MB'}</Text>
              </View>
              <Text style={styles.replace}>{existing ? 'Replace' : 'Upload'}</Text>
            </Pressable>
          );
        })}
      </Card>
      <View style={styles.actions}>
        <Pressable onPress={() => save.mutate(true)} style={styles.secondary}><Text style={styles.secondaryText}>Save Draft</Text></Pressable>
        <Pressable onPress={() => save.mutate(false)} style={styles.primary}><Text style={styles.primaryText}>Complete Setup</Text></Pressable>
      </View>
    </ScrollView>
  );
}

function payload(form: Record<string, string>) {
  return {
    companyName: form.companyName,
    companyType: form.companyType,
    businessEmail: form.businessEmail,
    businessPhone: form.businessPhone,
    gstNumber: form.gstNumber,
    panNumber: form.panNumber,
    address: { street: form.street, city: form.city, state: form.state, country: form.country, pincode: form.pincode },
  };
}

export function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return <View style={styles.header}><Pressable onPress={onBack} style={styles.iconButton}><Icon name="arrow-left" size={24} color={colors.ink} /></Pressable><Text style={styles.headerTitle}>{title}</Text><View style={styles.iconButton} /></View>;
}

function StatusPanel({ status, completion, reason }: { status: string; completion?: Record<string, any>; reason?: unknown }) {
  return (
    <View style={styles.statusPanel}>
      <Icon name={status === 'approved' ? 'check-decagram' : 'shield-search'} size={28} color={status === 'approved' ? colors.green : colors.primary} />
      <View style={styles.statusBody}>
        <Text style={styles.statusTitle}>Verification: {status.replace(/_/g, ' ')}</Text>
        <Text style={styles.statusMeta}>{completion?.completedFieldCount ?? 0}/{completion?.totalFieldCount ?? 9} required fields completed</Text>
        {reason ? <Text style={styles.reason}>{formatValue(reason)}</Text> : null}
      </View>
    </View>
  );
}

export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.card}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>;
}

export function Field(props: { label: string } & React.ComponentProps<typeof TextInput>) {
  return <View style={styles.field}><Text style={styles.label}>{props.label}</Text><TextInput placeholderTextColor={colors.muted} style={styles.input} {...props} /></View>;
}

export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}><Text style={[styles.chipText, active && styles.chipTextActive]}>{label.replace(/_/g, ' ')}</Text></Pressable>;
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { alignItems: 'center', flexDirection: 'row', marginBottom: spacing.lg, paddingTop: spacing.xl },
  iconButton: { alignItems: 'center', height: 42, justifyContent: 'center', width: 42 },
  headerTitle: { color: colors.ink, flex: 1, fontSize: 19, fontWeight: '900', textAlign: 'center' },
  statusPanel: { alignItems: 'center', backgroundColor: '#fff8f3', borderRadius: radii.md, flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg, padding: spacing.lg },
  statusBody: { flex: 1 },
  statusTitle: { color: colors.ink, fontSize: 16, fontWeight: '900', textTransform: 'capitalize' },
  statusMeta: { color: colors.muted, fontSize: 12, fontWeight: '800', marginTop: 3 },
  reason: { color: colors.rose, fontSize: 12, fontWeight: '800', marginTop: spacing.xs },
  card: { backgroundColor: colors.card, borderRadius: radii.md, marginBottom: spacing.lg, padding: spacing.lg },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: '900', marginBottom: spacing.md },
  field: { marginBottom: spacing.md },
  label: { color: colors.muted, fontSize: 12, fontWeight: '900', marginBottom: spacing.xs, textTransform: 'uppercase' },
  input: { backgroundColor: colors.cardMuted, borderRadius: radii.md, color: colors.ink, fontSize: 14, fontWeight: '800', minHeight: 44, paddingHorizontal: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  chip: { backgroundColor: colors.cardMuted, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  chipActive: { backgroundColor: colors.primary },
  chipText: { color: colors.ink, fontSize: 12, fontWeight: '900', textTransform: 'capitalize' },
  chipTextActive: { color: '#fff' },
  documentRow: { alignItems: 'center', borderTopColor: colors.faint, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md },
  documentBody: { flex: 1 },
  documentTitle: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  documentMeta: { color: colors.muted, fontSize: 12, fontWeight: '800', marginTop: 2 },
  replace: { color: colors.primaryDark, fontSize: 12, fontWeight: '900' },
  actions: { flexDirection: 'row', gap: spacing.md },
  primary: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.pill, flex: 1, padding: spacing.md },
  primaryText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  secondary: { alignItems: 'center', backgroundColor: colors.card, borderRadius: radii.pill, flex: 1, padding: spacing.md },
  secondaryText: { color: colors.ink, fontSize: 14, fontWeight: '900' },
});

export default SellerOnboardingScreen;
