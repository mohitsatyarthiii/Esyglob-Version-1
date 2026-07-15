import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import RazorpayCheckout from 'react-native-razorpay';
import { createServiceBooking, fetchServiceQuote, getServiceByKey, initiateServicePayment, ServiceField, servicePaymentFailureStatus, updateServicePaymentStatus, verifyServicePayment } from '../api/services';
import { useAuth } from '../auth/AuthContext';
import { RootStackParamList } from '../../App';
import { pick, types as documentTypes } from '@react-native-documents/picker';
import { uploadFiles } from '../api/marketplace';

function ServiceBookingScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, 'ServiceBooking'>>();
  const queryClient = useQueryClient();
  const { activeRole } = useAuth();
  const service = getServiceByKey(route.params.serviceKey);
  const [values, setValues] = useState<Record<string, string>>(() =>
    initialValues(service?.fields ?? [])
  );
  const [step, setStep] = useState(0);
  const [uploading, setUploading] = useState(false);
  const steps = useMemo(() => groupFieldsByWorkflow(service), [service]);
  const currentFields = steps[step] ?? [];
  const totalSteps = steps.length;
  const isLastStep = step === totalSteps - 1;
  const quote = useQuery({
    queryKey: ['service-quote', service?.key, values],
    queryFn: () => fetchServiceQuote(service!.key, values),
    enabled: Boolean(service && isLastStep),
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!service) throw new Error('Service was not found.');
      const booking: any = await createServiceBooking(service, activeRole === 'seller' ? 'seller' : 'buyer', values);
      const request = booking?.request ?? booking;
      const requestId = request?._id ?? request?.id;
      if (!requestId) throw new Error('Booking was created without a service reference.');
      try {
        const payment = await initiateServicePayment(requestId);
        const gateway = await RazorpayCheckout.open({ key: payment.keyId, amount: payment.amount, currency: payment.currency, name: 'EsyGlob', description: service.title, order_id: payment.razorpayOrderId, theme: { color: '#2563EB' } });
        const verified: any = await verifyServicePayment(requestId, { razorpayPaymentId: gateway.razorpay_payment_id, razorpayOrderId: gateway.razorpay_order_id, razorpaySignature: gateway.razorpay_signature });
        return verified?.request ?? request;
      } catch (error) {
        await updateServicePaymentStatus(requestId, servicePaymentFailureStatus(error)).catch(() => undefined);
        throw error;
      }
    },
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: ['service-activity'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      navigation.replace('ServiceBookingSuccess', { request: data });
    },
    onError: (error: Error) => {
      Alert.alert('Error', error.message);
    },
  });

  if (!service) {
    return (
      <View style={styles.screen}>
        <Header title="Service Booking" />
        <View style={styles.errorState}>
          <Icon name="alert-circle-outline" size={48} color="#94a3b8" />
          <Text style={styles.notFoundText}>Service not found</Text>
        </View>
      </View>
    );
  }

  const missingRequired = currentFields.fields.some(
    field => field.required && !values[field.key]?.trim()
  );

  const submit = () => {
    const missing = service.fields.filter(field => field.required && !values[field.key]?.trim());
    if (missing.length) {
      Alert.alert('Missing Details', `Please complete "${missing[0].label}" to continue.`);
      return;
    }
    mutation.mutate();
  };

  const uploadDocument = async () => {
    try {
      const files = await pick({
        allowMultiSelection: false,
        type: [documentTypes.images, documentTypes.pdf, documentTypes.doc, documentTypes.docx, documentTypes.xls, documentTypes.xlsx],
      });
      const file = files[0];
      if (!file) return;
      setUploading(true);
      const result = await uploadFiles('service-requests', [{
        uri: file.uri,
        name: file.name ?? `service-document-${Date.now()}`,
        type: file.type ?? 'application/octet-stream',
      }]);
      const uploaded = result.uploads?.[0] ?? result.files?.[0];
      const url = uploaded?.secure_url ?? uploaded?.url ?? uploaded?.location;
      if (!url) throw new Error('Failed to get document URL.');
      setValues(current => ({
        ...current,
        documentName: uploaded?.name ?? file.name ?? 'Service document',
        documentUrl: url,
      }));
    } catch (error) {
      if (error instanceof Error && !/cancel/i.test(error.message)) {
        Alert.alert('Upload Failed', error.message);
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.screen}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="arrow-left" size={22} color="#1a1a1a" />
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>{service.title}</Text>
          <Text style={styles.headerSubtitle}>Complete the form to book this service</Text>
        </View>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${totalSteps > 1 ? (step / (totalSteps - 1)) * 100 : 0}%` }]} />
        </View>
        <View style={styles.progressSteps}>
          {steps.map((s, index) => (
            <View key={index} style={styles.progressStepItem}>
              <View style={[
                styles.progressDot,
                index < step && styles.progressDotCompleted,
                index === step && styles.progressDotActive,
              ]}>
                {index < step ? (
                  <Icon name="check" size={10} color="#fff" />
                ) : (
                  <Text style={[
                    styles.progressDotText,
                    index === step && styles.progressDotTextActive,
                  ]}>{index + 1}</Text>
                )}
              </View>
              <Text style={[
                styles.progressStepLabel,
                index === step && styles.progressStepLabelActive,
              ]} numberOfLines={1}>{s.title}</Text>
            </View>
          ))}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Step Header */}
        <View style={styles.stepHeader}>
          <Text style={styles.stepCount}>Step {step + 1} of {totalSteps}</Text>
          <Text style={styles.stepTitle}>{currentFields.title}</Text>
        </View>

        {/* Form Card */}
        <View style={styles.formCard}>
          {currentFields.fields.map(field => (
            <FieldInput
              key={field.key}
              field={field}
              value={values[field.key] ?? ''}
              onChange={value => setValues(current => ({ ...current, [field.key]: value }))}
            />
          ))}

          {/* Document Upload */}
          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>Supporting Document (Optional)</Text>
            <Pressable
              disabled={uploading}
              onPress={uploadDocument}
              style={({ pressed }) => [styles.uploadBox, pressed && styles.uploadBoxPressed]}
            >
              {uploading ? (
                <ActivityIndicator size="small" color="#6366f1" />
              ) : values.documentUrl ? (
                <View style={styles.uploadSuccessIcon}>
                  <Icon name="check-circle" size={24} color="#10b981" />
                </View>
              ) : (
                <View style={styles.uploadIcon}>
                  <Icon name="cloud-upload-outline" size={24} color="#6366f1" />
                </View>
              )}
              <View style={styles.uploadInfo}>
                <Text style={styles.uploadTitle}>
                  {values.documentUrl ? 'Document uploaded' : 'Upload document'}
                </Text>
                <Text style={styles.uploadHint}>
                  {values.documentName || 'PDF, DOC, XLS or images (max 10MB)'}
                </Text>
              </View>
              {values.documentUrl && (
                <Pressable
                  onPress={() => setValues(current => ({ ...current, documentName: '', documentUrl: '' }))}
                  style={styles.removeBtn}
                >
                  <Icon name="close-circle" size={20} color="#ef4444" />
                </Pressable>
              )}
            </Pressable>
          </View>
        </View>

        {isLastStep && <View style={styles.priceCard}>
          <Text style={styles.priceTitle}>Pricing summary</Text>
          {quote.isLoading ? <ActivityIndicator color="#2563EB" /> : quote.data ? <>
            <PriceRow label="Base service cost" value={quote.data.baseCost} currency={quote.data.currency} />
            <PriceRow label="Additional charges" value={quote.data.additionalCharges} currency={quote.data.currency} />
            <PriceRow label={`GST (${quote.data.gstRate}%)`} value={quote.data.gstAmount} currency={quote.data.currency} />
            <PriceRow label="Platform fee" value={quote.data.platformFee} currency={quote.data.currency} />
            <PriceRow label="Discount" value={-quote.data.discount} currency={quote.data.currency} />
            <View style={styles.priceDivider} />
            <PriceRow label="Total payable" value={quote.data.totalPayable} currency={quote.data.currency} total />
          </> : <Text style={styles.errorText}>Pricing is temporarily unavailable.</Text>}
        </View>}

        {/* Error */}
        {mutation.isError && (
          <View style={styles.errorBox}>
            <Icon name="alert-circle" size={18} color="#ef4444" />
            <Text style={styles.errorText}>{(mutation.error as Error)?.message ?? 'Something went wrong'}</Text>
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        {step > 0 && (
          <Pressable
            onPress={() => setStep(current => Math.max(current - 1, 0))}
            style={styles.backNextBtn}
          >
            <Icon name="arrow-left" size={18} color="#475569" />
            <Text style={styles.backNextText}>Back</Text>
          </Pressable>
        )}
        <Pressable
          disabled={mutation.isPending || missingRequired || (isLastStep && !quote.data)}
          onPress={() => isLastStep ? submit() : setStep(current => current + 1)}
          style={[
            styles.continueBtn,
            step === 0 && styles.continueBtnFull,
            (mutation.isPending || missingRequired) && styles.continueBtnDisabled,
          ]}
        >
          {mutation.isPending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Text style={styles.continueBtnText}>
                {isLastStep ? 'Pay & Book' : 'Continue'}
              </Text>
              <Icon name={isLastStep ? 'check' : 'arrow-right'} size={18} color="#fff" />
            </>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function PriceRow({ label, value, currency, total }: { label: string; value: number; currency: string; total?: boolean }) {
  return <View style={styles.priceRow}><Text style={[styles.priceLabel, total && styles.priceTotal]}>{label}</Text><Text style={[styles.priceValue, total && styles.priceTotal]}>{currency} {value.toFixed(2)}</Text></View>;
}

// Header Component
function Header({ title }: { title: string }) {
  const navigation = useNavigation<any>();
  return (
    <View style={styles.simpleHeader}>
      <Pressable onPress={() => navigation.goBack()} style={styles.simpleBack}>
        <Icon name="arrow-left" size={22} color="#1a1a1a" />
      </Pressable>
      <Text style={styles.simpleTitle}>{title}</Text>
      <View style={styles.simpleBack} />
    </View>
  );
}

// Field Input Component
function FieldInput({ field, value, onChange }: { field: ServiceField; value: string; onChange: (value: string) => void }) {
  if (field.type === 'select' && field.options?.length) {
    return (
      <View style={styles.fieldWrap}>
        <Text style={styles.fieldLabel}>
          {field.label}
          {field.required && <Text style={styles.required}> *</Text>}
        </Text>
        <View style={styles.optionsRow}>
          {field.options.map(option => {
            const selected = value === option;
            return (
              <Pressable
                key={option}
                onPress={() => onChange(option)}
                style={[styles.optionChip, selected && styles.optionChipActive]}
              >
                <Text style={[styles.optionText, selected && styles.optionTextActive]}>
                  {option.replace(/_/g, ' ')}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>
        {field.label}
        {field.required && <Text style={styles.required}> *</Text>}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={field.placeholder ?? `Enter ${field.label.toLowerCase()}`}
        placeholderTextColor="#94a3b8"
        keyboardType={field.type === 'number' ? 'numeric' : field.type === 'email' ? 'email-address' : field.type === 'phone' ? 'phone-pad' : 'default'}
        multiline={field.type === 'textarea'}
        style={[styles.input, field.type === 'textarea' && styles.textarea]}
      />
    </View>
  );
}

// Helpers
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

    return workflowSteps
      .map(title => ({
        title,
        fields: hasFieldSteps
          ? fields.filter(field => field.step === title || (!field.step && title === workflowSteps[0]))
          : fields.slice(workflowSteps.indexOf(title) * chunkSize, workflowSteps.indexOf(title) * chunkSize + chunkSize),
      }))
      .filter(group => group.fields.length);
  }

  return [{ title: 'Service requirements', fields }];
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  priceCard: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0', borderRadius: 14, borderWidth: 1, marginTop: 16, padding: 16 },
  priceTitle: { color: '#0f172a', fontSize: 16, fontWeight: '800', marginBottom: 12 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  priceLabel: { color: '#64748b', fontSize: 13 },
  priceValue: { color: '#334155', fontSize: 13, fontWeight: '700' },
  priceTotal: { color: '#0f172a', fontSize: 15, fontWeight: '900' },
  priceDivider: { backgroundColor: '#e2e8f0', height: 1, marginVertical: 8 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  headerSubtitle: { fontSize: 12, color: '#888', marginTop: 2 },

  // Progress
  progressContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
    backgroundColor: '#fff',
  },
  progressTrack: {
    height: 3,
    backgroundColor: '#f1f5f9',
    borderRadius: 2,
    marginBottom: 16,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#1a1a1a',
    borderRadius: 2,
  },
  progressSteps: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressStepItem: {
    alignItems: 'center',
    flex: 1,
    gap: 6,
  },
  progressDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#e2e8f0',
  },
  progressDotCompleted: {
    backgroundColor: '#1a1a1a',
    borderColor: '#1a1a1a',
  },
  progressDotActive: {
    backgroundColor: '#fff',
    borderColor: '#1a1a1a',
    borderWidth: 2,
  },
  progressDotText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
  },
  progressDotTextActive: {
    color: '#1a1a1a',
  },
  progressStepLabel: {
    fontSize: 9,
    fontWeight: '500',
    color: '#94a3b8',
    textAlign: 'center',
  },
  progressStepLabelActive: {
    color: '#1a1a1a',
    fontWeight: '600',
  },

  // Scroll
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },

  // Step Header
  stepHeader: {
    marginBottom: 16,
  },
  stepCount: {
    fontSize: 11,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
    letterSpacing: -0.2,
  },

  // Form Card
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    padding: 16,
  },
  fieldWrap: {
    marginBottom: 18,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  required: {
    color: '#ef4444',
  },

  // Input
  input: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 14,
    fontWeight: '500',
    color: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  textarea: {
    minHeight: 100,
    paddingTop: 14,
    textAlignVertical: 'top',
  },

  // Options
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  optionChipActive: {
    backgroundColor: '#1a1a1a',
    borderColor: '#1a1a1a',
  },
  optionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    textTransform: 'capitalize',
  },
  optionTextActive: {
    color: '#fff',
  },

  // Upload
  uploadBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
    borderRadius: 10,
    padding: 14,
    gap: 12,
  },
  uploadBoxPressed: {
    borderColor: '#1a1a1a',
    backgroundColor: '#fafafa',
  },
  uploadIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#e0e7ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadSuccessIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#d1fae5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadInfo: {
    flex: 1,
  },
  uploadTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 2,
  },
  uploadHint: {
    fontSize: 11,
    color: '#94a3b8',
  },
  removeBtn: {
    padding: 4,
  },

  // Error
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: '#dc2626',
  },

  // Footer
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 34,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  backNextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
  },
  backNextText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  continueBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1a1a1a',
    paddingVertical: 14,
    borderRadius: 12,
  },
  continueBtnFull: {
    flex: 1,
  },
  continueBtnDisabled: {
    backgroundColor: '#94a3b8',
  },
  continueBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },

  // Error State
  errorState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  notFoundText: {
    fontSize: 14,
    color: '#94a3b8',
    fontWeight: '500',
  },

  // Simple Header
  simpleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingTop: 50,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  simpleBack: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  simpleTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#1a1a1a',
    textAlign: 'center',
  },
});

export default ServiceBookingScreen;
