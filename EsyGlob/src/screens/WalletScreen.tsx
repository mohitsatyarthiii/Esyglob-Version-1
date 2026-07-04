import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addPaymentMethod, fetchWallet, requestWithdrawal } from '../api/account';
import { useAuth } from '../auth/AuthContext';
import { ErrorState, LoadingState } from '../components/StateViews';
import { colors, radii, spacing } from '../theme';
import { formatCurrency } from '../utils/format';

function WalletScreen() {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { activeRole } = useAuth();
  const role = activeRole === 'seller' ? 'seller' : 'buyer';
  const wallet = useQuery({ queryKey: ['wallet', role], queryFn: () => fetchWallet(role) });
  const [method, setMethod] = useState({ label: '', accountHolder: '', accountNumber: '', ifsc: '', bankName: '', upiId: '' });
  const [withdrawal, setWithdrawal] = useState('');
  const summary = wallet.data?.summary ?? {};
  const listData = useMemo<Array<Record<string, unknown>>>(() => [
    ...(wallet.data?.transactions ?? []).map(item => ({ ...item, section: 'Transaction' })),
    ...(wallet.data?.withdrawals ?? []).map(item => ({ ...item, section: 'Withdrawal' })),
    ...(wallet.data?.payments ?? []).map(item => ({ ...item, section: 'Payment' })),
  ], [wallet.data]);

  const createMethod = useMutation({
    mutationFn: () => addPaymentMethod({ role, type: method.upiId ? 'upi' : 'bank', ...method, label: method.label || method.bankName || 'Payment method' }),
    onSuccess: async () => {
      setMethod({ label: '', accountHolder: '', accountNumber: '', ifsc: '', bankName: '', upiId: '' });
      await queryClient.invalidateQueries({ queryKey: ['wallet', role] });
      Alert.alert('Payment method saved', 'Your payment method is ready.');
    },
    onError: error => Alert.alert('Payment method failed', error instanceof Error ? error.message : 'Unable to save payment method.'),
  });

  const createWithdrawal = useMutation({
    mutationFn: () => requestWithdrawal({ amount: Number(withdrawal), currency: 'INR' }),
    onSuccess: async () => {
      setWithdrawal('');
      await queryClient.invalidateQueries({ queryKey: ['wallet', role] });
      Alert.alert('Withdrawal requested', 'Your withdrawal request was submitted.');
    },
    onError: error => Alert.alert('Withdrawal failed', error instanceof Error ? error.message : 'Unable to request withdrawal.'),
  });

  if (wallet.isLoading) {
    return <LoadingState label="Loading wallet" />;
  }

  if (wallet.isError) {
    return <ErrorState message={(wallet.error as Error).message} onRetry={() => wallet.refetch()} />;
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={wallet.isFetching} onRefresh={() => wallet.refetch()} />}
      data={listData}
      keyExtractor={(item, index) => String(item._id ?? item.id ?? index)}
      ListHeaderComponent={(
        <>
          <View style={styles.header}>
            <Pressable onPress={() => navigation.goBack()} style={styles.back}><Icon name="arrow-left" size={22} color={colors.ink} /></Pressable>
            <Text style={styles.title}>Esy Wallet</Text>
          </View>

          <View style={styles.summaryGrid}>
            <Metric label={role === 'seller' ? 'Available' : 'Balance'} value={summary.balance ?? 0} />
            <Metric label="Escrow" value={summary.escrowBalance ?? 0} />
            <Metric label={role === 'seller' ? 'Pending' : 'Orders'} value={role === 'seller' ? summary.pendingSettlement ?? 0 : summary.orderPaymentTotal ?? 0} />
            <Metric label={role === 'seller' ? 'Withdrawable' : 'Subscriptions'} value={role === 'seller' ? summary.withdrawableAmount ?? 0 : summary.subscriptionPaymentTotal ?? 0} />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Payment Methods</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.methodRow}>
              {(wallet.data?.paymentMethods ?? []).map(item => (
                <View key={String(item._id ?? item.id)} style={styles.methodCard}>
                  <Icon name={String(item.type) === 'upi' ? 'qrcode' : 'bank-outline'} size={22} color={colors.primary} />
                  <Text numberOfLines={1} style={styles.methodTitle}>{String(item.label ?? item.bankName ?? item.upiId ?? 'Payment method')}</Text>
                  <Text numberOfLines={1} style={styles.methodMeta}>{String(item.accountHolder ?? item.type ?? '')}</Text>
                </View>
              ))}
            </ScrollView>
            <Field label="Label" value={method.label} onChangeText={label => setMethod({ ...method, label })} />
            <Field label="Account Holder" value={method.accountHolder} onChangeText={accountHolder => setMethod({ ...method, accountHolder })} />
            <Field label="Account Number" value={method.accountNumber} onChangeText={accountNumber => setMethod({ ...method, accountNumber })} />
            <Field label="IFSC" value={method.ifsc} onChangeText={ifsc => setMethod({ ...method, ifsc })} />
            <Field label="Bank Name" value={method.bankName} onChangeText={bankName => setMethod({ ...method, bankName })} />
            <Field label="UPI ID" value={method.upiId} onChangeText={upiId => setMethod({ ...method, upiId })} />
            <Pressable disabled={createMethod.isPending} onPress={() => createMethod.mutate()} style={styles.secondary}>
              <Text style={styles.secondaryText}>{createMethod.isPending ? 'Saving...' : 'Save Payment Method'}</Text>
            </Pressable>
          </View>

          {role === 'seller' ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Withdrawals</Text>
              <Field label="Amount" value={withdrawal} keyboardType="numeric" onChangeText={setWithdrawal} />
              <Pressable disabled={createWithdrawal.isPending} onPress={() => createWithdrawal.mutate()} style={styles.secondary}>
                <Text style={styles.secondaryText}>{createWithdrawal.isPending ? 'Submitting...' : 'Request Withdrawal'}</Text>
              </Pressable>
            </View>
          ) : null}

          <Text style={styles.sectionTitle}>Activity</Text>
        </>
      )}
      renderItem={({ item }) => <Activity item={item} />}
      ListEmptyComponent={<Text style={styles.empty}>No wallet activity yet.</Text>}
    />
  );  
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{formatCurrency(value, 'INR')}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function Field({ label, value, onChangeText, keyboardType }: { label: string; value: string; onChangeText: (value: string) => void; keyboardType?: 'default' | 'numeric' }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} keyboardType={keyboardType} style={styles.input} placeholderTextColor={colors.muted} />
    </View>
  );
}

