import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
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
import { useCurrency } from '../currency/CurrencyContext';
import { ErrorState, LoadingState } from '../components/StateViews';

// ─── Types ──────────────────────────────────────────────────────────────────

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
  [key: string]: unknown;
};

type FilterType = 'all' | 'credits' | 'debits';

// ─── Component ──────────────────────────────────────────────────────────────

function WalletScreen() {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { activeRole } = useAuth();
  const { formatPrice, selectedCurrency: currency } = useCurrency();
  const role: string = activeRole === 'seller' ? 'seller' : 'buyer';

  const [showAddModal, setShowAddModal] = useState(false);
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [activityFilter, setActivityFilter] = useState<FilterType>('all');
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [method, setMethod] = useState({
    label: '', accountHolder: '', accountNumber: '', ifsc: '', bankName: '', upiId: '',
  });
  const [withdrawalAmount, setWithdrawalAmount] = useState('');

  const wallet = useQuery({
    queryKey: ['wallet', role],
    queryFn: () => fetchWallet(role),
  });

  const summary = (wallet.data?.summary ?? {}) as Record<string, unknown>;
  const metric = (key: string) => Number(summary[key] ?? 0);
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

  const allActivity: ActivityItem[] = useMemo(() => {
    const txns = (wallet.data?.transactions ?? []) as ActivityItem[];
    const withdrawals = (wallet.data?.withdrawals ?? []) as ActivityItem[];
    const payments = (wallet.data?.payments ?? []) as ActivityItem[];
    return [
      ...txns.map(item => ({ ...item, section: 'Transaction' })),
      ...withdrawals.map(item => ({ ...item, section: 'Withdrawal' })),
      ...payments.map(item => ({ ...item, section: 'Payment' })),
    ].sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
  }, [wallet.data]);

  const filteredActivity = useMemo(() => {
    if (activityFilter === 'credits') return allActivity.filter(item => item.section !== 'Withdrawal' && item.section !== 'Payment');
    if (activityFilter === 'debits') return allActivity.filter(item => item.section === 'Withdrawal' || item.section === 'Payment');
    return allActivity;
  }, [allActivity, activityFilter]);

  const displayedActivity = showAllActivity ? filteredActivity : filteredActivity.slice(0, 5);

  const createMethod = useMutation({
    mutationFn: () => addPaymentMethod({
      role, type: method.upiId ? 'upi' : 'bank_account', ...method,
      holderName: method.accountHolder, label: method.label || method.bankName || 'Payment method',
    }),
    onSuccess: async () => {
      setMethod({ label: '', accountHolder: '', accountNumber: '', ifsc: '', bankName: '', upiId: '' });
      setShowAddModal(false);
      await queryClient.invalidateQueries({ queryKey: ['wallet', role] });
      Alert.alert('Done', 'Payment method saved.');
    },
    onError: (error: unknown) => Alert.alert('Error', error instanceof Error ? error.message : 'Failed'),
  });

  const createWithdrawal = useMutation({
    mutationFn: () => requestWithdrawal({ amount: Number(withdrawalAmount), currency, paymentMethodId }),
    onSuccess: async () => {
      setWithdrawalAmount('');
      setShowWithdrawModal(false);
      await queryClient.invalidateQueries({ queryKey: ['wallet', role] });
      Alert.alert('Done', 'Withdrawal submitted.');
    },
    onError: (error: unknown) => Alert.alert('Error', error instanceof Error ? error.message : 'Failed'),
  });

  const isDebitTransaction = (item: ActivityItem): boolean => {
    return item.section === 'Withdrawal' || item.section === 'Payment';
  };

  const getTransactionLabel = (item: ActivityItem): string => {
    if (item.section === 'Payment') return 'Payment Sent';
    if (item.section === 'Withdrawal') return 'Withdrawal';
    if (item.section === 'Transaction') return 'Payment Received';
    return item.section || 'Activity';
  };

  if (wallet.isLoading) return <LoadingState label="Loading wallet..." />;
  if (wallet.isError) return <ErrorState message={(wallet.error as Error)?.message ?? 'Failed'} onRetry={() => wallet.refetch()} />;

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      <FlatList
        data={displayedActivity}
        keyExtractor={(item, index) => String(item._id ?? item.id ?? index)}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={wallet.isFetching} onRefresh={() => wallet.refetch()} tintColor="#6366f1" />}
        ListHeaderComponent={
          <View>
            {/* Header */}
            <View style={styles.header}>
              <Pressable onPress={() => navigation.goBack()} style={styles.headerBtn}>
                <Icon name="arrow-left" size={22} color="#1a1a1a" />
              </Pressable>
              <Text style={styles.headerTitle}>Wallet</Text>
              <View style={styles.headerBtn} />
            </View>

            {/* Balance Card */}
            <View style={styles.balanceCard}>
              <Text style={styles.balanceLabel}>Total Balance</Text>
              <Text style={styles.balanceAmount}>{formatPrice(metric('balance'), currency)}</Text>
              <View style={styles.balanceRow}>
                <View style={styles.balanceCol}>
                  <Icon name="shield-check-outline" size={14} color="#64748b" />
                  <View>
                    <Text style={styles.balanceColValue}>{formatPrice(metric('escrowBalance'), currency)}</Text>
                    <Text style={styles.balanceColLabel}>In Escrow</Text>
                  </View>
                </View>
                <View style={styles.balanceCol}>
                  <Icon name="wallet-outline" size={14} color="#64748b" />
                  <View>
                    <Text style={styles.balanceColValue}>
                      {formatPrice(role === 'seller' ? metric('withdrawableAmount') : metric('orderPaymentTotal'), currency)}
                    </Text>
                    <Text style={styles.balanceColLabel}>{role === 'seller' ? 'Withdrawable' : 'Orders'}</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Quick Actions */}
            <View style={styles.actionsRow}>
              <Pressable style={styles.actionBtn} onPress={() => setShowAddModal(true)}>
                <View style={[styles.actionIcon, { backgroundColor: '#e0e7ff' }]}>
                  <Icon name="bank-plus" size={20} color="#6366f1" />
                </View>
                <Text style={styles.actionLabel}>Add Bank</Text>
              </Pressable>
              {role === 'seller' && (
                <Pressable style={styles.actionBtn} onPress={() => {
                  if (!paymentMethodId) { Alert.alert('No method', 'Add a payment method first.'); return; }
                  setShowWithdrawModal(true);
                }}>
                  <View style={[styles.actionIcon, { backgroundColor: '#fef3c7' }]}>
                    <Icon name="bank-transfer-out" size={20} color="#f59e0b" />
                  </View>
                  <Text style={styles.actionLabel}>Withdraw</Text>
                </Pressable>
              )}
              <Pressable style={styles.actionBtn} onPress={() => navigation.navigate('Account')}>
                <View style={[styles.actionIcon, { backgroundColor: '#d1fae5' }]}>
                  <Icon name="history" size={20} color="#10b981" />
                </View>
                <Text style={styles.actionLabel}>History</Text>
              </Pressable>
            </View>

            {/* Saved Methods */}
            {paymentMethods.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Saved Methods</Text>
                {paymentMethods.map((item: Record<string, unknown>, i: number) => {
                  const id = String(item._id ?? item.id ?? i);
                  const selected = paymentMethodId === id;
                  return (
                    <Pressable key={id} onPress={() => setPaymentMethodId(id)} style={[styles.methodCard, selected && styles.methodCardSelected]}>
                      <View style={[styles.methodIcon, { backgroundColor: selected ? '#e0e7ff' : '#f1f5f9' }]}>
                        <Icon name={item.type === 'upi' ? 'cellphone' : 'bank'} size={18} color={selected ? '#6366f1' : '#64748b'} />
                      </View>
                      <View style={styles.methodInfo}>
                        <Text style={styles.methodName}>{String(item.label ?? item.bankName ?? 'Method')}</Text>
                        <Text style={styles.methodMeta}>{String(item.holderName ?? item.maskedAccountNumber ?? '')}</Text>
                      </View>
                      {selected && <Icon name="check-circle" size={18} color="#6366f1" />}
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Activity Header */}
            <View style={styles.activityTop}>
              <Text style={styles.sectionTitle}>Activity</Text>
              <View style={styles.filterRow}>
                {(['all', 'credits', 'debits'] as FilterType[]).map(f => (
                  <Pressable
                    key={f}
                    onPress={() => { setActivityFilter(f); setShowAllActivity(false); }}
                    style={[styles.filterChip, activityFilter === f && styles.filterChipActive]}>
                    <Text style={[styles.filterChipText, activityFilter === f && styles.filterChipTextActive]}>
                      {f === 'all' ? 'All' : f === 'credits' ? 'Received' : 'Sent'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const isDebit = isDebitTransaction(item);
          const status = String(item.status ?? item.paymentStatus ?? '').replace(/_/g, ' ');
          const amount = Number(item.amount ?? item.totalAmount ?? 0);
          const itemCurrency = String(item.currency ?? currency);

          return (
            <Pressable
              onPress={() => navigation.navigate('WalletTransactionDetails', {
                activityId: String(item._id ?? item.id ?? ''),
                source: String(item.section).toLowerCase(),
                role,
              })}
              style={({ pressed }) => [styles.txnCard, pressed && styles.txnCardPressed]}>
              <View style={[styles.txnIcon, { backgroundColor: isDebit ? '#fef2f2' : '#f0fdf4' }]}>
                <Icon name={isDebit ? 'arrow-up-right' : 'arrow-down-left'} size={18} color={isDebit ? '#ef4444' : '#10b981'} />
              </View>
              <View style={styles.txnInfo}>
                <Text style={styles.txnLabel}>{getTransactionLabel(item)}</Text>
                <Text style={styles.txnStatus}>{status}</Text>
              </View>
              <Text style={[styles.txnAmount, { color: isDebit ? '#ef4444' : '#10b981' }]}>
                {formatPrice(amount, itemCurrency)}
              </Text>
            </Pressable>
          );
        }}
        ListFooterComponent={
          filteredActivity.length > 5 && !showAllActivity ? (
            <Pressable onPress={() => setShowAllActivity(true)} style={styles.viewAllBtn}>
              <Text style={styles.viewAllText}>View all {filteredActivity.length} transactions</Text>
              <Icon name="chevron-down" size={16} color="#6366f1" />
            </Pressable>
          ) : showAllActivity ? (
            <Pressable onPress={() => setShowAllActivity(false)} style={styles.viewAllBtn}>
              <Text style={styles.viewAllText}>Show less</Text>
              <Icon name="chevron-up" size={16} color="#6366f1" />
            </Pressable>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Icon name="receipt-outline" size={36} color="#cbd5e1" />
            <Text style={styles.emptyText}>No transactions yet</Text>
          </View>
        }
      />

      {/* ─── Add Method Modal ─── */}
      <Modal visible={showAddModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAddModal(false)}>
        <View style={styles.modalScreen}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setShowAddModal(false)} style={styles.modalClose}>
              <Icon name="close" size={22} color="#1a1a1a" />
            </Pressable>
            <Text style={styles.modalTitle}>Add Payment Method</Text>
            <View style={styles.modalClose} />
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalBody}>
            <Field label="Label / Nickname" value={method.label} onChangeText={v => setMethod({ ...method, label: v })} placeholder="Business Account" />
            <Field label="Account Holder Name" value={method.accountHolder} onChangeText={v => setMethod({ ...method, accountHolder: v })} placeholder="Full name" />
            <Field label="Account Number" value={method.accountNumber} onChangeText={v => setMethod({ ...method, accountNumber: v })} placeholder="Account number" keyboardType="numeric" />
            <Field label="IFSC Code" value={method.ifsc} onChangeText={v => setMethod({ ...method, ifsc: v })} placeholder="SBIN0001234" />
            <Field label="Bank Name" value={method.bankName} onChangeText={v => setMethod({ ...method, bankName: v })} placeholder="State Bank of India" />

            <View style={styles.orDivider}>
              <View style={styles.orLine} />
              <Text style={styles.orText}>OR</Text>
              <View style={styles.orLine} />
            </View>

            <Field label="UPI ID" value={method.upiId} onChangeText={v => setMethod({ ...method, upiId: v })} placeholder="username@upi" />

            <Pressable
              onPress={() => createMethod.mutate()}
              disabled={createMethod.isPending || (!method.accountNumber && !method.upiId)}
              style={[styles.saveBtn, createMethod.isPending && styles.btnDisabled]}>
              {createMethod.isPending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnText}>Save Payment Method</Text>}
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      {/* ─── Withdraw Modal ─── */}
      <Modal visible={showWithdrawModal} animationType="fade" transparent onRequestClose={() => setShowWithdrawModal(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowWithdrawModal(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Withdraw Funds</Text>

            <View style={styles.sheetBalance}>
              <Text style={styles.sheetBalanceLabel}>Available</Text>
              <Text style={styles.sheetBalanceAmount}>{formatPrice(metric('withdrawableAmount'), currency)}</Text>
            </View>

            <View style={styles.amountBox}>
              <Text style={styles.currencySymbol}>{currency === 'INR' ? '₹' : currency === 'USD' ? '$' : '€'}</Text>
              <TextInput
                value={withdrawalAmount}
                onChangeText={setWithdrawalAmount}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor="#cbd5e1"
                style={styles.amountInput}
              />
            </View>

            <Pressable
              onPress={() => createWithdrawal.mutate()}
              disabled={createWithdrawal.isPending || !withdrawalAmount || Number(withdrawalAmount) <= 0}
              style={[styles.withdrawConfirmBtn, (createWithdrawal.isPending || !withdrawalAmount) && styles.btnDisabled]}>
              {createWithdrawal.isPending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.withdrawConfirmText}>Confirm Withdrawal</Text>}
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Field Component ────────────────────────────────────────────────────────

function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput placeholderTextColor="#94a3b8" style={styles.fieldInput} {...props} />
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  listContent: { paddingBottom: 100 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: '#fff',
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },

  // Balance Card
  balanceCard: {
    marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 16,
  },
  balanceLabel: { fontSize: 13, fontWeight: '600', color: '#64748b', marginBottom: 4 },
  balanceAmount: { fontSize: 36, fontWeight: '700', color: '#0f172a', letterSpacing: -0.5, marginBottom: 16 },
  balanceRow: { flexDirection: 'row', gap: 20, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  balanceCol: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  balanceColValue: { fontSize: 15, fontWeight: '700', color: '#1e293b' },
  balanceColLabel: { fontSize: 11, color: '#94a3b8', fontWeight: '500', marginTop: 1 },

  // Actions
  actionsRow: { flexDirection: 'row', marginHorizontal: 16, gap: 10, marginBottom: 24 },
  actionBtn: {
    flex: 1, alignItems: 'center', backgroundColor: '#fff', borderRadius: 14,
    padding: 14, gap: 8, borderWidth: 1, borderColor: '#e2e8f0',
  },
  actionIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 12, fontWeight: '600', color: '#475569' },

  // Methods
  section: { marginHorizontal: 16, marginBottom: 24 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  methodCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff',
    borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#e2e8f0',
  },
  methodCardSelected: { borderColor: '#6366f1', backgroundColor: '#fafaff' },
  methodIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  methodInfo: { flex: 1 },
  methodName: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  methodMeta: { fontSize: 12, color: '#94a3b8', marginTop: 2 },

  // Activity Header
  activityTop: {
    marginHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 8,
  },
  filterRow: { flexDirection: 'row', gap: 6 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: '#f1f5f9' },
  filterChipActive: { backgroundColor: '#0f172a' },
  filterChipText: { fontSize: 11, fontWeight: '600', color: '#64748b' },
  filterChipTextActive: { color: '#fff' },

  // Transaction
  txnCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16,
    marginBottom: 6, backgroundColor: '#fff', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#f1f5f9',
  },
  txnCardPressed: { backgroundColor: '#fafafa' },
  txnIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  txnInfo: { flex: 1 },
  txnLabel: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  txnStatus: { fontSize: 11, color: '#94a3b8', marginTop: 2, textTransform: 'capitalize' },
  txnAmount: { fontSize: 15, fontWeight: '700' },

  // View All
  viewAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginHorizontal: 16, marginTop: 14, paddingVertical: 12, backgroundColor: '#fff',
    borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0',
  },
  viewAllText: { fontSize: 13, fontWeight: '600', color: '#6366f1' },

  // Empty
  emptyState: { alignItems: 'center', padding: 40, gap: 8 },
  emptyText: { fontSize: 13, color: '#94a3b8', fontWeight: '500' },

  // Modal
  modalScreen: { flex: 1, backgroundColor: '#fff' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingHorizontal: 16, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  modalClose: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  modalBody: { padding: 16, paddingBottom: 40 },

  // Fields
  fieldWrap: { marginBottom: 16 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#475569', marginBottom: 6 },
  fieldInput: {
    backgroundColor: '#f8fafc', borderRadius: 10, paddingHorizontal: 14, height: 46,
    fontSize: 14, fontWeight: '500', color: '#0f172a', borderWidth: 1, borderColor: '#e2e8f0',
  },

  // OR Divider
  orDivider: { flexDirection: 'row', alignItems: 'center', marginVertical: 20, gap: 12 },
  orLine: { flex: 1, height: 1, backgroundColor: '#e2e8f0' },
  orText: { fontSize: 13, fontWeight: '600', color: '#94a3b8' },

  // Save Button
  saveBtn: {
    backgroundColor: '#6366f1', borderRadius: 12, alignItems: 'center',
    justifyContent: 'center', height: 50, marginTop: 24,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },

  // Withdraw Sheet
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 40,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: '#e2e8f0',
    alignSelf: 'center', marginBottom: 20,
  },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: '#0f172a', marginBottom: 16 },
  sheetBalance: {
    backgroundColor: '#f8fafc', borderRadius: 12, padding: 14, marginBottom: 16,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  sheetBalanceLabel: { fontSize: 12, fontWeight: '500', color: '#64748b' },
  sheetBalanceAmount: { fontSize: 20, fontWeight: '700', color: '#0f172a', marginTop: 4 },
  amountBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc',
    borderRadius: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 20,
  },
  currencySymbol: { fontSize: 24, fontWeight: '700', color: '#0f172a', marginRight: 8 },
  amountInput: { flex: 1, height: 56, fontSize: 24, fontWeight: '600', color: '#0f172a' },
  withdrawConfirmBtn: {
    backgroundColor: '#0f172a', borderRadius: 14, alignItems: 'center',
    justifyContent: 'center', height: 52,
  },
  withdrawConfirmText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

export default WalletScreen;
