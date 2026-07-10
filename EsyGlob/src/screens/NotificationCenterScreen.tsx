import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clearReadNotifications, deleteNotification, fetchNotificationCenter, markAllNotificationsRead, markNotificationRead } from '../api/account';
import { NotificationItem } from '../api/types';
import { ErrorState, LoadingState } from '../components/StateViews';
import { colors, radii, spacing } from '../theme';
import { getId } from '../utils/format';

type NotificationFilter = 'all' | 'unread' | 'orders' | 'messages' | 'promotions' | 'system';
type NotificationCenterPayload = Awaited<ReturnType<typeof fetchNotificationCenter>>;
const notificationKey = ['notification-center'];

function NotificationCenterScreen() {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const notifications = useQuery({ queryKey: notificationKey, queryFn: fetchNotificationCenter, refetchInterval: 45_000 });
  const allNotifications = useMemo(() => notifications.data?.notifications ?? [], [notifications.data?.notifications]);
  const visible = useMemo(
    () => allNotifications.filter(item => notificationMatchesFilter(item, filter)),
    [allNotifications, filter],
  );
  const unreadCount = notifications.data?.unreadCount ?? allNotifications.filter(item => !item.isRead).length;

  const refresh = () => queryClient.invalidateQueries({ queryKey: notificationKey });
  const markAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: notificationKey });
      const previous = queryClient.getQueryData<NotificationCenterPayload>(notificationKey);
      queryClient.setQueryData<NotificationCenterPayload>(notificationKey, data => data ? {
        ...data,
        unreadCount: 0,
        notifications: data.notifications.map(item => ({ ...item, isRead: true })),
      } : data);
      return { previous };
    },
    onError: (_error, _vars, context) => queryClient.setQueryData(notificationKey, context?.previous),
    onSettled: refresh,
  });
  const clearRead = useMutation({
    mutationFn: clearReadNotifications,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: notificationKey });
      const previous = queryClient.getQueryData<NotificationCenterPayload>(notificationKey);
      queryClient.setQueryData<NotificationCenterPayload>(notificationKey, data => data ? {
        ...data,
        notifications: data.notifications.filter(item => !item.isRead),
      } : data);
      return { previous };
    },
    onError: (_error, _vars, context) => queryClient.setQueryData(notificationKey, context?.previous),
    onSettled: refresh,
  });
  const markOne = useMutation({
    mutationFn: markNotificationRead,
    onMutate: async notificationId => {
      await queryClient.cancelQueries({ queryKey: notificationKey });
      const previous = queryClient.getQueryData<NotificationCenterPayload>(notificationKey);
      queryClient.setQueryData<NotificationCenterPayload>(notificationKey, data => markNotificationInCache(data, notificationId));
      return { previous };
    },
    onError: (_error, _vars, context) => queryClient.setQueryData(notificationKey, context?.previous),
    onSettled: refresh,
  });
  const deleteOne = useMutation({
    mutationFn: deleteNotification,
    onMutate: async notificationId => {
      await queryClient.cancelQueries({ queryKey: notificationKey });
      const previous = queryClient.getQueryData<NotificationCenterPayload>(notificationKey);
      queryClient.setQueryData<NotificationCenterPayload>(notificationKey, data => deleteNotificationFromCache(data, notificationId));
      return { previous };
    },
    onError: (_error, _vars, context) => queryClient.setQueryData(notificationKey, context?.previous),
    onSettled: refresh,
  });

  const openNotification = (item: NotificationItem) => {
    if (!item.isRead) {
      markOne.mutate(getId(item));
    }

    navigateFromNotification(navigation, item);
  };

  if (notifications.isLoading) {
    return <LoadingState label="Loading notifications" />;
  }

  if (notifications.isError) {
    return <ErrorState message={(notifications.error as Error).message} onRetry={() => notifications.refetch()} />;
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={notifications.isFetching} onRefresh={() => notifications.refetch()} />}
      data={visible}
      keyExtractor={item => getId(item)}
      ListHeaderComponent={(
        <>
          <View style={styles.header}>
            <Pressable onPress={() => navigation.goBack()} style={styles.back}><Icon name="arrow-left" size={22} color={colors.ink} /></Pressable>
            <View style={styles.titleBlock}>
              <Text style={styles.title}>Notifications</Text>
              <Text style={styles.subtitle}>{unreadCount} unread</Text>
            </View>
          </View>
          <View style={styles.segment}>
            {(['all', 'unread', 'orders', 'messages', 'promotions', 'system'] as const).map(item => (
              <Pressable key={item} onPress={() => setFilter(item)} style={[styles.segmentButton, filter === item && styles.segmentActive]}>
                <Text numberOfLines={1} style={[styles.segmentText, filter === item && styles.segmentTextActive]}>{filterLabel(item)}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.actions}>
            <Pressable onPress={() => markAll.mutate()} style={styles.actionButton}><Icon name="check-all" size={18} color={colors.primary} /><Text style={styles.actionText}>Mark all read</Text></Pressable>
            <Pressable onPress={() => clearRead.mutate()} style={styles.actionButton}><Icon name="delete-outline" size={18} color={colors.primary} /><Text style={styles.actionText}>Clear read</Text></Pressable>
          </View>
        </>
      )}
      renderItem={({ item }) => (
        <NotificationRow
          item={item}
          onOpen={() => openNotification(item)}
          onRead={() => markOne.mutate(getId(item))}
          onDelete={() => Alert.alert('Delete notification', 'Remove this notification?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => deleteOne.mutate(getId(item)) },
          ])}
        />
      )}
      ListEmptyComponent={<Text style={styles.empty}>No notifications to show.</Text>}
    />
  );
}

