import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createServiceBooking, getServiceByKey, ServiceField } from '../api/services';
import { useAuth } from '../auth/AuthContext';
import { colors, radii, spacing } from '../theme';
import { RootStackParamList } from '../../App';

function ServiceBookingScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, 'ServiceBooking'>>();
  const queryClient = useQueryClient();
  const { activeRole } = useAuth();
  const service = getServiceByKey(route.params.serviceKey);
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(service?.fields ?? []));
  const [step, setStep] = useState(0);
  const steps = useMemo(() => groupFieldsByWorkflow(service), [service]);
  const currentFields = steps[step] ?? [];
  const mutation = useMutation({
    mutationFn: () => {
      if (!service) {
        throw new Error('Service was not found.');
      }
      return createServiceBooking(service, activeRole === 'seller' ? 'seller' : 'buyer', values);
    },
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: ['service-activity'] });
      Alert.alert('Service submitted', 'Your booking request has been sent for review.');
      navigation.replace('BookedServiceDetails', { request: data });
    },
  });

  if (!service) {
    return <View style={styles.screen}><Header title="Book service" /></View>;
  }

  const missingRequired = currentFields.fields.some(field => field.required && !values[field.key]?.trim());
  const isLastStep = step === steps.length - 1;

  const submit = () => {
    const missing = service.fields.filter(field => field.required && !values[field.key]?.trim());
    if (missing.length) {
      Alert.alert('Missing details', `Please complete ${missing[0].label}.`);
      return;
    }
    mutation.mutate();
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <Header title={service.title} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.progressRow}>
          {steps.map((_, index) => <View key={index} style={[styles.stepDot, index <= step && styles.stepDotActive]} />)}
        </View>
        <Text style={styles.stepLabel}>Step {step + 1} of {steps.length}</Text>
        <Text style={styles.title}>{currentFields.title}</Text>
        <Text style={styles.subtitle}>{service.shortDescription}</Text>
        <View style={styles.formCard}>
          {currentFields.fields.map(field => (
            <FieldInput key={field.key} field={field} value={values[field.key] ?? ''} onChange={value => setValues(current => ({ ...current, [field.key]: value }))} />
          ))}
        </View>
        {mutation.isError ? <Text style={styles.error}>{(mutation.error as Error)?.message ?? 'Could not submit service.'}</Text> : null}
      </ScrollView>
      <View style={styles.footer}>
        {step > 0 ? (
          <Pressable onPress={() => setStep(current => Math.max(current - 1, 0))} style={styles.secondaryButton}>
            <Icon name="arrow-left" size={19} color={colors.ink} />
            <Text style={styles.secondaryText}>Back</Text>
          </Pressable>
        ) : null}
        <Pressable
          disabled={mutation.isPending || missingRequired}
          onPress={() => isLastStep ? submit() : setStep(current => current + 1)}
          style={[styles.primaryButton, (mutation.isPending || missingRequired) && styles.buttonDisabled]}>
          {mutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{isLastStep ? 'Submit Booking' : 'Continue'}</Text>}
          {!mutation.isPending ? <Icon name={isLastStep ? 'send' : 'arrow-right'} size={19} color="#fff" /> : null}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Header({ title }: { title: string }) {
  const navigation = useNavigation<any>();
  return (
    <View style={styles.header}>
      <Pressable onPress={() => navigation.goBack()} style={styles.iconButton}><Icon name="arrow-left" size={24} color={colors.ink} /></Pressable>
      <Text numberOfLines={1} style={styles.headerTitle}>{title}</Text>
      <View style={styles.iconButton} />
    </View>
  );
}

