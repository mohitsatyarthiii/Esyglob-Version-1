import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
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

// ─── Design System ──────────────────────────────────────────────────────────

const D = {
  surface: '#FFFFFF',
  background: '#F8FAFC',
  text: '#0F172A',
  textSecondary: '#475569',
  textTertiary: '#94A3B8',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  primary: '#2563EB',
  primaryLight: '#EFF6FF',
  primaryDark: '#1E40AF',
  success: '#10B981',
  successLight: '#ECFDF5',
  danger: '#EF4444',
  dangerLight: '#FEF2F2',
  warning: '#F59E0B',
  warningLight: '#FFFBEB',
  cardGradient: ['#1E3A8A', '#2563EB', '#3B82F6'],
};

// ─── Transaction Icons ──────────────────────────────────────────────────────

const getTransactionIcon = (item: ActivityItem): { icon: string; bg: string; color: string } => {
  const type = String(item.type || item.section || '').toLowerCase();
  const credit = Number(item.amount ?? item.totalAmount ?? 0) >= 0 && !type.includes('debit');
  if (type.includes('subscription')) return { icon: 'crown-outline', bg: D.dangerLight, color: D.danger };
  if (type.includes('service')) return { icon: 'briefcase-check-outline', bg: D.dangerLight, color: D.danger };
  if (type.includes('withdrawal') || item.section === 'Withdrawal') {
    return { icon: 'bank-transfer-out', bg: D.dangerLight, color: D.danger };
  }
  if (type.includes('refund')) {
    return { icon: 'cash-refund', bg: D.successLight, color: D.success };
  }
  if (type.includes('escrow')) {
    return { icon: 'shield-lock-outline', bg: credit ? D.successLight : D.dangerLight, color: credit ? D.success : D.danger };
  }
  if (type.includes('topup') || type.includes('top_up') || type.includes('wallet_credit')) {
    return { icon: 'wallet-plus-outline', bg: D.successLight, color: D.success };
  }
  if (type.includes('payment') || type.includes('debit') || item.section === 'Payment') {
    return { icon: 'credit-card-check-outline', bg: D.dangerLight, color: D.danger };
  }
  if (type.includes('commission') || type.includes('fee')) {
    return { icon: 'receipt-text-minus', bg: '#FEFCE8', color: '#CA8A04' };
  }
  return { icon: credit ? 'cash-plus' : 'cash-minus', bg: credit ? D.successLight : D.dangerLight, color: credit ? D.success : D.danger };
};

// ─── Main Component ─────────────────────────────────────────────────────────