function NotificationRow({ item, onOpen, onRead, onDelete }: { item: NotificationItem; onOpen: () => void; onRead: () => void; onDelete: () => void }) {
  return (
    <Pressable onPress={onOpen} style={({ pressed }) => [styles.row, !item.isRead && styles.unread, pressed && styles.pressed]}>
      <Icon name={item.isRead ? 'bell-outline' : 'bell-ring-outline'} size={22} color={colors.primary} />
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{item.title ?? 'Notification'}</Text>
        <Text style={styles.rowMessage}>{item.message ?? item.description ?? ''}</Text>
        <Text style={styles.rowType}>{filterLabel(normalizeType(item))}</Text>
        <Text style={styles.rowDate}>{item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}</Text>
      </View>
      <View style={styles.rowActions}>
        {!item.isRead ? <Pressable onPress={onRead} style={styles.iconButton}><Icon name="check" size={18} color={colors.primary} /></Pressable> : null}
        <Pressable onPress={onDelete} style={styles.iconButton}><Icon name="delete-outline" size={18} color={colors.muted} /></Pressable>
      </View>
    </Pressable>
  );
}

function markNotificationInCache(data: NotificationCenterPayload | undefined, notificationId: string) {
  if (!data) {
    return data;
  }

  const wasUnread = data.notifications.some(item => getId(item) === notificationId && !item.isRead);
  return {
    ...data,
    unreadCount: Math.max((data.unreadCount ?? 0) - (wasUnread ? 1 : 0), 0),
    notifications: data.notifications.map(item => getId(item) === notificationId ? { ...item, isRead: true } : item),
  };
}

function deleteNotificationFromCache(data: NotificationCenterPayload | undefined, notificationId: string) {
  if (!data) {
    return data;
  }

  const deleted = data.notifications.find(item => getId(item) === notificationId);
  return {
    ...data,
    unreadCount: Math.max((data.unreadCount ?? 0) - (deleted && !deleted.isRead ? 1 : 0), 0),
    notifications: data.notifications.filter(item => getId(item) !== notificationId),
  };
}

function normalizeType(item: NotificationItem): NotificationFilter {
  const value = String(item.category ?? item.type ?? item.notificationType ?? '').toLowerCase();

  if (value.includes('order') || value.includes('shipping') || value.includes('shipment') || value.includes('payment')) return 'orders';
  if (value.includes('message') || value.includes('chat')) return 'messages';
  if (value.includes('promo') || value.includes('price') || value.includes('marketing')) return 'promotions';
  if (value.includes('system') || value.includes('account') || value.includes('security')) return 'system';
  return 'system';
}

function notificationMatchesFilter(item: NotificationItem, filter: NotificationFilter) {
  if (filter === 'all') return true;
  if (filter === 'unread') return !item.isRead;
  return normalizeType(item) === filter;
}

function filterLabel(filter: NotificationFilter) {
  const labels: Record<NotificationFilter, string> = {
    all: 'All',
    unread: 'Unread',
    orders: 'Orders',
    messages: 'Messages',
    promotions: 'Promos',
    system: 'System',
  };
  return labels[filter];
}

