import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addPaymentMethod, fetchWallet, requestWithdrawal } from '../api/account';
import { useAuth } from '../auth/AuthContext';
import { ErrorState, LoadingState } from '../components/StateViews';
import { formatCurrency } from '../utils/format';

// ─── Premium Palette ────────────────────────────────────────────────────────

const P = {
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  primary: '#0F172A',
  accent: '#6366F1',
  accentLight: '#EEF2FF',
  gold: '#F59E0B',
  goldLight: '#FFFBEB',
  emerald: '#10B981',
  emeraldLight: '#ECFDF5',
  rose: '#EF4444',
  roseLight: '#FFF5F5',
  sky: '#3B82F6',
  skyLight: '#EFF6FF',
  text: '#0F172A',
  textSecondary: '#475569',
  muted: '#94A3B8',
  border: '#E2E8F0',
  inputBg: '#F1F5F9',
};

// ─── Types ──────────────────────────────────────────────────────────────────

type PaymentMethodForm = {
  label: string;
  accountHolder: string;
  accountNumber: string;
  ifsc: string;
  bankName: string;
  upiId: string;
};

type ActivityItem = {
  _id?: string;
  id?: string;
  section?: string;
  type?: string;
  status?: string;
  paymentStatus?: string;
  amount?: number;
  totalAmount?: number;
  currency?: string;
  createdAt?: string;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function getActivityIcon(section: string): string {
  switch (section) {
    case 'Withdrawal':
      return 'arrow-up-circle';
    case 'Payment':
      return 'credit-card';
    case 'Transaction':
      return 'swap-horizontal';
    default:
      return 'receipt';
  }
}

function getActivityColor(section: string): string {
  switch (section) {
    case 'Withdrawal':
      return P.rose;
    case 'Payment':
      return P.sky;
    case 'Transaction':
      return P.emerald;
    default:
      return P.muted;
  }
}

function getActivityLabel(item: ActivityItem): string {
  return item.section ?? item.type ?? 'Activity';
}

function getActivityStatus(item: ActivityItem): string {
  const s = (item.status ?? item.paymentStatus ?? 'recorded') as string;
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Component ──────────────────────────────────────────────────────────────

function WalletScreen() {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { activeRole } = useAuth();
  const role: string = activeRole === 'seller' ? 'seller' : 'buyer';

  const [method, setMethod] = useState<PaymentMethodForm>({
    label: '',
    accountHolder: '',
    accountNumber: '',
    ifsc: '',
    bankName: '',
    upiId: '',
  });
  const [withdrawal, setWithdrawal] = useState('');
  const [showAddMethod, setShowAddMethod] = useState(false);
  const [paymentMethodId, setPaymentMethodId] = useState('');

  const wallet = useQuery({
    queryKey: ['wallet', role],
    queryFn: () => fetchWallet(role),
  });

  const summary: Record<string, number> = (wallet.data?.summary ?? {}) as Record<string, number>;
  const paymentMethods = useMemo<Array<Record<string, unknown>>>(
    () => (wallet.data?.paymentMethods ?? []) as Array<Record<string, unknown>>,
    [wallet.data?.paymentMethods],
  );

  useEffect(() => {
    if (!paymentMethodId && paymentMethods.length) {
      const preferred = paymentMethods.find(item => item.isDefault) ?? paymentMethods[0];
      setPaymentMethodId(String(preferred._id ?? preferred.id ?? ''));
    }
  }, [paymentMethodId, paymentMethods]);
  const listData: ActivityItem[] = useMemo(
    () => {
      const transactions = wallet.data?.transactions ?? [];
      const withdrawals = wallet.data?.withdrawals ?? [];
      const payments = wallet.data?.payments ?? [];
      return [
        ...transactions.map(item => ({ ...item, section: 'Transaction' })),
        ...withdrawals.map(item => ({ ...item, section: 'Withdrawal' })),
        ...payments.map(item => ({ ...item, section: 'Payment' })),
      ] as ActivityItem[];
    },
    [wallet.data?.payments, wallet.data?.transactions, wallet.data?.withdrawals],
  );

  const createMethod = useMutation({
    mutationFn: () =>
      addPaymentMethod({
        role,
        type: method.upiId ? 'upi' : 'bank_account',
        ...method,
        holderName: method.accountHolder,
        label: method.label || method.bankName || 'Payment method',
      }),
    onSuccess: async () => {
      setMethod({ label: '', accountHolder: '', accountNumber: '', ifsc: '', bankName: '', upiId: '' });
      setShowAddMethod(false);
      await queryClient.invalidateQueries({ queryKey: ['wallet', role] });
      Alert.alert('✓ Method Added', 'Your payment method has been saved.');
    },
    onError: (error: unknown) =>
      Alert.alert('Failed', error instanceof Error ? error.message : 'Unable to save.'),
  });

  const createWithdrawal = useMutation({
    mutationFn: () => requestWithdrawal({
      amount: Number(withdrawal),
      currency: 'INR',
      paymentMethodId,
    }),
    onSuccess: async () => {
      setWithdrawal('');
      await queryClient.invalidateQueries({ queryKey: ['wallet', role] });
      Alert.alert('✓ Requested', 'Withdrawal submitted successfully.');
    },
    onError: (error: unknown) =>
      Alert.alert('Failed', error instanceof Error ? error.message : 'Unable to withdraw.'),
  });

  if (wallet.isLoading) return <LoadingState label="Loading wallet..." />;
  if (wallet.isError)
    return (
      <ErrorState
        message={(wallet.error as Error)?.message ?? 'Failed to load'}
        onRetry={() => wallet.refetch()}
      />
    );

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={P.bg} />

      <FlatList
        data={listData}
        keyExtractor={(item, index) => String(item._id ?? item.id ?? index)}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={wallet.isFetching}
            onRefresh={() => wallet.refetch()}
            tintColor={P.accent}
          />
        }
        ListHeaderComponent={
          <View>
            {/* Header */}
            <View style={styles.header}>
              <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
                <Icon name="arrow-left" size={22} color={P.text} />
              </Pressable>
              <Text style={styles.headerTitle}>Wallet</Text>
              <View style={styles.backBtn} />
            </View>

            {/* Balance Card */}
            <View style={styles.balanceCard}>
              <View style={styles.balanceGlow} />
              <Text style={styles.balanceLabel}>Total Balance</Text>
              <Text style={styles.balanceAmount}>
                {formatCurrency(summary.balance ?? 0, 'INR')}
              </Text>
              <View style={styles.balanceGrid}>
                <View style={styles.balanceItem}>
                  <Text style={styles.balanceItemValue}>
                    {formatCurrency(summary.escrowBalance ?? 0, 'INR')}
                  </Text>
                  <Text style={styles.balanceItemLabel}>In Escrow</Text>
                </View>
                <View style={styles.balanceDivider} />
                <View style={styles.balanceItem}>
                  <Text style={styles.balanceItemValue}>
                    {role === 'seller'
                      ? formatCurrency(summary.withdrawableAmount ?? 0, 'INR')
                      : formatCurrency(summary.orderPaymentTotal ?? 0, 'INR')}
                  </Text>
                  <Text style={styles.balanceItemLabel}>
                    {role === 'seller' ? 'Withdrawable' : 'Orders'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Payment Methods */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Payment Methods</Text>
                <Pressable onPress={() => setShowAddMethod(v => !v)} style={styles.addBtn}>
                  <Icon name={showAddMethod ? 'close' : 'plus'} size={18} color={P.accent} />
                </Pressable>
              </View>

              {/* Saved Methods */}
              {paymentMethods.length > 0 && (
                <View style={styles.methodList}>
                  {paymentMethods.map((item: Record<string, unknown>, i: number) => (
                    <Pressable
                      key={String(item._id ?? item.id ?? i)}
                      onPress={() => setPaymentMethodId(String(item._id ?? item.id ?? ''))}
                      style={[styles.methodCard, paymentMethodId === String(item._id ?? item.id ?? '') && styles.methodCardSelected]}>
                      <View style={[styles.methodIcon, { backgroundColor: P.accentLight }]}>
                        <Icon
                          name={item.type === 'upi' ? 'cellphone' : 'bank'}
                          size={20}
                          color={P.accent}
                        />
                      </View>
                      <View style={styles.methodInfo}>
                        <Text style={styles.methodTitle} numberOfLines={1}>
                          {String(item.label ?? item.bankName ?? item.upiId ?? 'Method')}
                        </Text>
                        <Text style={styles.methodMeta}>
                          {String(item.holderName ?? item.maskedAccountNumber ?? item.type ?? '')}
                        </Text>
                      </View>
                      <Icon
                        name={paymentMethodId === String(item._id ?? item.id ?? '') ? 'check-circle' : 'circle-outline'}
                        size={18}
                        color={paymentMethodId === String(item._id ?? item.id ?? '') ? P.emerald : P.muted}
                      />
                    </Pressable>
                  ))}
                </View>
              )}

              {/* Add Method Form */}
              {showAddMethod && (
                <View style={styles.addMethodForm}>
                  <InputField
                    label="Label / Nickname"
                    value={method.label}
                    onChangeText={label => setMethod({ ...method, label })}
                    placeholder="e.g. Business Account"
                  />
                  <InputField
                    label="Account Holder Name"
                    value={method.accountHolder}
                    onChangeText={accountHolder => setMethod({ ...method, accountHolder })}
                    placeholder="Full name"
                  />
                  <InputField
                    label="Account Number"
                    value={method.accountNumber}
                    onChangeText={accountNumber => setMethod({ ...method, accountNumber })}
                    placeholder="Account number"
                    keyboardType="numeric"
                  />
                  <InputField
                    label="IFSC Code"
                    value={method.ifsc}
                    onChangeText={ifsc => setMethod({ ...method, ifsc })}
                    placeholder="IFSC"
                  />
                  <InputField
                    label="Bank Name"
                    value={method.bankName}
                    onChangeText={bankName => setMethod({ ...method, bankName })}
                    placeholder="Bank name"
                  />
                  <InputField
                    label="UPI ID (optional)"
                    value={method.upiId}
                    onChangeText={upiId => setMethod({ ...method, upiId })}
                    placeholder="user@upi"
                  />
                  <Pressable
                    onPress={() => createMethod.mutate()}
                    disabled={createMethod.isPending || (!method.accountNumber && !method.upiId)}
                    style={[
                      styles.submitBtn,
                      createMethod.isPending && styles.submitBtnDisabled,
                    ]}>
                    {createMethod.isPending ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <Text style={styles.submitBtnText}>Save Method</Text>
                    )}
                  </Pressable>
                </View>
              )}
            </View>

            {/* Withdrawal (Seller Only) */}
            {role === 'seller' && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Quick Withdraw</Text>
                <View style={styles.withdrawCard}>
                  <View style={styles.withdrawInput}>
                    <Text style={styles.currencySymbol}>₹</Text>
                    <TextInput
                      value={withdrawal}
                      onChangeText={setWithdrawal}
                      keyboardType="numeric"
                      placeholder="Enter amount"
                      placeholderTextColor={P.muted}
                      style={styles.withdrawTextInput}
                    />
                  </View>
                  <Pressable
                    onPress={() => createWithdrawal.mutate()}
                    disabled={createWithdrawal.isPending || !withdrawal || !paymentMethodId}
                    style={[
                      styles.withdrawBtn,
                      (createWithdrawal.isPending || !withdrawal || !paymentMethodId) && styles.submitBtnDisabled,
                    ]}>
                    {createWithdrawal.isPending ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <>
                        <Icon name="arrow-up-circle" size={16} color="#FFF" />
                        <Text style={styles.withdrawBtnText}>Withdraw</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </View>
            )}

            {/* Activity Header */}
            {listData.length > 0 && (
              <View style={styles.activityHeader}>
                <Text style={styles.sectionTitle}>Recent Activity</Text>
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const icon = getActivityIcon(item.section ?? 'Transaction');
          const color = getActivityColor(item.section ?? 'Transaction');
          const label = getActivityLabel(item);
          const status = getActivityStatus(item);
          const amount = Number(item.amount ?? item.totalAmount ?? 0);
          const currency = String(item.currency ?? 'INR');

          return (
            <View style={styles.activityRow}>
              <View style={[styles.activityIcon, { backgroundColor: color + '15' }]}>
                <Icon name={icon} size={18} color={color} />
              </View>
              <View style={styles.activityInfo}>
                <Text style={styles.activityLabel}>{label}</Text>
                <Text style={styles.activityStatus}>{status}</Text>
              </View>
              <Text
                style={[
                  styles.activityAmount,
                  { color: item.section === 'Withdrawal' ? P.rose : P.text },
                ]}>
                {item.section === 'Withdrawal' ? '-' : '+'}
                {formatCurrency(amount, currency)}
              </Text>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Icon name="wallet-outline" size={40} color={P.muted} />
            <Text style={styles.emptyText}>No activity yet</Text>
          </View>
        }
      />
    </View>
  );
}

// ─── Input Field ────────────────────────────────────────────────────────────

function InputField({
  label,
  ...props
}: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={P.muted}
        style={styles.fieldInput}
        {...props}
      />
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: P.bg,
  },
  content: {
    paddingBottom: 100,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: P.bg,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: P.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: P.border,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: P.text,
    letterSpacing: -0.3,
  },

  // Balance Card
  balanceCard: {
    marginHorizontal: 16,
    backgroundColor: P.primary,
    borderRadius: 20,
    padding: 20,
    position: 'relative',
    overflow: 'hidden',
  },
  balanceGlow: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: P.accent,
    opacity: 0.15,
  },
  balanceLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFF',
    marginTop: 4,
    letterSpacing: -0.5,
  },
  balanceGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.15)',
  },
  balanceItem: {
    flex: 1,
  },
  balanceItemValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
  },
  balanceItemLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
  balanceDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginHorizontal: 12,
  },

  // Sections
  section: {
    marginTop: 20,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: P.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: P.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Payment Methods
  methodList: {
    gap: 8,
    marginBottom: 10,
  },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: P.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: P.border,
  },
  methodCardSelected: { borderColor: P.emerald, borderWidth: 2 },
  methodIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodInfo: {
    flex: 1,
  },
  methodTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: P.text,
  },
  methodMeta: {
    fontSize: 11,
    color: P.muted,
    marginTop: 2,
  },

  // Add Method Form
  addMethodForm: {
    backgroundColor: P.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: P.border,
    gap: 4,
  },
  fieldWrap: {
    marginBottom: 10,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: P.textSecondary,
    marginBottom: 4,
  },
  fieldInput: {
    backgroundColor: P.inputBg,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 42,
    fontSize: 13,
    fontWeight: '500',
    color: P.text,
    borderWidth: 1,
    borderColor: P.border,
  },
  submitBtn: {
    backgroundColor: P.accent,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    marginTop: 6,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },

  // Withdraw
  withdrawCard: {
    backgroundColor: P.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: P.border,
    gap: 10,
  },
  withdrawInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: P.inputBg,
    borderRadius: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: P.border,
  },
  currencySymbol: {
    fontSize: 20,
    fontWeight: '700',
    color: P.text,
  },
  withdrawTextInput: {
    flex: 1,
    height: 48,
    fontSize: 18,
    fontWeight: '600',
    color: P.text,
  },
  withdrawBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: P.primary,
    borderRadius: 10,
    height: 44,
  },
  withdrawBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },

  // Activity
  activityHeader: {
    paddingHorizontal: 16,
    marginTop: 24,
    marginBottom: 8,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 2,
    backgroundColor: P.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: P.border,
  },
  activityIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityInfo: {
    flex: 1,
  },
  activityLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: P.text,
  },
  activityStatus: {
    fontSize: 11,
    color: P.muted,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  activityAmount: {
    fontSize: 13,
    fontWeight: '700',
  },

  // Empty
  emptyWrap: {
    alignItems: 'center',
    padding: 40,
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    color: P.muted,
    fontWeight: '500',
  },
});

export default WalletScreen;
