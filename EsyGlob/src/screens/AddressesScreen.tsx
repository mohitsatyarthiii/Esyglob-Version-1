import React, { useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AddressBookItem, createAddress, deleteAddress, fetchAddresses, setDefaultAddress, updateAddress } from '../api/account';
import { ErrorState, LoadingState } from '../components/StateViews';
import { colors, radii, spacing } from '../theme';
import { getId } from '../utils/format';

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

function AddressesScreen() {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const addresses = useQuery({ queryKey: ['addresses'], queryFn: fetchAddresses });
  const [form, setForm] = useState<AddressBookItem>(emptyAddress);
  const [editingId, setEditingId] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['addresses'] });

  const save = useMutation({
    mutationFn: () => editingId ? updateAddress(editingId, form) : createAddress(form),
    onSuccess: async () => {
      setForm(emptyAddress);
      setEditingId(null);
      await refresh();
    },
    onError: error => Alert.alert('Address save failed', error instanceof Error ? error.message : 'Unable to save address.'),
  });
  const makeDefault = useMutation({ mutationFn: setDefaultAddress, onSuccess: refresh });
  const remove = useMutation({ mutationFn: deleteAddress, onSuccess: refresh });

  if (addresses.isLoading) {
    return <LoadingState label="Loading addresses" />;
  }

  if (addresses.isError) {
    return <ErrorState message={(addresses.error as Error).message} onRetry={() => addresses.refetch()} />;
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={addresses.isFetching} onRefresh={() => addresses.refetch()} />}
      data={addresses.data ?? []}
      keyExtractor={item => getId(item)}
      ListHeaderComponent={(
        <>
          <View style={styles.header}>
            <Pressable onPress={() => navigation.goBack()} style={styles.back}><Icon name="arrow-left" size={22} color={colors.ink} /></Pressable>
            <Text style={styles.title}>My Addresses</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{editingId ? 'Edit Address' : 'Add Address'}</Text>
            <Field label="Full Name" value={form.fullName} onChangeText={fullName => setForm({ ...form, fullName })} />
            <Field label="Phone" value={form.phone} keyboardType="phone-pad" onChangeText={phone => setForm({ ...form, phone })} />
            <Field label="Street Address" value={form.line1 ?? form.street} onChangeText={line1 => setForm({ ...form, line1 })} />
            <Field label="Address Line 2" value={form.line2} onChangeText={line2 => setForm({ ...form, line2 })} />
            <Field label="City" value={form.city} onChangeText={city => setForm({ ...form, city })} />
            <Field label="State" value={form.state} onChangeText={state => setForm({ ...form, state })} />
            <Field label="Country" value={form.country} onChangeText={country => setForm({ ...form, country })} />
            <Field label="Pincode" value={form.pincode ?? form.postalCode} keyboardType="numeric" onChangeText={pincode => setForm({ ...form, pincode })} />
            <Pressable onPress={() => setForm({ ...form, isDefault: !form.isDefault })} style={styles.defaultToggle}>
              <Icon name={form.isDefault ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'} size={20} color={colors.primary} />
              <Text style={styles.defaultText}>Set as default shipping address</Text>
            </Pressable>
            <Pressable disabled={save.isPending} onPress={() => save.mutate()} style={styles.primary}>
              <Text style={styles.primaryText}>{save.isPending ? 'Saving...' : editingId ? 'Update Address' : 'Add Address'}</Text>
            </Pressable>
          </View>
          <Text style={styles.sectionTitle}>Saved Addresses</Text>
        </>
      )}
      renderItem={({ item }) => (
        <AddressRow
          item={item}
          onEdit={() => {
            setEditingId(getId(item));
            setForm({ ...emptyAddress, ...item, line1: item.line1 ?? item.street, pincode: item.pincode ?? item.postalCode });
          }}
          onDefault={() => makeDefault.mutate(getId(item))}
          onDelete={() => Alert.alert('Delete address', 'Remove this address?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(getId(item)) },
          ])}
        />
      )}
      ListEmptyComponent={<Text style={styles.empty}>No saved addresses yet.</Text>}
    />
  );
}

function Field({ label, value, onChangeText, keyboardType }: { label: string; value?: string; onChangeText: (value: string) => void; keyboardType?: 'default' | 'numeric' | 'phone-pad' }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput value={value ?? ''} onChangeText={onChangeText} keyboardType={keyboardType} style={styles.input} placeholderTextColor={colors.muted} />
    </View>
  );
}

function AddressRow({ item, onEdit, onDefault, onDelete }: { item: AddressBookItem; onEdit: () => void; onDefault: () => void; onDelete: () => void }) {
  return (
    <View style={styles.address}>
      <View style={styles.addressIcon}><Icon name="map-marker-outline" size={22} color={colors.primary} /></View>
      <View style={styles.addressBody}>
        <Text style={styles.addressTitle}>{item.fullName ?? 'Address'} {item.isDefault ? <Text style={styles.defaultBadge}>Default</Text> : null}</Text>
        <Text style={styles.addressText}>{[item.line1 ?? item.street, item.line2, item.city, item.state, item.country, item.pincode ?? item.postalCode].filter(Boolean).join(', ')}</Text>
        <Text style={styles.addressText}>{item.phone}</Text>
        <View style={styles.rowActions}>
          <Pressable onPress={onEdit} style={styles.smallAction}><Text style={styles.smallActionText}>Edit</Text></Pressable>
          {!item.isDefault ? <Pressable onPress={onDefault} style={styles.smallAction}><Text style={styles.smallActionText}>Default</Text></Pressable> : null}
          <Pressable onPress={onDelete} style={styles.smallAction}><Text style={styles.smallActionText}>Delete</Text></Pressable>
        </View>
      </View>
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
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: '900', marginBottom: spacing.md },
  field: { marginBottom: spacing.md },
  label: { color: colors.muted, fontSize: 12, fontWeight: '900', marginBottom: spacing.xs, textTransform: 'uppercase' },
  input: { backgroundColor: colors.cardMuted, borderRadius: radii.md, color: colors.ink, fontSize: 15, fontWeight: '700', minHeight: 46, paddingHorizontal: spacing.md },
  defaultToggle: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  defaultText: { color: colors.ink, flex: 1, fontWeight: '800' },
  primary: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.pill, paddingVertical: spacing.md },
  primaryText: { color: '#fff', fontWeight: '900' },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '900', marginBottom: spacing.md },
  address: { alignItems: 'flex-start', backgroundColor: colors.card, borderRadius: radii.md, flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md, padding: spacing.md },
  addressIcon: { alignItems: 'center', backgroundColor: colors.cardMuted, borderRadius: radii.pill, height: 42, justifyContent: 'center', width: 42 },
  addressBody: { flex: 1 },
  addressTitle: { color: colors.ink, fontWeight: '900' },
  addressText: { color: colors.text, fontSize: 13, fontWeight: '700', lineHeight: 18, marginTop: spacing.xs },
  defaultBadge: { color: colors.green, fontSize: 12 },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  smallAction: { backgroundColor: colors.cardMuted, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  smallActionText: { color: colors.primaryDark, fontSize: 12, fontWeight: '900' },
  empty: { color: colors.muted, fontWeight: '800', textAlign: 'center' },
});

export default AddressesScreen;
