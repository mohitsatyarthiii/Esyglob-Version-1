import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { fetchChats } from '../api/marketplace';
import { Chat, CurrentUser, Product } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import RemoteImage from '../components/RemoteImage';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { colors, radii, spacing } from '../theme';
import { getId } from '../utils/format';
import { firstImage } from '../utils/images';
import AuthScreen from './AuthScreen';

function MessagesScreen() {
  const navigation = useNavigation<any>();
  const { activeRole, status, user } = useAuth();
  const [query, setQuery] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const chats = useQuery({
    queryKey: ['chats', activeRole],
    queryFn: () => fetchChats(activeRole),
    enabled: status === 'authenticated',
  });

  const chatItems = useMemo(() => (chats.data ?? []).filter(item => {
    const participant = resolveChatParticipant(item, user?.id ?? user?._id);
    const product = typeof item.productId === 'object' ? item.productId as Product : undefined;
    const unread = activeRole === 'seller' ? item.sellerUnreadCount : item.buyerUnreadCount;
    const haystack = [participant.name, product?.name, product?.title, item.chatType, item.lastMessage].filter(Boolean).join(' ').toLowerCase();
    return (!unreadOnly || Boolean(unread)) && (!query.trim() || haystack.includes(query.trim().toLowerCase()));
  }), [activeRole, chats.data, query, unreadOnly, user]);

  if (status !== 'authenticated') {
    return <AuthScreen onClose={() => navigation.navigate('Home')} />;
  }

  if (chats.isLoading) {
    return <LoadingState label="Loading conversations" />;
  }

  if (chats.isError) {
    return <ErrorState message={(chats.error as Error).message} onRetry={() => chats.refetch()} />;
  }
  const unreadTotal = (chats.data ?? []).reduce((total, item) => {
    const unread = activeRole === 'seller' ? item.sellerUnreadCount : item.buyerUnreadCount;
    return total + (unread ?? 0);
  }, 0);

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.list}
      data={chatItems}
      keyExtractor={item => getId(item)}
      refreshControl={<RefreshControl refreshing={chats.isRefetching} onRefresh={() => chats.refetch()} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={styles.screenTitle}>Messenger</Text>
            <Pressable style={styles.headerIcon}>
              <Icon name="dots-horizontal" size={26} color={colors.ink} />
            </Pressable>
          </View>
          <View style={styles.quickRow}>
            <QuickAction icon="clipboard-list-outline" label="Orders" />
            <QuickAction icon="bell-outline" label="Notifications" badge={unreadTotal} />
            <QuickAction icon="dots-horizontal-circle-outline" label="Others" />
          </View>
          <View style={styles.searchBox}>
            <Icon name="magnify" size={22} color={colors.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search messages or suppliers"
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
            />
          </View>
          <View style={styles.filterRow}>
            <Pressable onPress={() => setUnreadOnly(value => !value)} style={[styles.filterChip, unreadOnly && styles.filterChipActive]}>
              <Text style={styles.filterText}>Unread</Text>
            </Pressable>
            <View style={styles.filterChip}>
              <Text style={styles.filterText}>My label</Text>
              <Icon name="chevron-down" size={18} color={colors.ink} />
            </View>
          </View>
        </View>
      }
      ListEmptyComponent={<EmptyState title="No conversations" detail="Buyer-seller chats from /api/chats will appear here." />}
      renderItem={({ item }) => {
        const unread = activeRole === 'seller' ? item.sellerUnreadCount : item.buyerUnreadCount;
        const participant = resolveChatParticipant(item, user?.id ?? user?._id);
        const product = typeof item.productId === 'object' ? item.productId as Product : undefined;
        const title = participant.name ?? product?.name ?? item.chatType ?? 'Conversation';
        const subtitle = product?.name ?? product?.title ?? item.chatType ?? 'Marketplace conversation';
        const date = item.lastMessageAt ? new Date(item.lastMessageAt).toLocaleDateString() : '';

        return (
          <Pressable onPress={() => navigation.navigate('ChatDetails', { chatId: getId(item), title })} style={styles.card}>
            <View style={styles.avatar}>
              <RemoteImage
                uri={participant.image}
                width={96}
                height={96}
                style={styles.avatarImage}
                fallback={<Text style={styles.avatarText}>{title.slice(0, 1).toUpperCase() || 'C'}</Text>}
              />
            </View>
            <View style={styles.body}>
              <View style={styles.chatTopRow}>
                <Text numberOfLines={1} style={styles.title}>{title}</Text>
                {date ? <Text style={styles.date}>{date}</Text> : null}
              </View>
              <Text numberOfLines={1} style={styles.company}>{subtitle}</Text>
              <Text numberOfLines={2} style={styles.message}>{item.lastMessage ?? 'No messages yet'}</Text>
            </View>
            {unread ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unread}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      }}
    />
  );
}

