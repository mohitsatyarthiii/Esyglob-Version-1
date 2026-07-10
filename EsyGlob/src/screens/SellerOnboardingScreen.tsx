import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { pick, types as documentTypes } from '@react-native-documents/picker';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  fetchSellerOnboarding,
  saveSellerOnboarding,
  uploadSellerDocument,
} from '../api/marketplace';
import { ErrorState, LoadingState } from '../components/StateViews';

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
  success: '#059669',
  successLight: '#ECFDF5',
  warning: '#D97706',
  warningLight: '#FFFBEB',
  danger: '#DC2626',
  dangerLight: '#FEF2F2',
};

// ─── Constants ──────────────────────────────────────────────────────────────

const COMPANY_TYPES = [
  { key: 'manufacturer', label: 'Manufacturer', icon: 'factory' },
  { key: 'wholesaler', label: 'Wholesaler', icon: 'package-variant' },
  { key: 'distributor', label: 'Distributor', icon: 'truck-delivery' },
  { key: 'trader', label: 'Trader', icon: 'handshake' },
  { key: 'exporter', label: 'Exporter', icon: 'ship' },
  { key: 'other', label: 'Other', icon: 'dots-horizontal' },
];

const REQUIRED_DOCUMENTS = [
  { type: 'gst_certificate', label: 'GST Certificate', icon: 'file-document' },
  { type: 'pan_card', label: 'PAN Card', icon: 'card-account-details' },
  { type: 'business_registration', label: 'Business Registration', icon: 'certificate' },
  { type: 'address_proof', label: 'Address Proof', icon: 'home' },
  { type: 'bank_statement', label: 'Bank Statement', icon: 'bank' },
  { type: 'government_id', label: 'Owner ID Proof', icon: 'id-card' },
];

// ─── Types ──────────────────────────────────────────────────────────────────

type FormData = {
  companyName: string;
  companyType: string;
  businessEmail: string;
  businessPhone: string;
  gstNumber: string;
  panNumber: string;
  street: string;
  city: string;
  state: string;
  country: string;
  pincode: string;
};

const EMPTY_FORM: FormData = {
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
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildPayload(data: FormData) {
  return {
    companyName: data.companyName,
    companyType: data.companyType,
    businessEmail: data.businessEmail,
    businessPhone: data.businessPhone,
    gstNumber: data.gstNumber,
    panNumber: data.panNumber,
    address: {
      street: data.street,
      city: data.city,
      state: data.state,
      country: data.country,
      pincode: data.pincode,
    },
  };
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'approved':
    case 'verified':
      return P.success;
    case 'pending':
    case 'document_submitted':
    case 'under_review':
      return P.warning;
    case 'rejected':
      return P.danger;
    default:
      return P.muted;
  }
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'approved':
    case 'verified':
      return 'check-decagram';
    case 'rejected':
      return 'alert-circle';
    default:
      return 'clock-outline';
  }
}

function getStepStatus(step: number, current: number): 'done' | 'active' | 'pending' {
  if (step < current) return 'done';
  if (step === current) return 'active';
  return 'pending';
}

// ─── Component ──────────────────────────────────────────────────────────────

