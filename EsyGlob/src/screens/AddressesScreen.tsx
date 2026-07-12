import React, { useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
  StatusBar,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AddressBookItem,
  createAddress,
  deleteAddress,
  fetchAddresses,
  setDefaultAddress,
  updateAddress,
} from '../api/account';
import { ErrorState, LoadingState } from '../components/StateViews';
import { getId } from '../utils/format';

// ─── Palette ────────────────────────────────────────────
const P = {
  bg: '#F5F5F5',
  surface: '#FFFFFF',
  primary: '#FF6A00',
  primaryLight: '#FFF3E8',
  primaryDark: '#E05500',
  text: '#1A1A1A',
  textSecondary: '#475569',
  muted: '#94A3B8',
  border: '#E2E8F0',
  inputBg: '#F8FAFC',
  emerald: '#059669',
  emeraldLight: '#ECFDF5',
  red: '#DC2626',
  redLight: '#FEF2F2',
  amber: '#D97706',
  amberLight: '#FFFBEB',
  violet: '#7C3AED',
  violetLight: '#F5F3FF',
  sky: '#0EA5E9',
  skyLight: '#F0F9FF',
};

const STATUSBAR_HEIGHT = Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight || 24);

const emptyAddress: AddressBookItem = {
  fullName: '',
  phone: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  country: '',
  pincode: '',
  addressType: 'shipping',
  isDefault: false,
};

// ─── Main Component ────────────────────────────────────
function AddressesScreen() {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const addresses = useQuery({ queryKey: ['addresses'], queryFn: fetchAddresses });
  const [form, setForm] = useState<AddressBookItem>(emptyAddress);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'shipping' | 'billing'>('all');

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['addresses'] });

  const save = useMutation({
    mutationFn: () => (editingId ? updateAddress(editingId, form) : createAddress(form)),
    onSuccess: async () => {
      setForm(emptyAddress);
      setEditingId(null);
      setShowForm(false);
      await refresh();
    },
    onError: (error: any) =>
      Alert.alert(
        'Address save failed',
        error instanceof Error ? error.message : 'Unable to save address.',
      ),
  });

  const makeDefault = useMutation({ mutationFn: setDefaultAddress, onSuccess: refresh });
  const remove = useMutation({ mutationFn: deleteAddress, onSuccess: refresh });

  const openEdit = (item: AddressBookItem) => {
    setEditingId(getId(item));
    setForm({
      ...emptyAddress,
      ...item,
      line1: item.line1 ?? (item as any).street,
      pincode: item.pincode ?? (item as any).postalCode,
    });
    setShowForm(true);
  };

  const openNew = () => {
    setEditingId(null);
    setForm(emptyAddress);
    setShowForm(true);
  };

  if (addresses.isLoading) return <LoadingState label="Loading addresses" />;
  if (addresses.isError)
    return (
      <ErrorState
        message={(addresses.error as Error).message}
        onRetry={() => addresses.refetch()}
      />
    );

  const addressList = addresses.data ?? [];
  const filteredAddresses =
    activeTab === 'all'
      ? addressList
      : addressList.filter(a => a.addressType === activeTab);

  const shippingCount = addressList.filter(a => a.addressType === 'shipping').length;
  const billingCount = addressList.filter(a => a.addressType === 'billing').length;

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={P.surface} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="arrow-left" size={22} color={P.text} />
        </Pressable>
        <Text style={styles.headerTitle}>My Addresses</Text>
        <Pressable onPress={openNew} style={styles.addBtn}>
          <Icon name="plus" size={22} color="#FFF" />
        </Pressable>
      </View>

      <FlatList
        data={filteredAddresses}
        keyExtractor={item => getId(item)}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={addresses.isFetching}
            onRefresh={() => addresses.refetch()}
            tintColor={P.primary}
            colors={[P.primary]}
          />
        }
        ListHeaderComponent={
          <>
            {/* Stats Summary */}
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Icon name="map-marker-outline" size={22} color={P.primary} />
                <Text style={styles.statValue}>{addressList.length}</Text>
                <Text style={styles.statLabel}>Total</Text>
              </View>
              <View style={styles.statCard}>
                <Icon name="truck-delivery-outline" size={22} color={P.sky} />
                <Text style={styles.statValue}>{shippingCount}</Text>
                <Text style={styles.statLabel}>Shipping</Text>
              </View>
              <View style={styles.statCard}>
                <Icon name="file-document-outline" size={22} color={P.violet} />
                <Text style={styles.statValue}>{billingCount}</Text>
                <Text style={styles.statLabel}>Billing</Text>
              </View>
            </View>

            {/* Tab Filter */}
            <View style={styles.tabRow}>
              {[
                { key: 'all' as const, label: 'All', count: addressList.length },
                { key: 'shipping' as const, label: 'Shipping', count: shippingCount },
                { key: 'billing' as const, label: 'Billing', count: billingCount },
              ].map(tab => (
                <Pressable
                  key={tab.key}
                  onPress={() => setActiveTab(tab.key)}
                  style={[
                    styles.tab,
                    activeTab === tab.key && styles.tabActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.tabText,
                      activeTab === tab.key && styles.tabTextActive,
                    ]}
                  >
                    {tab.label} ({tab.count})
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        }
        renderItem={({ item }) => (
          <AddressCard
            item={item}
            onEdit={() => openEdit(item)}
            onDefault={() => makeDefault.mutate(getId(item))}
            onDelete={() =>
              Alert.alert('Delete Address', 'Remove this address permanently?', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => remove.mutate(getId(item)),
                },
              ])
            }
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Icon name="map-marker-off-outline" size={56} color={P.border} />
            <Text style={styles.emptyTitle}>No addresses found</Text>
            <Text style={styles.emptySubtitle}>
              {activeTab === 'all'
                ? 'Add your first address for faster checkout'
                : `No ${activeTab} addresses yet`}
            </Text>
            <Pressable onPress={openNew} style={styles.emptyBtn}>
              <Icon name="plus" size={18} color="#FFF" />
              <Text style={styles.emptyBtnText}>Add New Address</Text>
            </Pressable>
          </View>
        }
      />

      {/* Floating Add Button */}
      {addressList.length > 0 && (
        <Pressable onPress={openNew} style={styles.fab}>
          <Icon name="plus" size={28} color="#FFF" />
        </Pressable>
      )}

      {/* Address Form Modal */}
      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet">
        <AddressForm
          form={form}
          setForm={setForm}
          editingId={editingId}
          onSave={() => save.mutate()}
          onClose={() => setShowForm(false)}
          isSaving={save.isPending}
        />
      </Modal>
    </View>
  );
}