function navigateFromNotification(navigation: any, item: NotificationItem) {
  const data = { ...(item.metadata ?? {}), ...(item.data ?? {}) } as Record<string, unknown>;
  const relatedId = resolveLinkedId(data.relatedId);
  const relatedModel = String(data.relatedModel ?? '').toLowerCase();
  const orderId = resolveLinkedId(item.orderId ?? data.orderId);
  const productId = resolveLinkedId(item.productId ?? data.productId);
  const sellerId = resolveLinkedId(item.sellerId ?? data.sellerId);
  const chatId = resolveLinkedId(item.chatId ?? data.chatId);
  const rfqId = resolveLinkedId(item.rfqId ?? data.rfqId);
  const quotationId = resolveLinkedId(item.quotationId ?? data.quotationId);

  if (chatId || (relatedModel === 'chat' && relatedId)) navigation.navigate('ChatDetails', { chatId: chatId ?? relatedId });
  else if (orderId) navigation.navigate('OrderDetails', { orderId });
  else if (productId) navigation.navigate('ProductDetails', { productId });
  else if (sellerId) navigation.navigate('SellerDetails', { sellerId });
  else if (rfqId) navigation.navigate('RFQDetails', { rfqId });
  else if (quotationId) navigation.navigate('QuotationDetails', { quotationId });
  else if (relatedModel === 'order' && relatedId) navigation.navigate('OrderDetails', { orderId: relatedId });
  else if (relatedModel === 'product' && relatedId) navigation.navigate('ProductDetails', { productId: relatedId });
  else if (relatedModel === 'seller' && relatedId) navigation.navigate('SellerDetails', { sellerId: relatedId });
  else if (relatedModel === 'rfq' && relatedId) navigation.navigate('RFQDetails', { rfqId: relatedId });
  else if (relatedModel === 'quotation' && relatedId) navigation.navigate('QuotationDetails', { quotationId: relatedId });
}

function resolveLinkedId(value: unknown) {
  if (!value) {
    return undefined;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'object') {
    return getId(value as { _id?: string; id?: string });
  }

  return undefined;
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 112, paddingTop: spacing.xxl },
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  back: { alignItems: 'center', backgroundColor: colors.card, borderRadius: radii.pill, height: 42, justifyContent: 'center', width: 42 },
  titleBlock: { flex: 1 },
  title: { color: colors.ink, fontSize: 22, fontWeight: '900' },
  subtitle: { color: colors.muted, fontSize: 12, fontWeight: '800', marginTop: 2 },
  segment: { backgroundColor: colors.cardMuted, borderRadius: radii.md, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md, padding: spacing.xs },
  segmentButton: { alignItems: 'center', borderRadius: radii.pill, minWidth: '30%', paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  segmentActive: { backgroundColor: colors.card },
  segmentText: { color: colors.muted, fontWeight: '900', textTransform: 'capitalize' },
  segmentTextActive: { color: colors.primaryDark },
  actions: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  actionButton: { alignItems: 'center', backgroundColor: colors.card, borderRadius: radii.pill, flex: 1, flexDirection: 'row', gap: spacing.xs, justifyContent: 'center', paddingVertical: spacing.md },
  actionText: { color: colors.primaryDark, fontSize: 12, fontWeight: '900' },
  row: { alignItems: 'flex-start', backgroundColor: colors.card, borderRadius: radii.md, flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md, padding: spacing.md },
  unread: { borderColor: colors.primary, borderWidth: 1 },
  rowBody: { flex: 1 },
  rowTitle: { color: colors.ink, fontWeight: '900' },
  rowMessage: { color: colors.text, fontSize: 13, fontWeight: '700', lineHeight: 18, marginTop: spacing.xs },
  rowType: { alignSelf: 'flex-start', backgroundColor: colors.cardMuted, borderRadius: radii.pill, color: colors.primaryDark, fontSize: 10, fontWeight: '900', marginTop: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  rowDate: { color: colors.muted, fontSize: 11, fontWeight: '700', marginTop: spacing.xs },
  rowActions: { gap: spacing.sm },
  iconButton: { alignItems: 'center', backgroundColor: colors.cardMuted, borderRadius: radii.pill, height: 34, justifyContent: 'center', width: 34 },
  empty: { color: colors.muted, fontWeight: '800', paddingTop: spacing.xl, textAlign: 'center' },
  pressed: { opacity: 0.78 },
});

export default NotificationCenterScreen;