function WalletScreen() {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { activeRole } = useAuth();
  const { formatPrice, selectedCurrency: currency } = useCurrency();
  const role: string = activeRole === 'seller' ? 'seller' : 'buyer';

  const [showBankModal, setShowBankModal] = useState(false);
  const [showUpiModal, setShowUpiModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [activityFilter, setActivityFilter] = useState<FilterType>('all');
  const [showAllActivity, setShowAllActivity] = useState(false);
  
  // Bank form
  const [bankForm, setBankForm] = useState({
    label: '', accountHolder: '', accountNumber: '', ifsc: '', bankName: '',
  });
  
  // UPI form
  const [upiForm, setUpiForm] = useState({
    label: '', upiId: '',
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

  const createBankMethod = useMutation({
    mutationFn: () => addPaymentMethod({
      role, type: 'bank_account', ...bankForm,
      holderName: bankForm.accountHolder,
      label: bankForm.label || bankForm.bankName || 'Bank Account',
    }),
    onSuccess: async () => {
      setBankForm({ label: '', accountHolder: '', accountNumber: '', ifsc: '', bankName: '' });
      setShowBankModal(false);
      await queryClient.invalidateQueries({ queryKey: ['wallet', role] });
      Alert.alert('Done', 'Bank account added.');
    },
    onError: (error: unknown) => Alert.alert('Error', error instanceof Error ? error.message : 'Failed'),
  });

  const createUpiMethod = useMutation({
    mutationFn: () => addPaymentMethod({
      role, type: 'upi', ...upiForm,
      label: upiForm.label || upiForm.upiId || 'UPI',
    }),
    onSuccess: async () => {
      setUpiForm({ label: '', upiId: '' });
      setShowUpiModal(false);
      await queryClient.invalidateQueries({ queryKey: ['wallet', role] });
      Alert.alert('Done', 'UPI ID added.');
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

  const getTransactionLabel = (item: ActivityItem): string => {
    if (item.section === 'Payment') return 'Payment Sent';
    if (item.section === 'Withdrawal') return 'Withdrawal';
    if (item.section === 'Transaction') {
      const type = String(item.type || '').toLowerCase();
      if (type.includes('refund')) return 'Refund Received';
      if (type.includes('escrow')) return 'Escrow Released';
      if (type.includes('commission')) return 'Commission';
      return 'Payment Received';
    }
    return item.section || 'Activity';
  };

  if (wallet.isLoading) return <LoadingState label="Loading wallet..." />;
  if (wallet.isError) return <ErrorState message={(wallet.error as Error)?.message ?? 'Failed'} onRetry={() => wallet.refetch()} />;

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={D.surface} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headerBack}>
          <Icon name="arrow-left" size={20} color={D.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Wallet</Text>
        <Pressable 
          onPress={() => navigation.navigate('WalletTransactionDetails', { role })}
          style={styles.headerRight}
        >
          <Icon name="history" size={20} color={D.textSecondary} />
        </Pressable>
      </View>

      <FlatList
        data={displayedActivity}
        keyExtractor={(item, index) => String(item._id ?? item.id ?? index)}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl 
            refreshing={wallet.isFetching} 
            onRefresh={() => wallet.refetch()} 
            tintColor={D.primary}
          />
        }
        ListHeaderComponent={
          <View>
            {/* ── Balance Card ── */}
            <LinearGradient
              colors={D.cardGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.balanceCard}
            >
              {/* Subtle pattern */}
              <View style={styles.cardPattern}>
                <View style={[styles.patternCircle, { width: 120, height: 120, top: -40, right: -30 }]} />
                <View style={[styles.patternCircle, { width: 80, height: 80, bottom: -20, left: -20 }]} />
              </View>

              <Text style={styles.balanceLabel}>TOTAL BALANCE</Text>
              <Text style={styles.balanceAmount}>{formatPrice(metric('balance'), currency)}</Text>
              
              <View style={styles.balanceRow}>
                <View style={styles.balanceItem}>
                  <Text style={styles.balanceItemValue}>{formatPrice(metric('escrowBalance'), currency)}</Text>
                  <Text style={styles.balanceItemLabel}>In Escrow</Text>
                </View>
                <View style={styles.balanceDivider} />
                <View style={styles.balanceItem}>
                  <Text style={styles.balanceItemValue}>
                    {formatPrice(role === 'seller' ? metric('withdrawableAmount') : metric('orderPaymentTotal'), currency)}
                  </Text>
                  <Text style={styles.balanceItemLabel}>{role === 'seller' ? 'Withdrawable' : 'Orders'}</Text>
                </View>
              </View>
            </LinearGradient>

            {/* ── Quick Actions ── */}
            <View style={styles.actionsRow}>
              <Pressable 
                style={styles.actionCard}
                onPress={() => setShowBankModal(true)}
              >
                <View style={[styles.actionIcon, { backgroundColor: D.primaryLight }]}>
                  <Icon name="bank-plus" size={20} color={D.primary} />
                </View>
                <Text style={styles.actionText}>Add Bank</Text>
              </Pressable>

              <Pressable 
                style={styles.actionCard}
                onPress={() => setShowUpiModal(true)}
              >
                <View style={[styles.actionIcon, { backgroundColor: '#F5F3FF' }]}>
                  <Icon name="cellphone" size={20} color="#7C3AED" />
                </View>
                <Text style={styles.actionText}>Add UPI</Text>
              </Pressable>

              {role === 'seller' && (
                <Pressable 
                  style={styles.actionCard}
                  onPress={() => {
                    if (!paymentMethodId) { Alert.alert('No method', 'Add a payment method first.'); return; }
                    setShowWithdrawModal(true);
                  }}
                >
                  <View style={[styles.actionIcon, { backgroundColor: D.warningLight }]}>
                    <Icon name="bank-transfer-out" size={20} color={D.warning} />
                  </View>
                  <Text style={styles.actionText}>Withdraw</Text>
                </Pressable>
              )}
            </View>

            {/* ── Saved Methods ── */}
            {paymentMethods.length > 0 && (
              <View style={styles.methodsSection}>
                <Text style={styles.sectionTitle}>Payment Methods</Text>
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.methodsScroll}
                >
                  {paymentMethods.map((item: Record<string, unknown>, i: number) => {
                    const id = String(item._id ?? item.id ?? i);
                    const selected = paymentMethodId === id;
                    const isUpi = item.type === 'upi';
                    return (
                      <Pressable 
                        key={id} 
                        onPress={() => setPaymentMethodId(id)} 
                        style={[
                          styles.methodCard,
                          selected && styles.methodCardSelected,
                        ]}
                      >
                        <View style={[styles.methodCardIcon, { backgroundColor: selected ? (isUpi ? '#F5F3FF' : D.primaryLight) : D.borderLight }]}>
                          <Icon 
                            name={isUpi ? 'cellphone' : 'bank'} 
                            size={18} 
                            color={selected ? (isUpi ? '#7C3AED' : D.primary) : D.textTertiary} 
                          />
                        </View>
                        <Text style={styles.methodName} numberOfLines={1}>
                          {String(item.label ?? item.bankName ?? (isUpi ? 'UPI' : 'Bank'))}
                        </Text>
                        <Text style={styles.methodMeta} numberOfLines={1}>
                          {String(item.maskedAccountNumber ?? item.upiId ?? '••••')}
                        </Text>
                        {selected && (
                          <View style={styles.methodCheck}>
                            <Icon name="check-circle" size={16} color={D.primary} />
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* ── Activity Header ── */}
            <View style={styles.activityHeader}>
              <Text style={styles.sectionTitle}>Recent Activity</Text>
              <View style={styles.filterRow}>
                {(['all', 'credits', 'debits'] as FilterType[]).map(f => (
                  <Pressable
                    key={f}
                    onPress={() => { setActivityFilter(f); setShowAllActivity(false); }}
                    style={[
                      styles.filterChip,
                      activityFilter === f && styles.filterChipActive,
                    ]}
                  >
                    <Text style={[
                      styles.filterChipText,
                      activityFilter === f && styles.filterChipTextActive,
                    ]}>
                      {f === 'all' ? 'All' : f === 'credits' ? 'In' : 'Out'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const { icon, bg, color } = getTransactionIcon(item);
          const isDebit = item.section === 'Withdrawal' || item.section === 'Payment';
          const status = String(item.status ?? item.paymentStatus ?? '').replace(/_/g, ' ');
          const amount = Number(item.amount ?? item.totalAmount ?? 0);
          const itemCurrency = String(item.currency ?? currency);
          const date = item.createdAt 
            ? new Date(item.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
            : '';

          return (
            <Pressable
              onPress={() => navigation.navigate('WalletTransactionDetails', {
                activityId: String(item._id ?? item.id ?? ''),
                source: String(item.section).toLowerCase(),
                role,
              })}
              style={({ pressed }) => [
                styles.txnCard,
                pressed && styles.txnCardPressed,
              ]}
            >
              <View style={[styles.txnIcon, { backgroundColor: bg }]}>
                <Icon name={icon} size={16} color={color} />
              </View>
              
              <View style={styles.txnInfo}>
                <Text style={styles.txnLabel}>{getTransactionLabel(item)}</Text>
                <Text style={styles.txnMeta}>
                  {status || 'Completed'}{date ? ` • ${date}` : ''}
                </Text>
              </View>
              
              <Text style={[styles.txnAmount, { color: isDebit ? D.danger : D.success }]}>
                {isDebit ? '−' : '+'}{formatPrice(amount, itemCurrency)}
              </Text>
            </Pressable>
          );
        }}
        ListFooterComponent={
          filteredActivity.length > 5 && !showAllActivity ? (
            <Pressable onPress={() => setShowAllActivity(true)} style={styles.viewAllBtn}>
              <Text style={styles.viewAllText}>View all {filteredActivity.length} transactions</Text>
            </Pressable>
          ) : showAllActivity ? (
            <Pressable onPress={() => setShowAllActivity(false)} style={styles.viewAllBtn}>
              <Text style={styles.viewAllText}>Show less</Text>
            </Pressable>
          ) : (
            <View style={{ height: 40 }} />
          )
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Icon name="receipt-text-outline" size={32} color={D.textTertiary} />
            <Text style={styles.emptyText}>No transactions yet</Text>
          </View>
        }
      />

      {/* ─── Add Bank Modal ─── */}
      <Modal visible={showBankModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowBankModal(false)}>
        <View style={styles.modalScreen}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setShowBankModal(false)} style={styles.modalClose}>
              <Icon name="close" size={20} color={D.text} />
            </Pressable>
            <Text style={styles.modalTitle}>Add Bank Account</Text>
            <View style={{ width: 36 }} />
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalBody}>
            <Field label="Account Label" value={bankForm.label} onChangeText={v => setBankForm({ ...bankForm, label: v })} placeholder="e.g. Business Account" />
            <Field label="Account Holder Name" value={bankForm.accountHolder} onChangeText={v => setBankForm({ ...bankForm, accountHolder: v })} placeholder="Full name as per bank" />
            <Field label="Account Number" value={bankForm.accountNumber} onChangeText={v => setBankForm({ ...bankForm, accountNumber: v })} placeholder="Enter account number" keyboardType="numeric" />
            <Field label="IFSC Code" value={bankForm.ifsc} onChangeText={v => setBankForm({ ...bankForm, ifsc: v })} placeholder="e.g. SBIN0001234" autoCapitalize="characters" />
            <Field label="Bank Name" value={bankForm.bankName} onChangeText={v => setBankForm({ ...bankForm, bankName: v })} placeholder="e.g. State Bank of India" />

            <Pressable
              onPress={() => createBankMethod.mutate()}
              disabled={createBankMethod.isPending || !bankForm.accountNumber || !bankForm.ifsc}
              style={({ pressed }) => [
                styles.submitBtn,
                pressed && styles.submitBtnPressed,
                (createBankMethod.isPending || !bankForm.accountNumber || !bankForm.ifsc) && styles.btnDisabled,
              ]}
            >
              {createBankMethod.isPending ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.submitBtnText}>Save Bank Account</Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      {/* ─── Add UPI Modal ─── */}
      <Modal visible={showUpiModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowUpiModal(false)}>
        <View style={styles.modalScreen}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setShowUpiModal(false)} style={styles.modalClose}>
              <Icon name="close" size={20} color={D.text} />
            </Pressable>
            <Text style={styles.modalTitle}>Add UPI ID</Text>
            <View style={{ width: 36 }} />
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalBody}>
            <Field label="Label" value={upiForm.label} onChangeText={v => setUpiForm({ ...upiForm, label: v })} placeholder="e.g. Personal UPI" />
            <Field label="UPI ID" value={upiForm.upiId} onChangeText={v => setUpiForm({ ...upiForm, upiId: v })} placeholder="username@upi" autoCapitalize="none" />

            <Pressable
              onPress={() => createUpiMethod.mutate()}
              disabled={createUpiMethod.isPending || !upiForm.upiId}
              style={({ pressed }) => [
                styles.submitBtn,
                pressed && styles.submitBtnPressed,
                (createUpiMethod.isPending || !upiForm.upiId) && styles.btnDisabled,
              ]}
            >
              {createUpiMethod.isPending ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.submitBtnText}>Save UPI ID</Text>
              )}
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
              <Text style={styles.currencySymbol}>{currency === 'INR' ? '₹' : '$'}</Text>
              <TextInput
                value={withdrawalAmount}
                onChangeText={setWithdrawalAmount}
                keyboardType="numeric"
                placeholder="0.00"
                placeholderTextColor={D.textTertiary}
                style={styles.amountInput}
              />
            </View>

            <Pressable
              onPress={() => createWithdrawal.mutate()}
              disabled={createWithdrawal.isPending || !withdrawalAmount || Number(withdrawalAmount) <= 0}
              style={({ pressed }) => [
                styles.withdrawBtn,
                pressed && styles.withdrawBtnPressed,
                (createWithdrawal.isPending || !withdrawalAmount) && styles.btnDisabled,
              ]}
            >
              {createWithdrawal.isPending ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.withdrawBtnText}>Confirm Withdrawal</Text>
              )}
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
      <TextInput
        placeholderTextColor={D.textTertiary}
        style={styles.fieldInput}
        {...props}
      />
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: D.background },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 56 : 44,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: D.surface,
    borderBottomWidth: 1,
    borderBottomColor: D.borderLight,
  },
  headerBack: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: D.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: D.text,
  },
  headerRight: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: D.background,
    alignItems: 'center',
    justifyContent: 'center',
  },

  listContent: { paddingBottom: 40 },

  // Balance Card
  balanceCard: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 20,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  cardPattern: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  patternCircle: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  balanceLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  balanceAmount: {
    fontSize: 34,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginBottom: 20,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  balanceItem: {
    flex: 1,
  },
  balanceItemValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  balanceItemLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '600',
    marginTop: 2,
  },
  balanceDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginHorizontal: 16,
  },

  // Quick Actions
  actionsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 20,
    gap: 10,
  },
  actionCard: {
    flex: 1,
    backgroundColor: D.surface,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: D.border,
  },
  actionIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
    color: D.text,
  },

  // Methods
  methodsSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: D.text,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  methodsScroll: {
    paddingHorizontal: 16,
    gap: 10,
  },
  methodCard: {
    width: 140,
    backgroundColor: D.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: D.border,
    position: 'relative',
  },
  methodCardSelected: {
    borderColor: D.primary,
    backgroundColor: '#FAFBFF',
  },
  methodCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  methodName: {
    fontSize: 13,
    fontWeight: '700',
    color: D.text,
  },
  methodMeta: {
    fontSize: 10,
    color: D.textTertiary,
    fontWeight: '500',
    marginTop: 2,
  },
  methodCheck: {
    position: 'absolute',
    top: 10,
    right: 10,
  },

  // Activity Header
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingRight: 16,
    marginBottom: 8,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: D.borderLight,
    borderRadius: 8,
    padding: 2,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
  },
  filterChipActive: {
    backgroundColor: D.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: D.textTertiary,
  },
  filterChipTextActive: {
    color: D.text,
  },

  // Transaction
  txnCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 4,
    backgroundColor: D.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: D.borderLight,
  },
  txnCardPressed: {
    backgroundColor: '#FAFBFC',
  },
  txnIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txnInfo: {
    flex: 1,
  },
  txnLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: D.text,
    marginBottom: 2,
  },
  txnMeta: {
    fontSize: 11,
    color: D.textTertiary,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  txnAmount: {
    fontSize: 14,
    fontWeight: '700',
  },

  // View All
  viewAllBtn: {
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 12,
    backgroundColor: D.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: D.border,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: D.primary,
  },

  // Empty
  emptyState: {
    alignItems: 'center',
    padding: 40,
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    color: D.textTertiary,
    fontWeight: '500',
  },

  // Modal
  modalScreen: { flex: 1, backgroundColor: D.surface },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 56 : 44,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: D.borderLight,
  },
  modalClose: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: D.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: D.text,
  },
  modalBody: {
    padding: 20,
    paddingBottom: 40,
  },

  // Fields
  fieldWrap: { marginBottom: 18 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: D.textSecondary,
    marginBottom: 6,
  },
  fieldInput: {
    backgroundColor: D.background,
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 46,
    fontSize: 14,
    fontWeight: '500',
    color: D.text,
    borderWidth: 1,
    borderColor: D.border,
  },

  // Submit Button
  submitBtn: {
    backgroundColor: D.primary,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
    marginTop: 24,
  },
  submitBtnPressed: {
    opacity: 0.9,
  },
  submitBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  btnDisabled: { opacity: 0.5 },

  // Withdraw Sheet
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: D.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: D.border,
    alignSelf: 'center',
    marginBottom: 20,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: D.text,
    marginBottom: 16,
  },
  sheetBalance: {
    backgroundColor: D.primaryLight,
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
  },
  sheetBalanceLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: D.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sheetBalanceAmount: {
    fontSize: 22,
    fontWeight: '700',
    color: D.text,
    marginTop: 2,
  },
  amountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: D.background,
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: D.border,
    marginBottom: 24,
  },
  currencySymbol: {
    fontSize: 22,
    fontWeight: '700',
    color: D.text,
  },
  amountInput: {
    flex: 1,
    height: 52,
    fontSize: 22,
    fontWeight: '600',
    color: D.text,
    paddingLeft: 8,
  },
  withdrawBtn: {
    backgroundColor: D.text,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
  },
  withdrawBtnPressed: {
    opacity: 0.9,
  },
  withdrawBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
});

export default WalletScreen;