// ─── Address Form Component ────────────────────────────
function AddressForm({
  form,
  setForm,
  editingId,
  onSave,
  onClose,
  isSaving,
}: {
  form: AddressBookItem;
  setForm: (f: AddressBookItem) => void;
  editingId: string | null;
  onSave: () => void;
  onClose: () => void;
  isSaving: boolean;
}) {
  return (
    <View style={styles.formScreen}>
      <StatusBar barStyle="dark-content" backgroundColor={P.surface} />

      {/* Form Header */}
      <View style={styles.formHeader}>
        <Pressable onPress={onClose} style={styles.formCloseBtn}>
          <Icon name="close" size={22} color={P.text} />
        </Pressable>
        <Text style={styles.formTitle}>
          {editingId ? 'Edit Address' : 'Add New Address'}
        </Text>
        <View style={styles.formHeaderSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.formContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Address Type Selector */}
        <View style={styles.typeRow}>
          <Pressable
            onPress={() => setForm({ ...form, addressType: 'shipping' })}
            style={[
              styles.typeCard,
              form.addressType === 'shipping' && styles.typeCardActive,
            ]}
          >
            <Icon
              name="truck-delivery-outline"
              size={24}
              color={form.addressType === 'shipping' ? P.primary : P.muted}
            />
            <Text
              style={[
                styles.typeText,
                form.addressType === 'shipping' && styles.typeTextActive,
              ]}
            >
              Shipping
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setForm({ ...form, addressType: 'billing' })}
            style={[
              styles.typeCard,
              form.addressType === 'billing' && styles.typeCardActive,
            ]}
          >
            <Icon
              name="file-document-outline"
              size={24}
              color={form.addressType === 'billing' ? P.violet : P.muted}
            />
            <Text
              style={[
                styles.typeText,
                form.addressType === 'billing' && styles.typeTextActive,
              ]}
            >
              Billing
            </Text>
          </Pressable>
        </View>

        {/* Form Fields */}
        <View style={styles.formCard}>
          <Text style={styles.formSectionTitle}>Contact Information</Text>
          <FormField
            label="Full Name"
            icon="account-outline"
            value={form.fullName}
            onChangeText={fullName => setForm({ ...form, fullName })}
            placeholder="Enter full name"
          />
          <FormField
            label="Phone Number"
            icon="phone-outline"
            value={form.phone}
            onChangeText={phone => setForm({ ...form, phone })}
            keyboardType="phone-pad"
            placeholder="Enter phone number"
          />
        </View>

        <View style={styles.formCard}>
          <Text style={styles.formSectionTitle}>Address Details</Text>
          <FormField
            label="Street Address"
            icon="map-marker-outline"
            value={form.line1 ?? (form as any).street}
            onChangeText={line1 => setForm({ ...form, line1 })}
            placeholder="House/Flat No., Street"
          />
          <FormField
            label="Address Line 2 (Optional)"
            icon="map-marker-outline"
            value={form.line2}
            onChangeText={line2 => setForm({ ...form, line2 })}
            placeholder="Landmark, Area"
          />
          <View style={styles.formRow}>
            <View style={styles.formHalf}>
              <FormField
                label="City"
                icon="city"
                value={form.city}
                onChangeText={city => setForm({ ...form, city })}
                placeholder="City"
              />
            </View>
            <View style={styles.formHalf}>
              <FormField
                label="State"
                icon="map"
                value={form.state}
                onChangeText={state => setForm({ ...form, state })}
                placeholder="State"
              />
            </View>
          </View>
          <View style={styles.formRow}>
            <View style={styles.formHalf}>
              <FormField
                label="Country"
                icon="earth"
                value={form.country}
                onChangeText={country => setForm({ ...form, country })}
                placeholder="Country"
              />
            </View>
            <View style={styles.formHalf}>
              <FormField
                label="Pincode"
                icon="pin-outline"
                value={form.pincode ?? (form as any).postalCode}
                onChangeText={pincode => setForm({ ...form, pincode })}
                keyboardType="numeric"
                placeholder="Pincode"
              />
            </View>
          </View>
        </View>

        {/* Default Toggle */}
        <Pressable
          onPress={() => setForm({ ...form, isDefault: !form.isDefault })}
          style={styles.defaultToggleCard}
        >
          <View style={styles.defaultToggleLeft}>
            <Icon
              name={form.isDefault ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
              size={24}
              color={form.isDefault ? P.emerald : P.muted}
            />
            <View>
              <Text style={styles.defaultToggleTitle}>Set as default</Text>
              <Text style={styles.defaultToggleDesc}>
                This address will be used for future orders
              </Text>
            </View>
          </View>
        </Pressable>

        {/* Save Button */}
        <Pressable
          onPress={onSave}
          disabled={isSaving}
          style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
        >
          <Text style={styles.saveBtnText}>
            {isSaving ? 'Saving...' : editingId ? 'Update Address' : 'Save Address'}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

// ─── Form Field Component ──────────────────────────────
function FormField({
  label,
  icon,
  value,
  onChangeText,
  keyboardType,
  placeholder,
}: {
  label: string;
  icon: string;
  value?: string;
  onChangeText: (v: string) => void;
  keyboardType?: 'default' | 'numeric' | 'phone-pad';
  placeholder?: string;
}) {
  return (
    <View style={styles.formField}>
      <Text style={styles.formLabel}>{label}</Text>
      <View style={styles.formInputWrap}>
        <Icon name={icon} size={18} color={P.muted} style={styles.formInputIcon} />
        <TextInput
          value={value ?? ''}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          style={styles.formInput}
          placeholder={placeholder}
          placeholderTextColor={P.muted}
        />
      </View>
    </View>
  );
}

// ─── Address Card Component ────────────────────────────
function AddressCard({
  item,
  onEdit,
  onDefault,
  onDelete,
}: {
  item: AddressBookItem;
  onEdit: () => void;
  onDefault: () => void;
  onDelete: () => void;
}) {
  const isShipping = item.addressType === 'shipping';

  return (
    <View style={styles.addressCard}>
      {/* Card Header */}
      <View style={styles.addressCardHeader}>
        <View style={styles.addressTypeRow}>
          <View
            style={[
              styles.addressTypeBadge,
              { backgroundColor: isShipping ? P.skyLight : P.violetLight },
            ]}
          >
            <Icon
              name={isShipping ? 'truck-delivery-outline' : 'file-document-outline'}
              size={14}
              color={isShipping ? P.sky : P.violet}
            />
            <Text
              style={[
                styles.addressTypeBadgeText,
                { color: isShipping ? P.sky : P.violet },
              ]}
            >
              {isShipping ? 'Shipping' : 'Billing'}
            </Text>
          </View>
          {item.isDefault && (
            <View style={styles.defaultBadge}>
              <Icon name="check-circle" size={12} color={P.emerald} />
              <Text style={styles.defaultBadgeText}>Default</Text>
            </View>
          )}
        </View>
        <Pressable onPress={onEdit} style={styles.editIconBtn} hitSlop={8}>
          <Icon name="pencil-outline" size={18} color={P.muted} />
        </Pressable>
      </View>

      {/* Address Content */}
      <View style={styles.addressCardContent}>
        <View style={styles.addressIconWrap}>
          <Icon name="map-marker" size={22} color={P.primary} />
        </View>
        <View style={styles.addressInfo}>
          <Text style={styles.addressName}>{item.fullName || 'Unnamed Address'}</Text>
          <Text style={styles.addressDetail}>
            {[item.line1 ?? (item as any).street, item.line2, item.city, item.state, item.country]
              .filter(Boolean)
              .join(', ')}
          </Text>
          <Text style={styles.addressDetail}>
            {item.pincode ?? (item as any).postalCode}
          </Text>
          <Text style={styles.addressPhone}>{item.phone}</Text>
        </View>
      </View>

      {/* Card Actions */}
      <View style={styles.addressCardActions}>
        <Pressable onPress={onEdit} style={styles.cardActionBtn}>
          <Icon name="pencil-outline" size={16} color={P.textSecondary} />
          <Text style={styles.cardActionText}>Edit</Text>
        </Pressable>
        {!item.isDefault && (
          <Pressable onPress={onDefault} style={styles.cardActionBtn}>
            <Icon name="star-outline" size={16} color={P.amber} />
            <Text style={[styles.cardActionText, { color: P.amber }]}>Set Default</Text>
          </Pressable>
        )}
        <Pressable onPress={onDelete} style={styles.cardActionBtn}>
          <Icon name="delete-outline" size={16} color={P.red} />
          <Text style={[styles.cardActionText, { color: P.red }]}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: { 
    flex: 1, 
    backgroundColor: P.bg,
    paddingTop: STATUSBAR_HEIGHT,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: P.surface,
    borderBottomWidth: 1,
    borderBottomColor: P.border,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: P.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: P.text,
  },
  addBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: P.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Content
  content: {
    padding: 16,
    paddingBottom: 100,
    gap: 12,
  },

  // Stats Row
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 4,
  },
  statCard: {
    flex: 1,
    backgroundColor: P.surface,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: P.border,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: P.text,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: P.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Tab Row
  tabRow: {
    flexDirection: 'row',
    backgroundColor: P.surface,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: P.border,
    marginBottom: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: P.primary,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: P.muted,
  },
  tabTextActive: {
    color: '#FFF',
  },

  // Address Card
  addressCard: {
    backgroundColor: P.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: P.border,
  },
  addressCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  addressTypeRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  addressTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  addressTypeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  defaultBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: P.emeraldLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  defaultBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: P.emerald,
  },
  editIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: P.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressCardContent: {
    flexDirection: 'row',
    gap: 12,
  },
  addressIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: P.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressInfo: {
    flex: 1,
    gap: 3,
  },
  addressName: {
    fontSize: 15,
    fontWeight: '700',
    color: P.text,
  },
  addressDetail: {
    fontSize: 12,
    color: P.textSecondary,
    lineHeight: 17,
  },
  addressPhone: {
    fontSize: 12,
    fontWeight: '600',
    color: P.primary,
    marginTop: 2,
  },
  addressCardActions: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: P.border,
  },
  cardActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: P.inputBg,
  },
  cardActionText: {
    fontSize: 11,
    fontWeight: '600',
    color: P.textSecondary,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: P.text,
  },
  emptySubtitle: {
    fontSize: 13,
    color: P.muted,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: P.primary,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginTop: 8,
  },
  emptyBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: P.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: P.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },

  // Form Screen
  formScreen: {
    flex: 1,
    backgroundColor: P.bg,
    paddingTop: STATUSBAR_HEIGHT,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: P.surface,
    borderBottomWidth: 1,
    borderBottomColor: P.border,
  },
  formCloseBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: P.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formHeaderSpacer: { width: 38 },
  formTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: P.text,
  },
  formContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 14,
  },

  // Type Selector
  typeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  typeCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: P.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 2,
    borderColor: P.border,
  },
  typeCardActive: {
    borderColor: P.primary,
    backgroundColor: P.primaryLight,
  },
  typeText: {
    fontSize: 14,
    fontWeight: '700',
    color: P.muted,
  },
  typeTextActive: {
    color: P.primary,
  },

  // Form Card
  formCard: {
    backgroundColor: P.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: P.border,
    gap: 14,
  },
  formSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: P.text,
    marginBottom: 2,
  },
  formField: {
    gap: 6,
  },
  formLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: P.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  formInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: P.inputBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: P.border,
    paddingHorizontal: 12,
    height: 46,
  },
  formInputIcon: {
    marginRight: 10,
  },
  formInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: P.text,
  },
  formRow: {
    flexDirection: 'row',
    gap: 10,
  },
  formHalf: {
    flex: 1,
  },

  // Default Toggle Card
  defaultToggleCard: {
    backgroundColor: P.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: P.border,
  },
  defaultToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  defaultToggleTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: P.text,
  },
  defaultToggleDesc: {
    fontSize: 11,
    color: P.muted,
    marginTop: 2,
  },

  // Save Button
  saveBtn: {
    backgroundColor: P.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
});

export default AddressesScreen;