function SellerOnboardingScreen() {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [uploading, setUploading] = useState<string>('');
  const [currentStep, setCurrentStep] = useState(1);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydrated = useRef(false);
  const userEdited = useRef(false);

  const onboarding = useQuery({
    queryKey: ['seller-onboarding'],
    queryFn: fetchSellerOnboarding,
  });

  // ── Populate existing data ─────────────────────────────────────────────

  useEffect(() => {
    const seller = onboarding.data?.seller as Record<string, any> | undefined;
    if (!seller || hydrated.current) return;

    setForm({
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
    });

    hydrated.current = true;
    const completion = onboarding.data?.completion as Record<string, any> | undefined;
    if (completion) {
      const pct =
        (completion.completedFieldCount ?? 0) /
        Math.max(completion.totalFieldCount ?? 9, 1);
      if (pct >= 0.9) setCurrentStep(3);
      else if (pct >= 0.3) setCurrentStep(2);
      else setCurrentStep(1);
    }
  }, [onboarding.data]);

  // ── Fade in ────────────────────────────────────────────────────────────

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  // ── Save mutation ──────────────────────────────────────────────────────

  const save = useMutation({
  mutationFn: async (draft: boolean) => {
    return saveSellerOnboarding(buildPayload(form), !draft);
  },
  onSuccess: async (_result: unknown, draft: boolean) => {
    userEdited.current = false;
    if (!draft) {
      await queryClient.invalidateQueries({ queryKey: ['seller-onboarding'] });
      Alert.alert('✓ Submitted!', 'Your business setup has been submitted for verification.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    }
  },
  onError: (error: unknown) =>
    Alert.alert('Save Failed', error instanceof Error ? error.message : 'Unable to save.'),
});
  const saveDraftRef = useRef(save.mutate);
  useEffect(() => {
    saveDraftRef.current = save.mutate;
  }, [save.mutate]);
  // ── Auto-save draft ────────────────────────────────────────────────────

  useEffect(() => {
    if (!hydrated.current || !userEdited.current) return;

    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
    }

    autoSaveTimer.current = setTimeout(() => {
      saveDraftRef.current(true);
    }, 1500);

    return () => {
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
      }
    };
  }, [form]);

  // ── Document Upload ────────────────────────────────────────────────────

  const handleUpload = useCallback(
    async (documentType: string) => {
      try {
        const [file] = await pick({
          allowMultiSelection: false,
          type: [documentTypes.pdf, documentTypes.images],
        });
        if (!file?.uri) return;

        setUploading(documentType);
        await uploadSellerDocument(documentType, {
          uri: file.uri,
          name: file.name ?? `${documentType}.pdf`,
          type: file.type ?? 'application/octet-stream',
        });
        await queryClient.invalidateQueries({ queryKey: ['seller-onboarding'] });
      } catch (error: unknown) {
        const err = error as { code?: string };
        if (err.code !== 'OPERATION_CANCELED') {
          Alert.alert(
            'Upload Failed',
            error instanceof Error ? error.message : 'Unable to upload.',
          );
        }
      } finally {
        setUploading('');
      }
    },
    [queryClient],
  );

  const updateField = useCallback((key: keyof FormData, value: string) => {
    userEdited.current = true;
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  // ── Loading / Error ────────────────────────────────────────────────────

  if (onboarding.isLoading) return <LoadingState label="Loading setup..." />;
  if (onboarding.isError)
    return (
      <ErrorState
        message={(onboarding.error as Error)?.message ?? 'Failed to load'}
        onRetry={() => onboarding.refetch()}
      />
    );

  const verification = (onboarding.data?.verification ?? {}) as Record<string, any>;
  const completion = (onboarding.data?.completion ?? {}) as Record<string, any>;
  const existingDocs: Array<{ documentType: string; status: string; url?: string }> =
    verification?.documents ?? [];
  const verifStatus: string = verification?.status ?? 'pending';

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={P.bg} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="arrow-left" size={22} color={P.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Business Setup</Text>
        <Pressable
          onPress={() => save.mutate(true)}
          disabled={save.isPending}
          style={styles.headerSaveBtn}>
          {save.isPending ? (
            <ActivityIndicator size="small" color={P.accent} />
          ) : (
            <Text style={styles.headerSaveText}>Save</Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        <Animated.View style={{ opacity: fadeAnim }}>
          {/* Status Banner */}
          <View
            style={[
              styles.statusBanner,
              { backgroundColor: getStatusColor(verifStatus) + '15' },
            ]}>
            <Icon
              name={getStatusIcon(verifStatus)}
              size={24}
              color={getStatusColor(verifStatus)}
            />
            <View style={styles.statusInfo}>
              <Text
                style={[styles.statusTitle, { color: getStatusColor(verifStatus) }]}>
                {verifStatus
                  .replace(/_/g, ' ')
                  .replace(/\b\w/g, c => c.toUpperCase())}
              </Text>
              <Text style={styles.statusMeta}>
                {completion?.completedFieldCount ?? 0}/{completion?.totalFieldCount ?? 9}{' '}
                fields · {existingDocs.length}/{REQUIRED_DOCUMENTS.length} documents
              </Text>
            </View>
            <View style={styles.completionRing}>
              <Text style={styles.completionPercent}>
                {Math.round(
                  ((completion?.completedFieldCount ?? 0) /
                    Math.max(completion?.totalFieldCount ?? 9, 1)) *
                    100,
                )}
                %
              </Text>
            </View>
          </View>

          {/* Steps Indicator */}
          <View style={styles.stepsRow}>
            {['Company', 'Address', 'Documents'].map((label, i) => {
              const stepNum = i + 1;
              const status = getStepStatus(stepNum, currentStep);
              return (
                <View key={label} style={styles.stepItem}>
                  <View
                    style={[
                      styles.stepCircle,
                      status === 'done' && styles.stepDone,
                      status === 'active' && styles.stepActive,
                    ]}>
                    {status === 'done' ? (
                      <Icon name="check" size={14} color="#FFF" />
                    ) : (
                      <Text
                        style={[
                          styles.stepNum,
                          status === 'active' && styles.stepNumActive,
                        ]}>
                        {stepNum}
                      </Text>
                    )}
                  </View>
                  <Text
                    style={[
                      styles.stepLabel,
                      status === 'active' && styles.stepLabelActive,
                    ]}>
                    {label}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Step 1: Company Details */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Company Details</Text>

            <InputField
              label="Company Name"
              value={form.companyName}
              onChangeText={v => updateField('companyName', v)}
              placeholder="Your registered company name"
            />

            <Text style={styles.fieldLabel}>Company Type</Text>
            <View style={styles.typeGrid}>
              {COMPANY_TYPES.map(type => {
                const active = form.companyType === type.key;
                return (
                  <Pressable
                    key={type.key}
                    onPress={() => updateField('companyType', type.key)}
                    style={[styles.typeCard, active && styles.typeCardActive]}>
                    <Icon
                      name={type.icon}
                      size={20}
                      color={active ? P.accent : P.muted}
                    />
                    <Text
                      style={[styles.typeLabel, active && styles.typeLabelActive]}>
                      {type.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <InputField
              label="Business Email"
              value={form.businessEmail}
              onChangeText={v => updateField('businessEmail', v)}
              keyboardType="email-address"
              placeholder="business@company.com"
            />
            <InputField
              label="Business Phone"
              value={form.businessPhone}
              onChangeText={v => updateField('businessPhone', v)}
              keyboardType="phone-pad"
              placeholder="+91 9876543210"
            />
            <InputField
              label="GST Number"
              value={form.gstNumber}
              onChangeText={v => updateField('gstNumber', v)}
              placeholder="22AAAAA0000A1Z5"
            />
            <InputField
              label="PAN Number"
              value={form.panNumber}
              onChangeText={v => updateField('panNumber', v)}
              placeholder="AAAAA0000A"
            />
          </View>

          {/* Step 2: Address */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Business Address</Text>
            <InputField
              label="Street Address"
              value={form.street}
              onChangeText={v => updateField('street', v)}
              placeholder="Plot 42, Industrial Area"
            />
            <View style={styles.row}>
              <View style={styles.half}>
                <InputField
                  label="City"
                  value={form.city}
                  onChangeText={v => updateField('city', v)}
                  placeholder="Mumbai"
                />
              </View>
              <View style={styles.half}>
                <InputField
                  label="State"
                  value={form.state}
                  onChangeText={v => updateField('state', v)}
                  placeholder="Maharashtra"
                />
              </View>
            </View>
            <View style={styles.row}>
              <View style={styles.half}>
                <InputField
                  label="Country"
                  value={form.country}
                  onChangeText={v => updateField('country', v)}
                  placeholder="India"
                />
              </View>
              <View style={styles.half}>
                <InputField
                  label="Pincode"
                  value={form.pincode}
                  onChangeText={v => updateField('pincode', v)}
                  keyboardType="numeric"
                  placeholder="400001"
                />
              </View>
            </View>
          </View>

          {/* Step 3: Documents */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Required Documents</Text>
            <Text style={styles.cardSubtitle}>
              Upload clear copies. PDF, JPG or PNG up to 5MB.
            </Text>

            {REQUIRED_DOCUMENTS.map(doc => {
              const existing = existingDocs.find(
                (d: Record<string, any>) => d.documentType === doc.type,
              );
              const isUploaded = Boolean(existing);
              const uploadStatus: string = existing?.status ?? 'pending';

              return (
                <Pressable
                  key={doc.type}
                  onPress={() => handleUpload(doc.type)}
                  disabled={uploading === doc.type}
                  style={styles.docRow}>
                  <View
                    style={[
                      styles.docIcon,
                      {
                        backgroundColor: isUploaded
                          ? P.successLight
                          : P.accentLight,
                      },
                    ]}>
                    {uploading === doc.type ? (
                      <ActivityIndicator size="small" color={P.accent} />
                    ) : (
                      <Icon
                        name={isUploaded ? 'file-check' : doc.icon}
                        size={20}
                        color={isUploaded ? P.success : P.accent}
                      />
                    )}
                  </View>
                  <View style={styles.docInfo}>
                    <Text style={styles.docLabel}>{doc.label}</Text>
                    <Text style={styles.docStatus}>
                      {uploading === doc.type
                        ? 'Uploading...'
                        : isUploaded
                        ? uploadStatus.replace(/_/g, ' ')
                        : 'Tap to upload'}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.docAction,
                      {
                        backgroundColor: isUploaded
                          ? P.successLight
                          : P.inputBg,
                      },
                    ]}>
                    <Text
                      style={[
                        styles.docActionText,
                        { color: isUploaded ? P.success : P.accent },
                      ]}>
                      {isUploaded ? 'Replace' : 'Upload'}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable
              onPress={() => save.mutate(true)}
              disabled={save.isPending}
              style={styles.draftBtn}>
              <Icon name="content-save-outline" size={16} color={P.textSecondary} />
              <Text style={styles.draftBtnText}>Save Draft</Text>
            </Pressable>
            <Pressable
              onPress={() => save.mutate(false)}
              disabled={save.isPending}
              style={styles.submitBtn}>
              {save.isPending ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Icon name="check-circle" size={16} color="#FFF" />
                  <Text style={styles.submitBtnText}>Submit for Verification</Text>
                </>
              )}
            </Pressable>
          </View>

          <View style={styles.bottomSpacer} />
        </Animated.View>
      </ScrollView>
    </View>
  );
}

// ─── Input Field ────────────────────────────────────────────────────────────

function InputField({
  label,
  ...props
}: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
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
  headerSaveBtn: { paddingHorizontal: 14, paddingVertical: 8 },
  headerSaveText: { fontSize: 14, fontWeight: '600', color: P.accent },
  content: { padding: 16 },

  // Status Banner
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  statusInfo: { flex: 1 },
  statusTitle: { fontSize: 15, fontWeight: '700', textTransform: 'capitalize' },
  statusMeta: { fontSize: 11, color: P.textSecondary, marginTop: 2 },
  completionRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: P.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completionPercent: { fontSize: 11, fontWeight: '800', color: P.text },

  // Steps
  stepsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    marginBottom: 20,
    paddingVertical: 8,
  },
  stepItem: { alignItems: 'center', gap: 6 },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: P.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: P.border,
  },
  stepDone: { backgroundColor: P.success, borderColor: P.success },
  stepActive: { backgroundColor: P.accent, borderColor: P.accent },
  stepNum: { fontSize: 13, fontWeight: '700', color: P.muted },
  stepNumActive: { color: '#FFF' },
  stepLabel: { fontSize: 11, fontWeight: '500', color: P.muted },
  stepLabelActive: { fontWeight: '700', color: P.accent },

  // Card
  card: {
    backgroundColor: P.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: P.border,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: P.text, marginBottom: 14 },
  cardSubtitle: { fontSize: 11, color: P.muted, marginBottom: 14 },

  // Fields
  fieldWrap: { marginBottom: 12 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: P.textSecondary,
    marginBottom: 4,
  },
  fieldInput: {
    backgroundColor: P.inputBg,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 13,
    fontWeight: '500',
    color: P.text,
    borderWidth: 1,
    borderColor: P.border,
  },
  fieldTextarea: { height: 80, paddingTop: 12, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },

  // Company Types
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  typeCard: {
    width: '30%',
    alignItems: 'center',
    gap: 6,
    backgroundColor: P.inputBg,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: P.border,
  },
  typeCardActive: { backgroundColor: P.accentLight, borderColor: P.accent },
  typeLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: P.muted,
    textAlign: 'center',
  },
  typeLabelActive: { color: P.accent },

  // Documents
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: P.border,
  },
  docIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docInfo: { flex: 1 },
  docLabel: { fontSize: 13, fontWeight: '600', color: P.text },
  docStatus: {
    fontSize: 10,
    color: P.muted,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  docAction: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  docActionText: { fontSize: 10, fontWeight: '600' },

  // Actions
  actions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  draftBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: P.inputBg,
    borderRadius: 14,
    height: 50,
    borderWidth: 1,
    borderColor: P.border,
  },
  draftBtnText: { fontSize: 13, fontWeight: '600', color: P.textSecondary },
  submitBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: P.primary,
    borderRadius: 14,
    height: 50,
  },
  submitBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
});

export default SellerOnboardingScreen;
