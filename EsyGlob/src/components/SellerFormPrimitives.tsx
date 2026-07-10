import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors, radii, spacing } from '../theme';

export function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} hitSlop={10} style={styles.backButton}>
        <Icon name="arrow-left" size={22} color={colors.ink} />
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.backButton} />
    </View>
  );
}

export function Card({ title, children }: React.PropsWithChildren<{ title: string }>) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} {...props} style={[styles.input, props.multiline && styles.multiline, props.style]} />
    </View>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
  backButton: { alignItems: 'center', height: 40, justifyContent: 'center', width: 40 },
  headerTitle: { color: colors.ink, fontSize: 20, fontWeight: '900' },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, marginBottom: spacing.md, padding: spacing.lg },
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: '900', marginBottom: spacing.md },
  field: { marginBottom: spacing.md },
  label: { color: colors.ink, fontSize: 12, fontWeight: '800', marginBottom: spacing.xs },
  input: { backgroundColor: colors.background, borderColor: colors.faint, borderRadius: radii.md, borderWidth: 1, color: colors.ink, minHeight: 46, paddingHorizontal: spacing.md },
  multiline: { minHeight: 100, paddingTop: spacing.md, textAlignVertical: 'top' },
  chip: { backgroundColor: colors.background, borderColor: colors.faint, borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.ink, fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: '#fff' },
});