function resolveChatParticipant(chat: Chat, currentUserId?: string) {
  const buyer = typeof chat.buyerId === 'object' ? chat.buyerId as CurrentUser : undefined;
  const seller = typeof chat.sellerId === 'object' ? chat.sellerId as CurrentUser : undefined;
  const current = currentUserId;
  const other = current && buyer && getUserId(buyer) === current ? seller : current && seller && getUserId(seller) === current ? buyer : seller ?? buyer;

  return {
    name: other?.name ?? other?.fullName ?? other?.email,
    image: firstImage(other?.profileImage, other?.avatar, other?.image),
  };
}

function getUserId(user: CurrentUser) {
  return user.id ?? user._id;
}

function QuickAction({ icon, label, badge }: { icon: string; label: string; badge?: number }) {
  return (
    <View style={styles.quickAction}>
      <View>
        <Icon name={icon} size={27} color={colors.ink} />
        {badge ? (
          <View style={styles.quickBadge}>
            <Text style={styles.quickBadgeText}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  list: {
    padding: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: 116,
  },
  header: {
    marginBottom: spacing.md,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  screenTitle: {
    color: colors.ink,
    fontSize: 30,
    fontWeight: '900',
  },
  headerIcon: {
    alignItems: 'center',
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  quickRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: spacing.xl,
  },
  quickAction: {
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 92,
  },
  quickLabel: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '800',
  },
  quickBadge: {
    alignItems: 'center',
    backgroundColor: colors.rose,
    borderRadius: radii.pill,
    minWidth: 23,
    paddingHorizontal: 5,
    position: 'absolute',
    right: -13,
    top: -7,
  },
  quickBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
  },
  searchBox: {
    alignItems: 'center',
    backgroundColor: colors.cardMuted,
    borderRadius: radii.pill,
    flexDirection: 'row',
    marginTop: spacing.xl,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    color: colors.ink,
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    paddingHorizontal: spacing.sm,
  },
  filterRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  filterChip: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.faint,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  filterChipActive: {
    backgroundColor: '#fff8f3',
    borderColor: colors.primary,
  },
  filterText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '900',
  },
  card: {
    alignItems: 'center',
    borderBottomColor: colors.faint,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    paddingVertical: spacing.lg,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.cardMuted,
    borderRadius: radii.pill,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  avatarImage: {
    borderRadius: radii.pill,
    height: 48,
    width: 48,
  },
  avatarText: {
    color: colors.primaryDark,
    fontWeight: '900',
  },
  body: {
    flex: 1,
    marginLeft: spacing.md,
  },
  chatTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  title: {
    color: colors.ink,
    flex: 1,
    fontSize: 18,
    fontWeight: '900',
  },
  date: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  company: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  message: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 19,
    marginTop: spacing.xs,
  },
  badge: {
    alignItems: 'center',
    backgroundColor: colors.rose,
    borderRadius: radii.pill,
    minWidth: 26,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
  },
});

export default MessagesScreen;