function Activity({ item }: { item: Record<string, unknown> }) {
  return (
    <View style={styles.activity}>
      <Icon name={String(item.section) === 'Withdrawal' ? 'cash-minus' : 'receipt'} size={22} color={colors.primary} />
      <View style={styles.activityBody}>
        <Text style={styles.activityTitle}>{String(item.section ?? item.type ?? 'Activity')}</Text>
        <Text style={styles.activityMeta}>{String(item.status ?? item.paymentStatus ?? 'recorded')}</Text>
      </View>
      <Text style={styles.amount}>{formatCurrency(Number(item.amount ?? item.totalAmount ?? 0), String(item.currency ?? 'INR'))}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 112, paddingTop: spacing.xxl },
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  back: { alignItems: 'center', backgroundColor: colors.card, borderRadius: radii.pill, height: 42, justifyContent: 'center', width: 42 },
  title: { color: colors.ink, fontSize: 22, fontWeight: '900' },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  metric: { backgroundColor: colors.card, borderRadius: radii.md, padding: spacing.md, width: '47.8%' },
  metricValue: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  metricLabel: { color: colors.muted, fontSize: 12, fontWeight: '800', marginTop: spacing.xs },
  card: { backgroundColor: colors.card, borderRadius: radii.md, marginTop: spacing.md, padding: spacing.lg },
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: '900', marginBottom: spacing.md },
  methodRow: { gap: spacing.md, paddingBottom: spacing.sm },
  methodCard: { backgroundColor: colors.cardMuted, borderRadius: radii.md, padding: spacing.md, width: 160 },
  methodTitle: { color: colors.ink, fontWeight: '900', marginTop: spacing.sm },
  methodMeta: { color: colors.muted, fontSize: 12, fontWeight: '700', marginTop: spacing.xs },
  field: { marginBottom: spacing.md },
  label: { color: colors.muted, fontSize: 12, fontWeight: '900', marginBottom: spacing.xs, textTransform: 'uppercase' },
  input: { backgroundColor: colors.cardMuted, borderRadius: radii.md, color: colors.ink, fontSize: 15, fontWeight: '700', minHeight: 46, paddingHorizontal: spacing.md },
  secondary: { alignItems: 'center', backgroundColor: colors.ink, borderRadius: radii.pill, paddingVertical: spacing.md },
  secondaryText: { color: '#fff', fontWeight: '900' },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '900', marginTop: spacing.xl, marginBottom: spacing.md },
  activity: { alignItems: 'center', backgroundColor: colors.card, borderRadius: radii.md, flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md, padding: spacing.md },
  activityBody: { flex: 1 },
  activityTitle: { color: colors.ink, fontWeight: '900' },
  activityMeta: { color: colors.muted, fontSize: 12, fontWeight: '700', marginTop: spacing.xs },
  amount: { color: colors.ink, fontWeight: '900' },
  empty: { color: colors.muted, fontWeight: '800', textAlign: 'center' },
});

export default WalletScreen;
