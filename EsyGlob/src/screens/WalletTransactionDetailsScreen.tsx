import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useQuery } from '@tanstack/react-query';
import { fetchWalletActivityDetails, WalletActivitySource } from '../api/account';
import { ErrorState, LoadingState } from '../components/StateViews';
import { useCurrency } from '../currency/CurrencyContext';

type Params = { activityId: string; source: WalletActivitySource; role: string };
const LABELS: Record<string, string> = {
  _id: 'Transaction ID', transactionId: 'Gateway transaction', paymentNumber: 'Payment number',
  orderNumber: 'Order number', amount: 'Amount', totalAmount: 'Total amount', fee: 'Fees', fees: 'Fees',
  gst: 'GST', taxAmount: 'Tax', paymentMethod: 'Payment method', type: 'Type', direction: 'Direction',
  status: 'Status', paymentStatus: 'Payment status', description: 'Description', createdAt: 'Created',
  updatedAt: 'Last updated', paidAt: 'Paid on', reviewedAt: 'Reviewed', paidOutAt: 'Paid out',
  currency: 'Currency', orderType: 'Order type', quantity: 'Quantity', productName: 'Product',
  buyerName: 'Buyer', sellerName: 'Seller', invoiceNumber: 'Invoice', rfqNumber: 'RFQ', quotationNumber: 'Quotation',
};
const HIDDEN = new Set(['__v', 'walletId', 'userId', 'sellerId', 'buyerId', 'productId', 'orderId', 'paymentId', 'withdrawalId', 'metadata']);

function valueText(value: unknown) {
  if (value == null || value === '') return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  if (/At$|Date$/i.test(String(value)) || /^\d{4}-\d\d-\d\dT/.test(String(value))) {
    const date = new Date(String(value));
    if (!Number.isNaN(date.getTime())) return date.toLocaleString();
  }
  return String(value).replace(/_/g, ' ');
}

function entityName(value: unknown, fallback: string) {
  if (!value || typeof value !== 'object') return fallback;
  const entity = value as Record<string, unknown>;
  return String(entity.companyName ?? entity.businessName ?? entity.fullName ?? entity.name ?? entity.title ?? entity.email ?? fallback);
}

export default function WalletTransactionDetailsScreen() {
  const navigation = useNavigation<any>();
  const { params } = useRoute<any>() as { params: Params };
  const { formatPrice } = useCurrency();
  const query = useQuery({
    queryKey: ['wallet-activity', params.role, params.source, params.activityId],
    queryFn: () => fetchWalletActivityDetails(params.role, params.source, params.activityId),
  });
  const activity = query.data?.activity;
  const order = query.data?.order;
  const rows = useMemo(() => activity ? Object.entries(activity).filter(([key, value]) => !HIDDEN.has(key) && value != null && value !== '') : [], [activity]);
  if (query.isLoading) return <LoadingState label="Loading transaction..." />;
  if (query.isError || !activity) return <ErrorState message={(query.error as Error)?.message ?? 'Transaction unavailable'} onRetry={() => query.refetch()} />;
  const amount = Number(activity.amount ?? activity.totalAmount ?? 0);
  const currency = String(activity.currency ?? 'INR');
  const status = String(activity.status ?? activity.paymentStatus ?? 'recorded').replace(/_/g, ' ');
  return <View style={s.screen}>
    <View style={s.header}><Pressable onPress={() => navigation.goBack()} style={s.icon}><Icon name="arrow-left" size={22} color="#0F172A" /></Pressable><Text style={s.title}>Transaction details</Text><View style={s.icon} /></View>
    <ScrollView contentContainerStyle={s.content}>
      <View style={s.hero}><Icon name={params.source === 'withdrawal' ? 'bank-transfer-out' : 'check-decagram'} size={34} color="#4F46E5" /><Text style={s.amount}>{formatPrice(amount, currency)}</Text><View style={s.status}><Text style={s.statusText}>{status}</Text></View></View>
      <View style={s.card}>{rows.map(([key, value]) => <View key={key} style={s.row}><Text style={s.label}>{LABELS[key] ?? key.replace(/([A-Z])/g, ' $1')}</Text><Text selectable style={s.value}>{['amount','totalAmount','fee','fees','gst','taxAmount'].includes(key) ? formatPrice(Number(value), currency) : valueText(value)}</Text></View>)}</View>
      {order && <View style={s.card}><Text style={s.section}>Linked order</Text><Text style={s.orderTitle}>{String(order.orderNumber ?? 'Order')}</Text><Text style={s.orderMeta}>{String(order.orderType ?? '')} · {String(order.status ?? '')}</Text><View style={s.entityGrid}><Text style={s.entityLabel}>Buyer</Text><Text style={s.entityValue}>{entityName(order.buyerId, 'Buyer details unavailable')}</Text><Text style={s.entityLabel}>Seller</Text><Text style={s.entityValue}>{entityName(order.sellerId, 'Seller details unavailable')}</Text><Text style={s.entityLabel}>Product</Text><Text style={s.entityValue}>{entityName(order.productId, 'Product details unavailable')}</Text></View><Pressable onPress={() => navigation.navigate('OrderDetails', { orderId: String(order._id ?? order.id) })} style={s.action}><Text style={s.actionText}>View order</Text><Icon name="arrow-right" size={18} color="#FFF" /></Pressable></View>}
      {query.data?.payment && params.source !== 'payment' && <Pressable onPress={() => navigation.navigate('PaymentDetails', { paymentId: String(query.data?.payment?._id ?? query.data?.payment?.id) })} style={s.secondary}><Icon name="credit-card-outline" size={19} color="#4F46E5" /><Text style={s.secondaryText}>Open linked payment</Text></Pressable>}
    </ScrollView>
  </View>;
}

