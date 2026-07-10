import React, { useCallback, useEffect, useState } from 'react';
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
import { launchImageLibrary } from 'react-native-image-picker';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { fetchFactoryProfile, saveFactoryProfile, uploadFiles } from '../api/marketplace';
import RemoteImage from '../components/RemoteImage';
import { ErrorState, LoadingState } from '../components/StateViews';

// ─── Types ──────────────────────────────────────────────────────────────────

type FactoryFormData = {
  name: string;
  floorArea: string;
  employeeCount: string;
  productionLines: string;
  machinery: string;
  monthlyCapacity: string;
  annualCapacity: string;
  qualityControl: string;
  description: string;
  capabilities: string[];
  images: string[];
  videos: string[];
  street: string;
  city: string;
  state: string;
  country: string;
  pincode: string;
};

type FactoryProfileResponse = {
  name?: string;
  factoryName?: string;
  floorArea?: string;
  factorySize?: string;
  employeeCount?: number;
  productionLines?: number;
  machinery?: string;
  monthlyCapacity?: string;
  productionCapacity?: string;
  annualCapacity?: string;
  qualityControl?: string;
  description?: string;
  capabilities?: string[] | string;
  images?: string[] | string;
  videos?: string[] | string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    pincode?: string;
  };
  verificationStatus?: string;
  lastDraftSavedAt?: string;
};

type UploadResponse = {
  uploads?: Array<{ url?: string; secure_url?: string; location?: string }>;
  files?: Array<{ url?: string; secure_url?: string; location?: string }>;
  data?: Array<{ url?: string; secure_url?: string; location?: string }>;
  urls?: string[];
};

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
  danger: '#DC2626',
  dangerLight: '#FEF2F2',
  warning: '#D97706',
  warningLight: '#FFFBEB',
};

// ─── Constants ──────────────────────────────────────────────────────────────

const CAPABILITY_OPTIONS = [
  'OEM Manufacturing',
  'ODM Manufacturing',
  'Custom Packaging',
  'Private Label',
  'Export Ready',
  'Quality Testing',
  'R&D Support',
  'Prototyping',
  'CNC Machining',
  'Injection Molding',
  'Assembly Line',
  'Just-in-Time Production',
];

const INITIAL_FORM: FactoryFormData = {
  name: '',
  floorArea: '',
  employeeCount: '',
  productionLines: '',
  machinery: '',
  monthlyCapacity: '',
  annualCapacity: '',
  qualityControl: '',
  description: '',
  capabilities: [],
  images: [],
  videos: [],
  street: '',
  city: '',
  state: '',
  country: 'India',
  pincode: '',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function toArray(value: unknown): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return value.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}

function extractProfile(data: unknown): FactoryProfileResponse | null {
  const raw = data as Record<string, unknown>;
  if (!raw) return null;
  return (raw.factory as FactoryProfileResponse) || (raw as FactoryProfileResponse) || null;
}

function extractUploadUrls(response: unknown): string[] {
  const res = response as UploadResponse;
  const items = res?.uploads ?? res?.files ?? res?.data ?? [];
  if (Array.isArray(items)) {
    return items
      .map((item: Record<string, unknown>) => 
        (item.url ?? item.secure_url ?? item.location) as string
      )
      .filter(Boolean);
  }
  if (Array.isArray(res?.urls)) return res.urls as string[];
  return [];
}

// ─── Component ──────────────────────────────────────────────────────────────

