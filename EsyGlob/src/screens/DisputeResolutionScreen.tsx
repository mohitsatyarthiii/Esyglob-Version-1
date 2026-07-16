import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { pick, types } from '@react-native-documents/picker';
import { useAuth } from '../auth/AuthContext';
import { fetchOrders, uploadFiles } from '../api/marketplace';
import {
  createDispute,
  DisputeCase,
  DisputeEvidence,
  EscrowSummary,
  fetchDispute,
  fetchDisputes,
  fetchEscrows,
} from '../api/disputes';
import { Order } from '../api/types';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { getId } from '../utils/format';

const TYPES = [
  ['quality', 'Product quality'],
  ['delivery', 'Shipment / missing items'],
  ['payment', 'Payment / refund'],
  ['contract', 'Contract violation'],
  ['other', 'Other trade issue'],
] as const;
const RESOLUTIONS = [
  'Full refund',
  'Partial refund',
  'Return and refund',
  'Replacement',
  'Compensation',
  'Release escrow',
  'Other',
];
const ACTIVE_ORDER_STATUSES = [
  'payment_success',
  'payment_confirmed',
  'confirmed',
  'processing',
  'production',
  'ready_to_ship',
  'preparing_shipment',
  'pickup_scheduled',
  'picked_up',
  'warehouse_processing',
  'in_transit',
  'custom_clearance',
  'out_for_delivery',
  'shipped',
  'delivered',
  'completed',
  'returned',
  'disputed',
];
const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  filed: { label: 'Pending', color: '#B45309', bg: '#FEF3C7' },
  under_review: { label: 'Under Review', color: '#1D4ED8', bg: '#DBEAFE' },
  evidence_gathering: {
    label: 'Awaiting Documents',
    color: '#7C3AED',
    bg: '#EDE9FE',
  },
  mediation: { label: 'In Investigation', color: '#0369A1', bg: '#E0F2FE' },
  resolution_proposed: {
    label: 'Resolution Proposed',
    color: '#047857',
    bg: '#D1FAE5',
  },
  accepted: { label: 'Accepted', color: '#047857', bg: '#D1FAE5' },
  appealed: { label: 'Appealed', color: '#BE123C', bg: '#FFE4E6' },
  resolved: { label: 'Resolved', color: '#15803D', bg: '#DCFCE7' },
  closed: { label: 'Closed', color: '#475569', bg: '#E2E8F0' },
};
const QUICK_ACTIONS = [
  {
    label: 'Raise Dispute',
    icon: 'shield-plus-outline',
    type: 'quality',
    resolution: 'Other',
  },
  {
    label: 'Refund Request',
    icon: 'cash-refund',
    type: 'payment',
    resolution: 'Full refund',
  },
  {
    label: 'Return Request',
    icon: 'package-variant-closed-remove',
    type: 'quality',
    resolution: 'Return and refund',
  },
  {
    label: 'Payment Issue',
    icon: 'credit-card-alert-outline',
    type: 'payment',
    resolution: 'Release escrow',
  },
  {
    label: 'Shipment Issue',
    icon: 'truck-alert-outline',
    type: 'delivery',
    resolution: 'Compensation',
  },
] as const;
type DisputeFormState = {
  type: 'quality' | 'delivery' | 'payment' | 'contract' | 'other';
  transactionType: 'order' | 'escrow';
  transactionId: string;
  title: string;
  description: string;
  desiredResolution: string;
  priority: string;
  claimAmount: string;
  contact: string;
};
const initial: DisputeFormState = {
  type: 'quality',
  transactionType: 'order' as 'order' | 'escrow',
  transactionId: '',
  title: '',
  description: '',
  desiredResolution: 'Full refund',
  priority: 'medium',
  claimAmount: '',
  contact: '',
};