const s = StyleSheet.create({screen:{flex:1,backgroundColor:'#F8FAFC'},header:{paddingTop:54,paddingHorizontal:16,paddingBottom:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},icon:{width:40,height:40,borderRadius:12,backgroundColor:'#FFF',alignItems:'center',justifyContent:'center'},title:{fontSize:17,fontWeight:'800',color:'#0F172A'},content:{padding:16,paddingBottom:50,gap:14},hero:{backgroundColor:'#FFF',borderRadius:22,padding:24,alignItems:'center',borderWidth:1,borderColor:'#E2E8F0'},amount:{fontSize:30,fontWeight:'900',color:'#0F172A',marginTop:8},status:{backgroundColor:'#EEF2FF',paddingHorizontal:12,paddingVertical:6,borderRadius:20,marginTop:10},statusText:{color:'#4338CA',fontSize:12,fontWeight:'800',textTransform:'capitalize'},card:{backgroundColor:'#FFF',borderRadius:18,padding:16,borderWidth:1,borderColor:'#E2E8F0'},row:{flexDirection:'row',justifyContent:'space-between',gap:18,paddingVertical:11,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:'#E2E8F0'},label:{flex:1,fontSize:12,color:'#64748B',textTransform:'capitalize'},value:{flex:1.35,fontSize:12,fontWeight:'700',color:'#0F172A',textAlign:'right',textTransform:'capitalize'},section:{fontSize:12,fontWeight:'800',color:'#64748B',textTransform:'uppercase',letterSpacing:1},orderTitle:{fontSize:17,fontWeight:'800',color:'#0F172A',marginTop:10},orderMeta:{fontSize:12,color:'#64748B',marginTop:3,textTransform:'capitalize'},entityGrid:{marginTop:14,paddingTop:12,borderTopWidth:1,borderTopColor:'#E2E8F0',gap:4},entityLabel:{fontSize:10,fontWeight:'800',color:'#94A3B8',textTransform:'uppercase',marginTop:5},entityValue:{fontSize:13,fontWeight:'700',color:'#0F172A'},action:{marginTop:14,height:44,borderRadius:12,backgroundColor:'#4F46E5',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},actionText:{color:'#FFF',fontWeight:'800'},secondary:{height:52,borderRadius:14,borderWidth:1,borderColor:'#C7D2FE',backgroundColor:'#EEF2FF',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},secondaryText:{color:'#4338CA',fontWeight:'800'}});
