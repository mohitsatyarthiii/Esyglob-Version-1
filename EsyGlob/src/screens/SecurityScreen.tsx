import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useMutation } from '@tanstack/react-query';
import { changePassword } from '../api/account';
import { useAuth } from '../auth/AuthContext';
import { colors, radii, spacing } from '../theme';

function SecurityScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const strength = useMemo(() => passwordStrength(form.newPassword), [form.newPassword]);

  const save = useMutation({
    mutationFn: () => changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword }),
    onSuccess: () => {
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      Alert.alert('Password updated', 'Your password was changed successfully.');
    },
    onError: error => Alert.alert('Password change failed', error instanceof Error ? error.message : 'Unable to change password.'),
  });

  const submit = () => {
    if (form.newPassword !== form.confirmPassword) {
      Alert.alert('Passwords do not match', 'New password and confirmation must match.');
      return;
    }
    if (strength < 3) {
      Alert.alert('Use a stronger password', 'Use at least 8 characters with letters and numbers.');
      return;
    }
    save.mutate();
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}><Icon name="arrow-left" size={22} color={colors.ink} /></Pressable>
        <Text style={styles.title}>Security</Text>
      </View>

      <View style={styles.card}>
        <Info label="Account" value={user?.email ?? '-'} />
        <Info label="Primary role" value={user?.activeRole ?? user?.roles?.[0] ?? '-'} />
        <Info label="Session" value="Active on this device" />
        <Text style={styles.note}>Logout from all devices, device management, OTP, 2FA, and email or phone verification are not available in the current backend.</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.cardTitle}>Change Password</Text>
          <Pressable onPress={() => setVisible(!visible)} style={styles.iconButton}>
            <Icon name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.primary} />
          </Pressable>
        </View>
        <Field label="Current Password" value={form.currentPassword} secure={!visible} onChangeText={currentPassword => setForm({ ...form, currentPassword })} />
        <Field label="New Password" value={form.newPassword} secure={!visible} onChangeText={newPassword => setForm({ ...form, newPassword })} />
        <View style={styles.strengthTrack}><View style={[styles.strengthFill, { width: `${strength * 25}%` }]} /></View>
        <Field label="Confirm Password" value={form.confirmPassword} secure={!visible} onChangeText={confirmPassword => setForm({ ...form, confirmPassword })} />
      </View>

      <Pressable disabled={save.isPending} onPress={submit} style={styles.primary}>
        <Text style={styles.primaryText}>{save.isPending ? 'Saving...' : 'Update Password'}</Text>
      </Pressable>
    </ScrollView>
  );
}

function passwordStrength(value: string) {
  return [
    value.length >= 8,
    /[a-z]/i.test(value),
    /\d/.test(value),
    /[^a-z0-9]/i.test(value),
  ].filter(Boolean).length;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function Field({ label, value, onChangeText, secure }: { label: string; value: string; onChangeText: (value: string) => void; secure: boolean }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} secureTextEntry={secure} style={styles.input} placeholderTextColor={colors.muted} />
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
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  iconButton: { alignItems: 'center', backgroundColor: colors.cardMuted, borderRadius: radii.pill, height: 38, justifyContent: 'center', width: 38 },
  note: { color: colors.muted, fontSize: 12, fontWeight: '700', lineHeight: 18, marginTop: spacing.md },
  infoRow: { borderBottomColor: colors.faint, borderBottomWidth: 1, paddingVertical: spacing.sm },
  infoLabel: { color: colors.muted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  infoValue: { color: colors.ink, fontSize: 15, fontWeight: '900', marginTop: spacing.xs },
  field: { marginBottom: spacing.md },
  label: { color: colors.muted, fontSize: 12, fontWeight: '900', marginBottom: spacing.xs, textTransform: 'uppercase' },
  input: { backgroundColor: colors.cardMuted, borderRadius: radii.md, color: colors.ink, fontSize: 15, fontWeight: '700', minHeight: 46, paddingHorizontal: spacing.md },
  strengthTrack: { backgroundColor: colors.cardMuted, borderRadius: radii.pill, height: 6, marginBottom: spacing.md, overflow: 'hidden' },
  strengthFill: { backgroundColor: colors.green, height: 6 },
  primary: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.pill, paddingVertical: spacing.md },
  primaryText: { color: '#fff', fontWeight: '900' },
});

export default SecurityScreen;