export default function DisputeResolutionScreen() {
  const nav = useNavigation<any>();
  const qc = useQueryClient();
  const { activeRole } = useAuth();
  const role = activeRole === 'seller' ? 'seller' : 'buyer';
  const [mode, setMode] = useState<'list' | 'create'>('list');
  const [selected, setSelected] = useState<string>();
  const [form, setForm] = useState(initial);
  const [evidence, setEvidence] = useState<DisputeEvidence[]>([]);
  const [uploading, setUploading] = useState(false);
  const disputes = useQuery({ queryKey: ['disputes'], queryFn: fetchDisputes });
  const orders = useQuery({
    queryKey: ['dispute-orders', role],
    queryFn: () => fetchOrders({ type: role }),
  });
  const escrows = useQuery({
    queryKey: ['dispute-escrows', role],
    queryFn: fetchEscrows,
  });
  const eligibleOrders = useMemo(
    () =>
      (orders.data ?? []).filter(order =>
        ACTIVE_ORDER_STATUSES.includes(String(order.status)),
      ),
    [orders.data],
  );
  const create = useMutation({
    mutationFn: async () => {
      const transaction =
        form.transactionType === 'order'
          ? eligibleOrders.find(x => getId(x) === form.transactionId)
          : escrows.data?.find(x => x._id === form.transactionId);
      if (!transaction)
        throw new Error('Select a valid order or escrow transaction.');
      const respondentId = getRespondentId(
        transaction,
        role,
        form.transactionType,
      );
      if (!respondentId)
        throw new Error('The other transaction party could not be identified.');
      return createDispute({
        respondentId,
        transactionType: form.transactionType,
        transactionId: form.transactionId,
        type: form.type,
        title: form.title.trim(),
        description: form.description.trim(),
        desiredResolution: form.desiredResolution,
        claimAmount: form.claimAmount ? Number(form.claimAmount) : undefined,
        currency: String((transaction as any).currency ?? 'INR'),
        evidence,
      });
    },
    onSuccess: async item => {
      await qc.invalidateQueries({ queryKey: ['disputes'] });
      setForm(initial);
      setEvidence([]);
      setMode('list');
      Alert.alert(
        'Dispute raised',
        `Case ${item.disputeNumber ?? item._id} was created successfully.`,
      );
    },
    onError: error =>
      Alert.alert(
        'Unable to raise dispute',
        error instanceof Error ? error.message : 'Please try again.',
      ),
  });
  const upload = async () => {
    try {
      const files = await pick({
        allowMultiSelection: true,
        type: [types.images, types.pdf, types.doc, types.docx],
      });
      if (!files.length) return;
      setUploading(true);
      const result = await uploadFiles(
        'dispute-evidence',
        files.map(file => ({
          uri: file.uri,
          name: file.name ?? `evidence-${Date.now()}`,
          type: file.type ?? 'application/octet-stream',
        })),
      );
      const uploaded = (result.uploads ?? result.files ?? [])
        .map(
          (item: any, index: number) =>
            ({
              type: String(files[index]?.type ?? '').startsWith('image/')
                ? 'photo'
                : 'document',
              title: files[index]?.name ?? 'Evidence',
              url: item.secure_url ?? item.url ?? item.location,
            } as DisputeEvidence),
        )
        .filter(item => item.url);
      setEvidence(current => [...current, ...uploaded]);
    } catch (error) {
      if (error instanceof Error && !/cancel/i.test(error.message))
        Alert.alert('Upload failed', error.message);
    } finally {
      setUploading(false);
    }
  };
  const submit = () => {
    if (
      !form.transactionId ||
      form.title.trim().length < 4 ||
      form.description.trim().length < 20
    )
      return Alert.alert(
        'Complete the form',
        'Select a transaction and enter a subject plus detailed description of at least 20 characters.',
      );
    create.mutate();
  };
  const openAction = (action: (typeof QUICK_ACTIONS)[number]) => {
    setForm({
      ...initial,
      type: action.type,
      desiredResolution: action.resolution,
    });
    setMode('create');
  };
  return (
    <View style={s.screen}>
      <View style={s.header}>
        <Pressable
          onPress={() => (mode === 'create' ? setMode('list') : nav.goBack())}
          style={s.headerBtn}
        >
          <Icon name="arrow-left" size={23} color="#111827" />
        </Pressable>
        <View style={s.flex}>
          <Text style={s.headerTitle}>Resolution Center</Text>
          <Text style={s.headerSub}>Returns, refunds and disputes</Text>
        </View>
        <View style={s.headerBtn} />
      </View>
      {mode === 'create' ? (
        <CreateForm
          form={form}
          setForm={setForm}
          orders={eligibleOrders}
          escrows={escrows.data ?? []}
          evidence={evidence}
          setEvidence={setEvidence}
          uploading={uploading}
          onUpload={upload}
          pending={create.isPending}
          onSubmit={submit}
        />
      ) : (
        <ScrollView contentContainerStyle={s.content}>
          <View style={s.hero}>
            <View style={s.heroIcon}>
              <Icon name="scale-balance" size={28} color="#FFF" />
            </View>
            <View style={s.flex}>
              <Text style={s.heroTitle}>Resolve a transaction issue</Text>
              <Text style={s.heroText}>
                Raise and track order, escrow, return, refund, quality, shipment
                and payment disputes. No booking or filing payment is required.
              </Text>
            </View>
          </View>
          <View style={s.quickGrid}>
            {QUICK_ACTIONS.map(action => (
              <Pressable
                key={action.label}
                onPress={() => openAction(action)}
                style={({ pressed }) => [
                  s.quickAction,
                  pressed && s.quickPressed,
                ]}>
                <View style={s.quickIcon}>
                  <Icon name={action.icon} size={20} color="#2563EB" />
                </View>
                <Text style={s.quickText}>{action.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={s.sectionTitle}>My Disputes</Text>
          {disputes.isLoading ? (
            <LoadingState label="Loading disputes" />
          ) : disputes.isError ? (
            <ErrorState
              message="Disputes could not be loaded."
              onRetry={() => disputes.refetch()}
            />
          ) : disputes.data?.length ? (
            disputes.data.map(item => (
              <DisputeCard
                key={item._id}
                item={item}
                onPress={() => setSelected(item._id)}
              />
            ))
          ) : (
            <EmptyState
              title="No disputes"
              detail="Cases you raise or participate in will appear here."
            />
          )}
        </ScrollView>
      )}
      <DisputeDetail id={selected} onClose={() => setSelected(undefined)} />
    </View>
  );
}

function CreateForm({
  form,
  setForm,
  orders,
  escrows,
  evidence,
  setEvidence,
  uploading,
  onUpload,
  pending,
  onSubmit,
}: {
  form: typeof initial;
  setForm: React.Dispatch<React.SetStateAction<typeof initial>>;
  orders: Order[];
  escrows: EscrowSummary[];
  evidence: DisputeEvidence[];
  setEvidence: React.Dispatch<React.SetStateAction<DisputeEvidence[]>>;
  uploading: boolean;
  onUpload: () => void;
  pending: boolean;
  onSubmit: () => void;
}) {
  const options =
    form.transactionType === 'order'
      ? orders.map(x => ({
          value: getId(x),
          label: `${x.orderNumber ?? getId(x)} · ${String(
            x.status ?? '',
          ).replace(/_/g, ' ')}`,
        }))
      : escrows.map(x => ({
          value: x._id,
          label: `${x.transactionNumber ?? x._id} · ${String(
            x.status ?? '',
          ).replace(/_/g, ' ')}`,
        }));
  return (
    <ScrollView contentContainerStyle={s.content}>
      <Text style={s.formIntro}>
        Tell the Resolution Team what happened and attach clear supporting
        evidence.
      </Text>
      <Label text="Dispute type" />
      <Select
        value={form.type}
        options={TYPES.map(([value, label]) => ({ value, label }))}
        onChange={value =>
          setForm({ ...form, type: value as typeof form.type })
        }
      />
      <Label text="Related transaction" />
      <View style={s.segment}>
        <Pressable
          onPress={() =>
            setForm({ ...form, transactionType: 'order', transactionId: '' })
          }
          style={[
            s.segmentBtn,
            form.transactionType === 'order' && s.segmentActive,
          ]}
        >
          <Text
            style={[
              s.segmentText,
              form.transactionType === 'order' && s.segmentTextActive,
            ]}
          >
            Order
          </Text>
        </Pressable>
        <Pressable
          onPress={() =>
            setForm({ ...form, transactionType: 'escrow', transactionId: '' })
          }
          style={[
            s.segmentBtn,
            form.transactionType === 'escrow' && s.segmentActive,
          ]}
        >
          <Text
            style={[
              s.segmentText,
              form.transactionType === 'escrow' && s.segmentTextActive,
            ]}
          >
            Escrow
          </Text>
        </Pressable>
      </View>
      <Select
        placeholder={
          form.transactionType === 'order'
            ? 'Select your order'
            : 'Select your escrow payment'
        }
        value={form.transactionId}
        options={options}
        onChange={value => setForm({ ...form, transactionId: value })}
      />
      <Field
        label="Subject"
        value={form.title}
        onChangeText={title => setForm({ ...form, title })}
        placeholder="Briefly describe the issue"
      />
      <Field
        label="Detailed description"
        value={form.description}
        onChangeText={description => setForm({ ...form, description })}
        placeholder="Explain what happened, dates, expected outcome and relevant facts"
        multiline
      />
      <Label text="Preferred resolution" />
      <Select
        value={form.desiredResolution}
        options={RESOLUTIONS.map(value => ({ value, label: value }))}
        onChange={desiredResolution => setForm({ ...form, desiredResolution })}
      />
      <Field
        label="Claim amount (optional)"
        value={form.claimAmount}
        onChangeText={claimAmount => setForm({ ...form, claimAmount })}
        keyboardType="decimal-pad"
        placeholder="0.00"
      />
      <Label text="Priority" />
      <Select
        value={form.priority}
        options={['low', 'medium', 'high', 'urgent'].map(value => ({
          value,
          label: value[0].toUpperCase() + value.slice(1),
        }))}
        onChange={priority => setForm({ ...form, priority })}
      />
      <Field
        label="Contact information (optional)"
        value={form.contact}
        onChangeText={contact => setForm({ ...form, contact })}
        placeholder="Email or phone for case updates"
      />
      <Label text="Evidence" />
      <Pressable disabled={uploading} onPress={onUpload} style={s.upload}>
        <Icon name="cloud-upload-outline" size={20} color="#2563EB" />
        <Text style={s.uploadText}>
          {uploading ? 'Uploading securely…' : 'Upload images, PDF or invoice'}
        </Text>
        {uploading ? <ActivityIndicator size="small" color="#2563EB" /> : null}
      </Pressable>
      {evidence.map((item, index) => (
        <View key={`${item.url}-${index}`} style={s.evidenceRow}>
          <Icon
            name={
              item.type === 'photo' ? 'image-outline' : 'file-document-outline'
            }
            size={18}
            color="#2563EB"
          />
          <Text numberOfLines={1} style={s.evidenceName}>
            {item.title}
          </Text>
          <Pressable
            onPress={() =>
              setEvidence(current => current.filter((_, i) => i !== index))
            }
          >
            <Icon name="close-circle" size={19} color="#94A3B8" />
          </Pressable>
        </View>
      ))}
      <Pressable
        disabled={pending || uploading}
        onPress={onSubmit}
        style={s.submit}
      >
        {pending ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <>
            <Icon name="shield-plus-outline" size={19} color="#FFF" />
            <Text style={s.submitText}>Create Dispute</Text>
          </>
        )}
      </Pressable>
    </ScrollView>
  );
}

function Select({
  value,
  placeholder = 'Select',
  options,
  onChange,
}: {
  value: string;
  placeholder?: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = options.find(x => x.value === value)?.label;
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={s.select}>
        <Text numberOfLines={1} style={[s.selectText, !label && s.placeholder]}>
          {label ?? placeholder}
        </Text>
        <Icon name="chevron-down" size={20} color="#64748B" />
      </Pressable>
      <Modal
        transparent
        visible={open}
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable onPress={() => setOpen(false)} style={s.modalShade}>
          <View style={s.optionSheet}>
            <Text style={s.optionTitle}>{placeholder}</Text>
            <ScrollView>
              {options.length ? (
                options.map(item => (
                  <Pressable
                    key={item.value}
                    onPress={() => {
                      onChange(item.value);
                      setOpen(false);
                    }}
                    style={s.option}
                  >
                    <Text style={s.optionText}>{item.label}</Text>
                    {value === item.value ? (
                      <Icon name="check" size={18} color="#2563EB" />
                    ) : null}
                  </Pressable>
                ))
              ) : (
                <Text style={s.noOptions}>No eligible records found.</Text>
              )}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
function Field({
  label,
  ...props
}: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View>
      <Label text={label} />
      <TextInput
        placeholderTextColor="#94A3B8"
        {...props}
        style={[s.input, props.multiline && s.multiline]}
      />
    </View>
  );
}
function Label({ text }: { text: string }) {
  return <Text style={s.label}>{text}</Text>;
}
function DisputeCard({
  item,
  onPress,
}: {
  item: DisputeCase;
  onPress: () => void;
}) {
  const badge = STATUS[item.status] ?? STATUS.filed;
  return (
    <Pressable onPress={onPress} style={s.card}>
      <View style={s.cardTop}>
        <View>
          <Text style={s.caseNo}>{item.disputeNumber ?? item._id}</Text>
          <Text numberOfLines={1} style={s.caseTitle}>
            {item.title ?? item.type.replace(/_/g, ' ')}
          </Text>
        </View>
        <View style={[s.badge, { backgroundColor: badge.bg }]}>
          <Text style={[s.badgeText, { color: badge.color }]}>
            {badge.label}
          </Text>
        </View>
      </View>
      <View style={s.cardMeta}>
        <Meta
          label="Reference"
          value={`${item.transactionType} · ${String(item.transactionId).slice(
            -8,
          )}`}
        />
        <Meta label="Priority" value={(item as any).priority ?? 'Standard'} />
        <Meta label="Progress" value={progress(item.status)} />
      </View>
      <Text style={s.updated}>
        Created {date(item.createdAt ?? item.filedAt)} · Updated{' '}
        {date(item.updatedAt)}
      </Text>
    </Pressable>
  );
}
function DisputeDetail({ id, onClose }: { id?: string; onClose: () => void }) {
  const query = useQuery({
    queryKey: ['dispute', id],
    queryFn: () => fetchDispute(id!),
    enabled: Boolean(id),
  });
  const item = query.data;
  const badge = item ? STATUS[item.status] ?? STATUS.filed : STATUS.filed;
  return (
    <Modal visible={Boolean(id)} animationType="slide" onRequestClose={onClose}>
      <View style={s.screen}>
        <View style={s.header}>
          <Pressable onPress={onClose} style={s.headerBtn}>
            <Icon name="close" size={23} color="#111827" />
          </Pressable>
          <Text style={s.headerTitle}>Dispute Details</Text>
          <View style={s.headerBtn} />
        </View>
        {query.isLoading ? (
          <LoadingState label="Loading case" />
        ) : query.isError || !item ? (
          <ErrorState
            message="Case details could not be loaded."
            onRetry={() => query.refetch()}
          />
        ) : (
          <ScrollView contentContainerStyle={s.content}>
            <View style={s.detailHead}>
              <Text style={s.caseNo}>{item.disputeNumber ?? item._id}</Text>
              <View style={[s.badge, { backgroundColor: badge.bg }]}>
                <Text style={[s.badgeText, { color: badge.color }]}>
                  {badge.label}
                </Text>
              </View>
            </View>
            <Text style={s.detailTitle}>{item.title ?? 'Trade dispute'}</Text>
            <Text style={s.detailText}>{item.description}</Text>
            <DetailSection title="Transaction">
              <Meta label="Type" value={item.transactionType} />
              <Meta label="Reference" value={String(item.transactionId)} />
              <Meta
                label="Escrow status"
                value={
                  item.transactionType === 'escrow'
                    ? item.status
                    : 'Not applicable'
                }
              />
              <Meta
                label="Refund status"
                value={
                  item.refundAmount
                    ? `Approved · ${item.refundAmount}`
                    : 'Pending decision'
                }
              />
            </DetailSection>
            <DetailSection title="Resolution">
              <Text style={s.detailText}>
                {item.desiredResolution ??
                  'Resolution requested from the review team.'}
              </Text>
              {item.resolution && Object.keys(item.resolution).length ? (
                <Text style={s.detailText}>
                  Final decision:{' '}
                  {String(
                    (item.resolution as any).description ??
                      (item.resolution as any).type ??
                      'Pending',
                  )}
                </Text>
              ) : null}
            </DetailSection>
            <DetailSection title="Evidence">
              {item.evidence?.length ? (
                item.evidence.map((file, index) => (
                  <Pressable
                    key={`${file.url}-${index}`}
                    onPress={() => file.url && Linking.openURL(file.url)}
                    style={s.evidenceRow}
                  >
                    <Icon
                      name={
                        file.type === 'photo'
                          ? 'image-outline'
                          : 'file-document-outline'
                      }
                      size={18}
                      color="#2563EB"
                    />
                    <Text style={s.evidenceName}>
                      {file.title ?? 'Evidence'}
                    </Text>
                    <Icon name="open-in-new" size={16} color="#64748B" />
                  </Pressable>
                ))
              ) : (
                <Text style={s.detailText}>No evidence submitted.</Text>
              )}
            </DetailSection>
            <DetailSection title="Timeline">
              {item.timeline?.length ? (
                item.timeline.map((event, index) => (
                  <View
                    key={`${event.performedAt}-${index}`}
                    style={s.timeline}
                  >
                    <View style={s.timelineDot} />
                    <View style={s.flex}>
                      <Text style={s.timelineTitle}>
                        {event.action ?? 'Case update'}
                      </Text>
                      <Text style={s.detailText}>{event.description}</Text>
                      <Text style={s.updated}>{date(event.performedAt)}</Text>
                    </View>
                  </View>
                ))
              ) : (
                <Text style={s.detailText}>
                  Case filed and awaiting review.
                </Text>
              )}
            </DetailSection>
            <DetailSection title="Support responses & notes">
              {item.messages?.length ? (
                item.messages.map((message, index) => (
                  <View key={`${message.createdAt}-${index}`} style={s.message}>
                    <Text style={s.detailText}>{message.message}</Text>
                    <Text style={s.updated}>{date(message.createdAt)}</Text>
                  </View>
                ))
              ) : (
                <Text style={s.detailText}>No support response yet.</Text>
              )}
            </DetailSection>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}
function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={s.detailSection}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}
function Meta({ label, value }: { label: string; value: unknown }) {
  return (
    <View style={s.meta}>
      <Text style={s.metaLabel}>{label}</Text>
      <Text numberOfLines={1} style={s.metaValue}>
        {String(value ?? '—').replace(/_/g, ' ')}
      </Text>
    </View>
  );
}
const date = (value?: string) =>
  value ? new Date(value).toLocaleDateString() : '—';
const progress = (status: string) =>
  ({
    filed: '10%',
    under_review: '30%',
    evidence_gathering: '45%',
    mediation: '65%',
    resolution_proposed: '80%',
    accepted: '90%',
    resolved: '100%',
    closed: '100%',
  }[status] ?? '10%');
function entityId(value: any) {
  return typeof value === 'string' ? value : getId(value ?? {});
}
function getRespondentId(
  item: any,
  role: 'buyer' | 'seller',
  type: 'order' | 'escrow',
) {
  if (type === 'escrow')
    return role === 'seller'
      ? entityId(item.userId)
      : entityId(item.sellerId?.userId ?? item.sellerId);
  return role === 'seller'
    ? entityId(item.buyerId ?? item.userId)
    : entityId(item.sellerId?.userId ?? item.sellerId);
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    paddingTop: 48,
    paddingBottom: 10,
    paddingHorizontal: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerBtn: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '900', color: '#0F172A' },
  headerSub: { fontSize: 9, color: '#64748B', marginTop: 1 },
  flex: { flex: 1 },
  content: { padding: 15, paddingBottom: 60 },
  hero: {
    backgroundColor: '#0F172A',
    borderRadius: 19,
    padding: 17,
    flexDirection: 'row',
    gap: 13,
  },
  heroIcon: {
    width: 49,
    height: 49,
    borderRadius: 14,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { fontSize: 17, fontWeight: '900', color: '#FFF' },
  heroText: { fontSize: 10.5, lineHeight: 16, color: '#CBD5E1', marginTop: 4 },
  raise: {
    height: 48,
    backgroundColor: '#2563EB',
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
    marginTop: 13,
  },
  raiseText: { color: '#FFF', fontSize: 13, fontWeight: '900' },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 13,
  },
  quickAction: {
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderColor: '#DBEAFE',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    minHeight: 48,
    paddingHorizontal: 11,
  },
  quickPressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  quickIcon: {
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  quickText: { color: '#0F172A', fontSize: 10, fontWeight: '900' },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 18,
    marginBottom: 9,
  },
  formIntro: {
    fontSize: 11,
    lineHeight: 17,
    color: '#64748B',
    marginBottom: 3,
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    color: '#334155',
    marginTop: 13,
    marginBottom: 6,
  },
  input: {
    minHeight: 45,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 11,
    backgroundColor: '#FFF',
    paddingHorizontal: 12,
    color: '#0F172A',
    fontSize: 12,
  },
  multiline: { height: 115, textAlignVertical: 'top', paddingTop: 12 },
  select: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 11,
    backgroundColor: '#FFF',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectText: { flex: 1, fontSize: 11.5, color: '#0F172A', fontWeight: '700' },
  placeholder: { color: '#94A3B8', fontWeight: '500' },
  segment: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 11,
    padding: 3,
    marginBottom: 8,
  },
  segmentBtn: { flex: 1, padding: 9, alignItems: 'center', borderRadius: 9 },
  segmentActive: { backgroundColor: '#FFF' },
  segmentText: { fontSize: 11, color: '#64748B', fontWeight: '800' },
  segmentTextActive: { color: '#2563EB' },
  upload: {
    minHeight: 48,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#93C5FD',
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  uploadText: { flex: 1, fontSize: 11, fontWeight: '800', color: '#2563EB' },
  evidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    backgroundColor: '#FFF',
    borderRadius: 10,
    marginTop: 7,
  },
  evidenceName: { flex: 1, fontSize: 10.5, color: '#334155' },
  submit: {
    height: 50,
    borderRadius: 13,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
    marginTop: 22,
  },
  submitText: { fontSize: 13, fontWeight: '900', color: '#FFF' },
  modalShade: { flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' },
  optionSheet: {
    maxHeight: '65%',
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 8,
  },
  option: {
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionText: { fontSize: 12, color: '#334155', flex: 1 },
  noOptions: {
    fontSize: 12,
    color: '#64748B',
    paddingVertical: 25,
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 15,
    padding: 14,
    marginBottom: 10,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  caseNo: { fontSize: 10, fontWeight: '900', color: '#2563EB' },
  caseTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 4,
    maxWidth: 220,
    textTransform: 'capitalize',
  },
  badge: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: 8.5, fontWeight: '900', textTransform: 'uppercase' },
  cardMeta: { flexDirection: 'row', gap: 7, marginTop: 12 },
  meta: { flex: 1 },
  metaLabel: {
    fontSize: 8,
    color: '#94A3B8',
    textTransform: 'uppercase',
    fontWeight: '800',
  },
  metaValue: {
    fontSize: 9.5,
    color: '#334155',
    fontWeight: '800',
    marginTop: 3,
    textTransform: 'capitalize',
  },
  updated: { fontSize: 8.5, color: '#94A3B8', marginTop: 10 },
  detailHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 10,
  },
  detailText: { fontSize: 11, lineHeight: 17, color: '#475569', marginTop: 5 },
  detailSection: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
  },
  timeline: { flexDirection: 'row', gap: 10, paddingVertical: 8 },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#2563EB',
    marginTop: 4,
  },
  timelineTitle: { fontSize: 11, fontWeight: '900', color: '#1E293B' },
  message: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    marginTop: 7,
  },
});
