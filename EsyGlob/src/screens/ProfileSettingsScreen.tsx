import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchProfileSettings, ProfileSettings, updateProfileSettings } from '../api/account';
import { uploadFiles } from '../api/marketplace';
import { useAuth } from '../auth/AuthContext';
import RemoteImage from '../components/RemoteImage';
import { ErrorState, LoadingState } from '../components/StateViews';
import { colors, radii, spacing } from '../theme';

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

function ProfileSettingsScreen() {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { refresh } = useAuth();
  const profile = useQuery({ queryKey: ['profile-settings'], queryFn: fetchProfileSettings });
  const [form, setForm] = useState<ProfileSettings>(initialForm);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (profile.data) {
      setForm({ ...initialForm, ...profile.data });
    }
  }, [profile.data]);

  const save = useMutation({
    mutationFn: () => updateProfileSettings(form),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['profile-settings'] });
      await refresh();
      Alert.alert('Profile updated', 'Your account profile was saved.');
    },
    onError: error => Alert.alert('Profile update failed', error instanceof Error ? error.message : 'Unable to save profile.'),
  });

  const pickAvatar = async () => {
    const result = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1, quality: 0.8 });
    const asset = result.assets?.[0];

    if (!asset?.uri) {
      return;
    }

    try {
      setUploading(true);
      const uploaded = await uploadFiles('profile-photos', [{
        uri: asset.uri,
        name: asset.fileName ?? `profile-${Date.now()}.jpg`,
        type: asset.type ?? 'image/jpeg',
      }]);
      const url = uploaded.uploads?.[0]?.url;
      if (url) {
        setForm(current => ({ ...current, avatarUrl: url }));
      }
    } catch (error) {
      Alert.alert('Upload failed', error instanceof Error ? error.message : 'Unable to upload profile photo.');
    } finally {
      setUploading(false);
    }
  };

  if (profile.isLoading) {
    return <LoadingState label="Loading profile" />;
  }

  if (profile.isError) {
    return <ErrorState message={(profile.error as Error).message} onRetry={() => profile.refetch()} />;
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Header title="Profile Settings" onBack={() => navigation.goBack()} />
      <View style={styles.card}>
        <View style={styles.avatarRow}>
          <RemoteImage uri={form.avatarUrl} width={72} height={72} style={styles.avatar} fallback={<Icon name="account" size={34} color="#fff" />} />
          <View style={styles.avatarCopy}>
            <Text style={styles.cardTitle}>Profile photo</Text>
            <Text style={styles.muted}>JPG, PNG, or WebP. Maximum 5 MB.</Text>
          </View>
          <Pressable onPress={pickAvatar} disabled={uploading} style={styles.iconButton}>
            <Icon name={uploading ? 'loading' : 'camera-outline'} size={22} color={colors.primary} />
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Field label="Name" value={form.fullName} onChangeText={fullName => setForm({ ...form, fullName })} />
        <Field label="Email" value={form.email} keyboardType="email-address" onChangeText={email => setForm({ ...form, email })} />
        <Field label="Phone" value={form.phone} keyboardType="phone-pad" onChangeText={phone => setForm({ ...form, phone })} />
      </View>

      <View style={styles.card}>
        <Field label="Company Name" value={form.companyName} onChangeText={companyName => setForm({ ...form, companyName })} />
        <Field label="Business Type" value={form.businessType} onChangeText={businessType => setForm({ ...form, businessType })} />
        <Field label="Country" value={form.country} onChangeText={country => setForm({ ...form, country })} />
        <Field label="City" value={form.city} onChangeText={city => setForm({ ...form, city })} />
        <Field label="Address" value={form.address} multiline onChangeText={address => setForm({ ...form, address })} />
        <Field label="Company Description" value={form.companyDescription} multiline onChangeText={companyDescription => setForm({ ...form, companyDescription })} />
      </View>

      <Pressable disabled={save.isPending} onPress={() => save.mutate()} style={styles.primary}>
        <Text style={styles.primaryText}>{save.isPending ? 'Saving...' : 'Save Profile'}</Text>
      </Pressable>
    </ScrollView>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} style={styles.back}><Icon name="arrow-left" size={22} color={colors.ink} /></Pressable>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

function Field({ label, value, onChangeText, multiline, keyboardType }: {
  label: string;
  value?: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value ?? ''}
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
  content: { padding: spacing.lg, paddingBottom: 112, paddingTop: spacing.xxl },
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  back: { alignItems: 'center', backgroundColor: colors.card, borderRadius: radii.pill, height: 42, justifyContent: 'center', width: 42 },
  title: { color: colors.ink, fontSize: 22, fontWeight: '900' },
  card: { backgroundColor: colors.card, borderRadius: radii.md, marginBottom: spacing.md, padding: spacing.lg },
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  muted: { color: colors.muted, fontSize: 12, fontWeight: '700', marginTop: spacing.xs },
  avatarRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  avatar: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.pill, justifyContent: 'center' },
  avatarCopy: { flex: 1 },
  iconButton: { alignItems: 'center', backgroundColor: colors.cardMuted, borderRadius: radii.pill, height: 44, justifyContent: 'center', width: 44 },
  field: { marginBottom: spacing.md },
  label: { color: colors.muted, fontSize: 12, fontWeight: '900', marginBottom: spacing.xs, textTransform: 'uppercase' },
  input: { backgroundColor: colors.cardMuted, borderRadius: radii.md, color: colors.ink, fontSize: 15, fontWeight: '700', minHeight: 46, paddingHorizontal: spacing.md },
  textarea: { minHeight: 88, paddingTop: spacing.md, textAlignVertical: 'top' },
  primary: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.pill, paddingVertical: spacing.md },
  primaryText: { color: '#fff', fontWeight: '900' },
});

export default ProfileSettingsScreen;
