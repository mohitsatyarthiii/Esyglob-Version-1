import React, { useEffect, useState } from 'react';
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
import { fetchProfileSettings, ProfileSettings, updateProfileSettings } from '../api/account';
import { uploadFiles } from '../api/marketplace';
import { useAuth } from '../auth/AuthContext';
import RemoteImage from '../components/RemoteImage';
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
  danger: '#DC2626',
};

const initialForm: ProfileSettings = {
  fullName: '',
  companyName: '',
  email: '',
  phone: '',
  avatarUrl: '',
  country: '',
  city: '',
  address: '',
  businessType: '',
  companyDescription: '',
};

// ─── Component ──────────────────────────────────────────────────────────────

function ProfileSettingsScreen() {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { refresh } = useAuth();
  const [form, setForm] = useState<ProfileSettings>(initialForm);
  const [uploading, setUploading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const profile = useQuery({
    queryKey: ['profile-settings'],
    queryFn: fetchProfileSettings,
  });

  useEffect(() => {
    if (profile.data) {
      const merged = { ...initialForm, ...profile.data };
      setForm(merged);
      setHasChanges(false);
    }
  }, [profile.data]);

  const updateField = (key: keyof ProfileSettings, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const save = useMutation({
    mutationFn: () => updateProfileSettings(form),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['profile-settings'] });
      await refresh();
      setHasChanges(false);
      Alert.alert('✓ Profile Updated', 'Your profile has been saved successfully.');
    },
    onError: (error: unknown) =>
      Alert.alert(
        'Update Failed',
        error instanceof Error ? error.message : 'Unable to save profile.',
      ),
  });

  const pickAvatar = async () => {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      quality: 0.8,
    });
    const asset = result.assets?.[0];
    if (!asset?.uri) return;

    try {
      setUploading(true);
      const uploaded = await uploadFiles('profile-photos', [
        {
          uri: asset.uri,
          name: asset.fileName ?? `profile-${Date.now()}.jpg`,
          type: asset.type ?? 'image/jpeg',
        },
      ]);
      const newUrl =
        uploaded?.uploads?.[0]?.url ??
        uploaded?.files?.[0]?.url ??
        (uploaded as any)?.data?.[0]?.url;

      if (newUrl) {
        updateField('avatarUrl', newUrl);
      }
    } catch (error: unknown) {
      Alert.alert(
        'Upload Failed',
        error instanceof Error ? error.message : 'Unable to upload photo.',
      );
    } finally {
      setUploading(false);
    }
  };

  const removeAvatar = () => {
    updateField('avatarUrl', '');
  };

  if (profile.isLoading) return <LoadingState label="Loading profile..." />;
  if (profile.isError)
    return (
      <ErrorState
        message={(profile.error as Error)?.message ?? 'Failed to load'}
        onRetry={() => profile.refetch()}
      />
    );

  const hasAvatar = Boolean(form.avatarUrl);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={P.bg} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="arrow-left" size={22} color={P.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Profile Settings</Text>
        <Pressable
          onPress={() => hasChanges && save.mutate()}
          disabled={!hasChanges || save.isPending}
          style={[styles.saveBtn, hasChanges && styles.saveBtnActive]}>
          {save.isPending ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Text style={[styles.saveBtnText, hasChanges && styles.saveBtnTextActive]}>
              Save
            </Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">

        {/* Avatar Section */}
        <View style={styles.avatarSection}>
          <Pressable onPress={pickAvatar} disabled={uploading} style={styles.avatarWrap}>
            {hasAvatar ? (
              <RemoteImage
                uri={form.avatarUrl}
                width={160}
                height={160}
                style={styles.avatar}
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Icon name="account" size={40} color={P.muted} />
              </View>
            )}
            <View style={styles.avatarOverlay}>
              {uploading ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Icon name="camera" size={20} color="#FFF" />
              )}
            </View>
          </Pressable>

          <Text style={styles.avatarTitle}>
            {hasAvatar ? (form.fullName || 'User') : 'Add Photo'}
          </Text>
          <Text style={styles.avatarSubtitle}>
            {hasAvatar ? 'Tap to change profile photo' : 'JPG, PNG or WebP. Max 5MB'}
          </Text>

          {hasAvatar && (
            <Pressable onPress={removeAvatar} style={styles.removePhotoBtn}>
              <Icon name="trash-can-outline" size={14} color={P.danger} />
              <Text style={styles.removePhotoText}>Remove photo</Text>
            </Pressable>
          )}
        </View>

        {/* Personal Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal Information</Text>
          <View style={styles.card}>
            <InputField
              label="Full Name"
              value={form.fullName}
              onChangeText={v => updateField('fullName', v)}
              placeholder="Enter your name"
              icon="account-outline"
            />
            <InputField
              label="Email"
              value={form.email}
              onChangeText={v => updateField('email', v)}
              keyboardType="email-address"
              placeholder="your@email.com"
              icon="email-outline"
            />
            <InputField
              label="Phone"
              value={form.phone}
              onChangeText={v => updateField('phone', v)}
              keyboardType="phone-pad"
              placeholder="+91 9876543210"
              icon="phone-outline"
            />
          </View>
        </View>

        {/* Business Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Business Information</Text>
          <View style={styles.card}>
            <InputField
              label="Company Name"
              value={form.companyName}
              onChangeText={v => updateField('companyName', v)}
              placeholder="Your company"
              icon="office-building-outline"
            />
            <InputField
              label="Business Type"
              value={form.businessType}
              onChangeText={v => updateField('businessType', v)}
              placeholder="e.g. Manufacturer, Trader"
              icon="briefcase-outline"
            />
            <InputField
              label="Country"
              value={form.country}
              onChangeText={v => updateField('country', v)}
              placeholder="India"
              icon="earth"
            />
            <InputField
              label="City"
              value={form.city}
              onChangeText={v => updateField('city', v)}
              placeholder="Mumbai"
              icon="city"
            />
            <InputField
              label="Address"
              value={form.address}
              onChangeText={v => updateField('address', v)}
              multiline
              placeholder="Street address..."
              icon="map-marker-outline"
            />
            <InputField
              label="Company Description"
              value={form.companyDescription}
              onChangeText={v => updateField('companyDescription', v)}
              multiline
              placeholder="Tell buyers about your company..."
              icon="text-box-outline"
            />
          </View>
        </View>

        {/* Save Button (Bottom) */}
        <Pressable
          onPress={() => save.mutate()}
          disabled={!hasChanges || save.isPending}
          style={[styles.bottomSave, (!hasChanges || save.isPending) && styles.bottomSaveDisabled]}>
          {save.isPending ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              <Icon name="content-save-outline" size={18} color="#FFF" />
              <Text style={styles.bottomSaveText}>Save Changes</Text>
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
  icon,
  ...props
}: {
  label: string;
  icon: string;
} & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <Icon name={icon} size={18} color={P.muted} style={styles.inputIcon} />
        <TextInput
          placeholderTextColor={P.muted}
          style={[styles.input, props.multiline && styles.inputMultiline]}
          {...props}
        />
      </View>
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
  saveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: P.inputBg,
  },
  saveBtnActive: {
    backgroundColor: P.accent,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: P.muted,
  },
  saveBtnTextActive: {
    color: '#FFF',
  },
  content: {
    padding: 16,
  },

  // Avatar
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: 12,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 32,
    backgroundColor: P.inputBg,
  },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 32,
    backgroundColor: P.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: P.border,
    borderStyle: 'dashed',
  },
  avatarOverlay: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: P.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: P.surface,
  },
  avatarTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: P.text,
  },
  avatarSubtitle: {
    fontSize: 12,
    color: P.muted,
    marginTop: 4,
  },
  removePhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
  },
  removePhotoText: {
    fontSize: 11,
    fontWeight: '600',
    color: P.danger,
  },

  // Sections
  section: {
    marginBottom: 20,
  },
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
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: P.inputBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: P.border,
  },
  inputIcon: {
    marginLeft: 12,
  },
  input: {
    flex: 1,
    paddingHorizontal: 10,
    height: 46,
    fontSize: 14,
    fontWeight: '500',
    color: P.text,
  },
  inputMultiline: {
    height: 90,
    paddingTop: 12,
    textAlignVertical: 'top',
  },

  // Bottom Save
  bottomSave: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: P.primary,
    borderRadius: 14,
    height: 52,
    marginTop: 8,
  },
  bottomSaveDisabled: {
    opacity: 0.5,
  },
  bottomSaveText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
});

export default ProfileSettingsScreen;
