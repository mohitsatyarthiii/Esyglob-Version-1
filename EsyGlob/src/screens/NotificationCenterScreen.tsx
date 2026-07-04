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

function NotificationCenterScreen() {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const notifications = useQuery({ queryKey: ['notification-center'], queryFn: fetchNotificationCenter, refetchInterval: 45_000 });
  const visible = useMemo(
    () => filter === 'unread' ? (notifications.data ?? []).filter(item => !item.isRead) : notifications.data ?? [],
    [filter, notifications.data],
  );

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['notification-center'] });
  const markAll = useMutation({ mutationFn: markAllNotificationsRead, onSuccess: refresh });
  const clearRead = useMutation({ mutationFn: clearReadNotifications, onSuccess: refresh });
  const markOne = useMutation({ mutationFn: markNotificationRead, onSuccess: refresh });
  const deleteOne = useMutation({ mutationFn: deleteNotification, onSuccess: refresh });

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
            <Text style={styles.title}>Notifications</Text>
          </View>
          <View style={styles.segment}>
            {(['all', 'unread'] as const).map(item => (
              <Pressable key={item} onPress={() => setFilter(item)} style={[styles.segmentButton, filter === item && styles.segmentActive]}>
                <Text style={[styles.segmentText, filter === item && styles.segmentTextActive]}>{item}</Text>
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

function NotificationRow({ item, onRead, onDelete }: { item: NotificationItem; onRead: () => void; onDelete: () => void }) {
  return (
    <View style={[styles.row, !item.isRead && styles.unread]}>
      <Icon name={item.isRead ? 'bell-outline' : 'bell-ring-outline'} size={22} color={colors.primary} />
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{item.title ?? 'Notification'}</Text>
        <Text style={styles.rowMessage}>{item.message ?? ''}</Text>
        <Text style={styles.rowDate}>{item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}</Text>
      </View>
      <View style={styles.rowActions}>
        {!item.isRead ? <Pressable onPress={onRead} style={styles.iconButton}><Icon name="check" size={18} color={colors.primary} /></Pressable> : null}
        <Pressable onPress={onDelete} style={styles.iconButton}><Icon name="delete-outline" size={18} color={colors.muted} /></Pressable>
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
  segment: { backgroundColor: colors.cardMuted, borderRadius: radii.pill, flexDirection: 'row', marginBottom: spacing.md, padding: spacing.xs },
  segmentButton: { alignItems: 'center', borderRadius: radii.pill, flex: 1, paddingVertical: spacing.sm },
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
  rowDate: { color: colors.muted, fontSize: 11, fontWeight: '700', marginTop: spacing.xs },
  rowActions: { gap: spacing.sm },
  iconButton: { alignItems: 'center', backgroundColor: colors.cardMuted, borderRadius: radii.pill, height: 34, justifyContent: 'center', width: 34 },
  empty: { color: colors.muted, fontWeight: '800', paddingTop: spacing.xl, textAlign: 'center' },
});

export default NotificationCenterScreen;