function FieldInput({ field, value, onChange }: { field: ServiceField; value: string; onChange: (value: string) => void }) {
  if (field.type === 'select' && field.options?.length) {
    return (
      <View style={styles.field}>
        <Text style={styles.label}>{field.label}{field.required ? ' *' : ''}</Text>
        <View style={styles.optionWrap}>
          {field.options.map(option => (
            <Pressable key={option} onPress={() => onChange(option)} style={[styles.optionChip, value === option && styles.optionChipActive]}>
              <Text style={[styles.optionText, value === option && styles.optionTextActive]}>{option.replace(/_/g, ' ')}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{field.label}{field.required ? ' *' : ''}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={field.placeholder ?? field.label}
        placeholderTextColor={colors.muted}
        keyboardType={field.type === 'number' ? 'numeric' : field.type === 'email' ? 'email-address' : field.type === 'phone' ? 'phone-pad' : 'default'}
        multiline={field.type === 'textarea'}
        style={[styles.input, field.type === 'textarea' && styles.textarea]}
      />
    </View>
  );
}

function initialValues(fields: ServiceField[]) {
  return fields.reduce<Record<string, string>>((acc, field) => {
    acc[field.key] = field.options?.[0] ?? '';
    return acc;
  }, {});
}

function groupFieldsByWorkflow(service?: { fields: ServiceField[]; workflowSteps?: string[] }) {
  const fields = service?.fields ?? [];
  const workflowSteps = service?.workflowSteps?.length
    ? service.workflowSteps
    : Array.from(new Set(fields.map(field => field.step).filter(Boolean) as string[]));

  if (workflowSteps.length) {
    const hasFieldSteps = fields.some(field => field.step);
    const chunkSize = Math.max(1, Math.ceil(fields.length / workflowSteps.length));

    return workflowSteps.map(title => ({
      title,
      fields: hasFieldSteps
        ? fields.filter(field => field.step === title || (!field.step && title === workflowSteps[0]))
        : fields.slice(workflowSteps.indexOf(title) * chunkSize, workflowSteps.indexOf(title) * chunkSize + chunkSize),
    })).filter(group => group.fields.length);
  }

  return [{ title: 'Service requirements', fields }];
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  header: { alignItems: 'center', backgroundColor: colors.card, borderBottomColor: colors.faint, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', paddingBottom: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.xxl },
  iconButton: { alignItems: 'center', height: 42, justifyContent: 'center', width: 42 },
  headerTitle: { color: colors.ink, flex: 1, fontSize: 17, fontWeight: '900', textAlign: 'center' },
  content: { padding: spacing.lg, paddingBottom: 118 },
  progressRow: { flexDirection: 'row', gap: spacing.sm },
  stepDot: { backgroundColor: colors.faint, borderRadius: radii.pill, flex: 1, height: 5 },
  stepDotActive: { backgroundColor: colors.primary },
  stepLabel: { color: colors.primaryDark, fontSize: 12, fontWeight: '900', marginTop: spacing.lg, textTransform: 'uppercase' },
  title: { color: colors.ink, fontSize: 23, fontWeight: '900', marginTop: spacing.xs },
  subtitle: { color: colors.muted, fontSize: 13, fontWeight: '700', lineHeight: 19, marginTop: spacing.xs },
  formCard: { backgroundColor: colors.card, borderRadius: radii.md, marginTop: spacing.lg, padding: spacing.lg },
  field: { marginBottom: spacing.lg },
  label: { color: colors.ink, fontSize: 13, fontWeight: '900', marginBottom: spacing.sm },
  input: { backgroundColor: colors.cardMuted, borderColor: colors.faint, borderRadius: radii.md, borderWidth: 1, color: colors.ink, fontSize: 14, fontWeight: '700', minHeight: 48, paddingHorizontal: spacing.md },
  textarea: { minHeight: 104, paddingTop: spacing.md, textAlignVertical: 'top' },
  optionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  optionChip: { backgroundColor: colors.cardMuted, borderColor: colors.faint, borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  optionChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  optionText: { color: colors.ink, fontSize: 12, fontWeight: '900', textTransform: 'capitalize' },
  optionTextActive: { color: '#fff' },
  error: { color: colors.rose, fontSize: 13, fontWeight: '800', marginTop: spacing.md },
  footer: { alignItems: 'center', backgroundColor: colors.card, borderTopColor: colors.faint, borderTopWidth: StyleSheet.hairlineWidth, bottom: 0, flexDirection: 'row', gap: spacing.sm, left: 0, padding: spacing.lg, position: 'absolute', right: 0 },
  secondaryButton: { alignItems: 'center', backgroundColor: colors.cardMuted, borderRadius: radii.pill, flexDirection: 'row', gap: spacing.xs, justifyContent: 'center', minHeight: 50, paddingHorizontal: spacing.lg },
  secondaryText: { color: colors.ink, fontWeight: '900' },
  primaryButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.pill, flex: 1, flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', minHeight: 50 },
  buttonDisabled: { opacity: 0.55 },
  primaryText: { color: '#fff', fontWeight: '900' },
});

export default ServiceBookingScreen;