function SellerFactoryScreen() {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FactoryFormData>(INITIAL_FORM);

  // ── Fetch Profile ─────────────────────────────────────────────────────

  const factory = useQuery({
    queryKey: ['seller-factory'],
    queryFn: fetchFactoryProfile,
  });

  useEffect(() => {
    const profile = extractProfile(factory.data);
    if (!profile) return;

    setForm(prev => ({
      ...prev,
      name: profile.name ?? profile.factoryName ?? '',
      floorArea: profile.floorArea ?? profile.factorySize ?? '',
      employeeCount: profile.employeeCount != null ? String(profile.employeeCount) : '',
      productionLines: profile.productionLines != null ? String(profile.productionLines) : '',
      machinery: profile.machinery ?? '',
      monthlyCapacity: profile.monthlyCapacity ?? profile.productionCapacity ?? '',
      annualCapacity: profile.annualCapacity ?? '',
      qualityControl: profile.qualityControl ?? '',
      description: profile.description ?? '',
      capabilities: toArray(profile.capabilities),
      images: toArray(profile.images),
      videos: toArray(profile.videos),
      street: profile.address?.street ?? '',
      city: profile.address?.city ?? '',
      state: profile.address?.state ?? '',
      country: profile.address?.country ?? 'India',
      pincode: profile.address?.pincode ?? '',
    }));
  }, [factory.data]);

  // ── Image Upload ──────────────────────────────────────────────────────

  const pickImages = useCallback(async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        quality: 0.8,
        selectionLimit: Math.max(1, 8 - form.images.length),
      });

      const assets = (result.assets ?? []).filter(a => a.uri);
      if (!assets.length) return;

      const files = assets.map(a => ({
        uri: a.uri as string,
        name: a.fileName ?? `factory-${Date.now()}.jpg`,
        type: a.type ?? 'image/jpeg',
      }));

      setSaving(true);
      const uploaded = await uploadFiles('factory-profiles', files);
      const uploadedUrls = extractUploadUrls(uploaded);

      setForm(prev => ({ ...prev, images: [...prev.images, ...uploadedUrls] }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to upload images.';
      Alert.alert('Upload Failed', message);
    } finally {
      setSaving(false);
    }
  }, [form.images]);

  const removeImage = useCallback((index: number) => {
    setForm(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index),
    }));
  }, []);

  // ── Capabilities ──────────────────────────────────────────────────────

  const toggleCapability = useCallback((cap: string) => {
    setForm(prev => ({
      ...prev,
      capabilities: prev.capabilities.includes(cap)
        ? prev.capabilities.filter(c => c !== cap)
        : [...prev.capabilities, cap],
    }));
  }, []);

  // ── Form Update Helper ────────────────────────────────────────────────

  const updateField = useCallback(<K extends keyof FactoryFormData>(
    key: K,
    value: FactoryFormData[K],
  ) => {
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  // ── Save ──────────────────────────────────────────────────────────────

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        floorArea: form.floorArea,
        employeeCount: Number(form.employeeCount) || 0,
        productionLines: Number(form.productionLines) || 0,
        machinery: form.machinery,
        monthlyCapacity: form.monthlyCapacity,
        annualCapacity: form.annualCapacity,
        qualityControl: form.qualityControl,
        description: form.description,
        capabilities: form.capabilities,
        images: form.images,
        videos: form.videos,
        address: {
          street: form.street,
          city: form.city,
          state: form.state,
          country: form.country,
          pincode: form.pincode,
        },
      };
      return saveFactoryProfile(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-factory'] });
      Alert.alert('✓ Factory Saved', 'Your factory profile has been saved successfully.');
      navigation.goBack();
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unable to save factory profile.';
      Alert.alert('Save Failed', message);
    },
  });

  // ── Loading / Error ───────────────────────────────────────────────────

  if (factory.isLoading) return <LoadingState label="Loading factory profile..." />;
  if (factory.isError)
    return (
      <ErrorState
        message={(factory.error as Error)?.message ?? 'Failed to load'}
        onRetry={() => factory.refetch()}
      />
    );

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={P.bg} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="arrow-left" size={22} color={P.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Factory Profile</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">

        {/* Section 1: Basic Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Factory Information</Text>
          <View style={styles.card}>
            <InputField
              label="Factory Name"
              value={form.name}
              onChangeText={v => updateField('name', v)}
              placeholder="e.g. EsyGlob Manufacturing Unit"
            />
            <InputField
              label="Floor Area"
              value={form.floorArea}
              onChangeText={v => updateField('floorArea', v)}
              placeholder="e.g. 50,000 sq ft"
            />
            <View style={styles.row}>
              <View style={styles.halfField}>
                <InputField
                  label="Employees"
                  value={form.employeeCount}
                  onChangeText={v => updateField('employeeCount', v)}
                  keyboardType="numeric"
                  placeholder="e.g. 120"
                />
              </View>
              <View style={styles.halfField}>
                <InputField
                  label="Production Lines"
                  value={form.productionLines}
                  onChangeText={v => updateField('productionLines', v)}
                  keyboardType="numeric"
                  placeholder="e.g. 5"
                />
              </View>
            </View>
          </View>
        </View>

        {/* Section 2: Manufacturing */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Manufacturing Details</Text>
          <View style={styles.card}>
            <InputField
              label="Machinery & Equipment"
              value={form.machinery}
              onChangeText={v => updateField('machinery', v)}
              multiline
              placeholder="List key machinery and equipment..."
            />
            <View style={styles.row}>
              <View style={styles.halfField}>
                <InputField
                  label="Monthly Capacity"
                  value={form.monthlyCapacity}
                  onChangeText={v => updateField('monthlyCapacity', v)}
                  placeholder="e.g. 10,000 units"
                />
              </View>
              <View style={styles.halfField}>
                <InputField
                  label="Annual Capacity"
                  value={form.annualCapacity}
                  onChangeText={v => updateField('annualCapacity', v)}
                  placeholder="e.g. 120,000 units"
                />
              </View>
            </View>
            <InputField
              label="Quality Control"
              value={form.qualityControl}
              onChangeText={v => updateField('qualityControl', v)}
              multiline
              placeholder="Describe quality control processes..."
            />
            <InputField
              label="Description"
              value={form.description}
              onChangeText={v => updateField('description', v)}
              multiline
              placeholder="Additional factory details, certifications, specializations..."
            />
          </View>
        </View>

        {/* Section 3: Capabilities */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Capabilities</Text>
          <View style={styles.card}>
            <Text style={styles.selectedCount}>
              {form.capabilities.length} selected
            </Text>
            <View style={styles.chips}>
              {CAPABILITY_OPTIONS.map(cap => {
                const active = form.capabilities.includes(cap);
                return (
                  <Pressable
                    key={cap}
                    onPress={() => toggleCapability(cap)}
                    style={[styles.chip, active && styles.chipActive]}>
                    {active && <Icon name="check" size={12} color="#FFF" />}
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {cap}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        {/* Section 4: Address */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Factory Address</Text>
          <View style={styles.card}>
            <InputField
              label="Street Address"
              value={form.street}
              onChangeText={v => updateField('street', v)}
              placeholder="e.g. Plot 42, Industrial Area"
            />
            <View style={styles.row}>
              <View style={styles.halfField}>
                <InputField
                  label="City"
                  value={form.city}
                  onChangeText={v => updateField('city', v)}
                  placeholder="Mumbai"
                />
              </View>
              <View style={styles.halfField}>
                <InputField
                  label="State"
                  value={form.state}
                  onChangeText={v => updateField('state', v)}
                  placeholder="Maharashtra"
                />
              </View>
            </View>
            <View style={styles.row}>
              <View style={styles.halfField}>
                <InputField
                  label="Country"
                  value={form.country}
                  onChangeText={v => updateField('country', v)}
                  placeholder="India"
                />
              </View>
              <View style={styles.halfField}>
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
        </View>

        {/* Section 5: Images */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Factory Images ({form.images.length}/8)
          </Text>
          <View style={styles.card}>
            <View style={styles.imageGrid}>
              {form.images.map((uri, index) => (
                <View key={`${uri}-${index}`} style={styles.imageWrap}>
                  <RemoteImage
                    uri={uri}
                    width={160}
                    height={160}
                    style={styles.image}
                  />
                  <Pressable
                    onPress={() => removeImage(index)}
                    style={styles.removeBtn}>
                    <Icon name="close-circle" size={20} color={P.danger} />
                  </Pressable>
                </View>
              ))}
              {form.images.length < 8 && (
                <Pressable onPress={pickImages} style={styles.addImageBtn}>
                  {saving ? (
                    <ActivityIndicator size="small" color={P.accent} />
                  ) : (
                    <>
                      <Icon name="image-plus" size={28} color={P.accent} />
                      <Text style={styles.addImageText}>Add Photos</Text>
                    </>
                  )}
                </Pressable>
              )}
            </View>
          </View>
        </View>

        {/* Save Button */}
        <Pressable
          onPress={() => save.mutate()}
          disabled={save.isPending}
          style={[styles.saveBtn, save.isPending && styles.saveBtnDisabled]}>
          {save.isPending ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              <Icon name="content-save-outline" size={18} color="#FFF" />
              <Text style={styles.saveBtnText}>Save Factory Profile</Text>
            </>
          )}
        </Pressable>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

// ─── Input Field Component ──────────────────────────────────────────────────

function InputField({
  label,
  ...props
}: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={P.muted}
        style={[styles.input, props.multiline && styles.inputMultiline]}
        {...props}
      />
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  bottomSpacer: { height: 40 },
  screen: {
    flex: 1,
    backgroundColor: P.bg,
  },
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
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: P.text,
    letterSpacing: -0.3,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
  },

  // Sections
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 13,
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

  // Fields
  fieldWrap: {
    marginBottom: 14,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: P.textSecondary,
    marginBottom: 6,
  },
  input: {
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
  inputMultiline: {
    height: 90,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfField: {
    flex: 1,
  },

  // Chips
  selectedCount: {
    fontSize: 12,
    fontWeight: '600',
    color: P.muted,
    marginBottom: 10,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: P.inputBg,
    borderWidth: 1,
    borderColor: P.border,
  },
  chipActive: {
    backgroundColor: P.accent,
    borderColor: P.accent,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: P.textSecondary,
  },
  chipTextActive: {
    color: '#FFF',
  },

  // Images
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  imageWrap: {
    position: 'relative',
  },
  image: {
    width: 100,
    height: 100,
    borderRadius: 10,
    backgroundColor: P.inputBg,
  },
  removeBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: P.surface,
    borderRadius: 12,
  },
  addImageBtn: {
    width: 100,
    height: 100,
    borderRadius: 10,
    backgroundColor: P.inputBg,
    borderWidth: 2,
    borderColor: P.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addImageText: {
    fontSize: 11,
    fontWeight: '600',
    color: P.accent,
  },

  // Save
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: P.primary,
    borderRadius: 14,
    height: 52,
    marginTop: 8,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
});

export default SellerFactoryScreen;
