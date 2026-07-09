import React, { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { Swipeable } from 'react-native-gesture-handler';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { archiveChat, createGroupChat, deleteChatForMe, favoriteChat, fetchChats, markChatRead, markChatUnread, muteChat, pinChat } from '../api/marketplace';
import { Chat, CurrentUser, Product } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import RemoteImage from '../components/RemoteImage';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { colors, radii, spacing } from '../theme';
import { getId } from '../utils/format';
import { firstImage } from '../utils/images';
import AuthScreen from './AuthScreen';

type ChatView = 'all' | 'favorites' | 'archived';

function MessagesScreen() {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { activeRole, status, user } = useAuth();
  const [query, setQuery] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [view, setView] = useState<ChatView>('all');
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupMembers, setGroupMembers] = useState('');
  const queryKey = ['chats', activeRole, view, unreadOnly];
  const chats = useQuery({
    queryKey,
    queryFn: () => fetchChats({ role: activeRole, view, unreadOnly }),
    enabled: status === 'authenticated',
    staleTime: 45_000,
  });
  const archiveMutation = useChatListMutation(queryKey, chatId => archiveChat(chatId, view !== 'archived'), () => undefined);
  const favoriteMutation = useChatListMutation(queryKey, chatId => favoriteChat(chatId, true), chat => ({ ...chat, isFavorite: true }));
  const unfavoriteMutation = useChatListMutation(queryKey, chatId => favoriteChat(chatId, false), chat => view === 'favorites' ? undefined : { ...chat, isFavorite: false });
  const pinMutation = useChatListMutation(queryKey, chatId => pinChat(chatId, true), chat => ({ ...chat, isPinned: true }));
  const unpinMutation = useChatListMutation(queryKey, chatId => pinChat(chatId, false), chat => ({ ...chat, isPinned: false }));
  const muteMutation = useChatListMutation(queryKey, chatId => muteChat(chatId, true), chat => ({ ...chat, isMuted: true }));
  const unmuteMutation = useChatListMutation(queryKey, chatId => muteChat(chatId, false), chat => ({ ...chat, isMuted: false }));
  const markReadMutation = useChatListMutation(queryKey, chatId => markChatRead(chatId), chat => ({
    ...chat,
    buyerUnreadCount: activeRole === 'seller' ? chat.buyerUnreadCount : 0,
    sellerUnreadCount: activeRole === 'seller' ? 0 : chat.sellerUnreadCount,
  }));
  const markUnreadMutation = useChatListMutation(queryKey, chatId => markChatUnread(chatId), chat => ({ ...chat, buyerUnreadCount: activeRole === 'seller' ? chat.buyerUnreadCount : 1, sellerUnreadCount: activeRole === 'seller' ? 1 : chat.sellerUnreadCount }));
  const deleteMutation = useChatListMutation(queryKey, deleteChatForMe, () => undefined);
  const groupMutation = useMutation({
    mutationFn: () => createGroupChat({
      groupName: groupName.trim(),
      memberIds: groupMembers.split(',').map(item => item.trim()).filter(Boolean),
      role: activeRole,
    }),
    onSuccess: result => {
      setGroupOpen(false);
      setGroupName('');
      setGroupMembers('');
      queryClient.invalidateQueries({ queryKey: ['chats'] });
      if (result.chat) {
        navigation.navigate('ChatDetails', { chatId: getId(result.chat), title: result.chat.groupName ?? groupName.trim() });
      }
    },
    onError: error => Alert.alert('Group chat failed', error instanceof Error ? error.message : 'Unable to create group chat.'),
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
    <View style={styles.screen}>
      <FlashList
        style={styles.screen}
        contentContainerStyle={styles.list}
        data={chatItems}
        keyExtractor={item => getId(item)}
        refreshControl={<RefreshControl refreshing={chats.isRefetching} onRefresh={() => chats.refetch()} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Text style={styles.screenTitle}>Messenger</Text>
              <Pressable onPress={() => setGroupOpen(true)} style={({ pressed }) => [styles.headerIcon, pressed && styles.pressed]}>
                <Icon name="account-multiple-plus-outline" size={24} color={colors.ink} />
              </Pressable>
            </View>
            <View style={styles.quickRow}>
              <QuickAction icon="clipboard-list-outline" label="Orders" onPress={() => navigation.navigate('Orders')} />
              <QuickAction icon="bell-outline" label="Notifications" badge={unreadTotal} onPress={() => navigation.navigate('Notifications')} />
              <QuickAction icon="account-multiple-plus-outline" label="New Group" onPress={() => setGroupOpen(true)} />
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
            <View style={styles.tabs}>
              {(['all', 'favorites', 'archived'] as const).map(item => (
                <Pressable key={item} onPress={() => setView(item)} style={[styles.tabChip, view === item && styles.tabChipActive]}>
                  <Text style={[styles.tabText, view === item && styles.tabTextActive]}>{chatViewLabel(item)}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.filterRow}>
              <Pressable onPress={() => setUnreadOnly(value => !value)} style={[styles.filterChip, unreadOnly && styles.filterChipActive]}>
                <Text style={styles.filterText}>Unread</Text>
              </Pressable>
              <View style={[styles.filterChip, view === 'favorites' && styles.filterChipActive]}>
                <Icon name="star-outline" size={16} color={colors.ink} />
                <Text style={styles.filterText}>Favorites</Text>
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={<EmptyState title="No conversations" detail="Buyer-seller chats from /api/chats will appear here." />}
        renderItem={({ item }) => {
          const unread = activeRole === 'seller' ? item.sellerUnreadCount : item.buyerUnreadCount;
          const participant = resolveChatParticipant(item, user?.id ?? user?._id);
          const product = typeof item.productId === 'object' ? item.productId as Product : undefined;
          const isGroup = item.chatType === 'group';
          const title = isGroup ? item.groupName ?? 'Group chat' : participant.name ?? product?.name ?? item.chatType ?? 'Conversation';
          const subtitle = isGroup ? `${item.groupMembers?.length ?? 0} members` : product?.name ?? product?.title ?? item.chatType ?? 'Marketplace conversation';
          const date = item.lastMessageAt ? new Date(item.lastMessageAt).toLocaleDateString() : '';

        return (
          <Swipeable
            overshootRight={false}
            renderRightActions={() => (
              <View style={styles.swipeActions}>
                <SwipeAction
                  icon={view === 'archived' ? 'archive-arrow-up-outline' : 'archive-outline'}
                  label={view === 'archived' ? 'Unarchive' : 'Archive'}
                  color={colors.blue}
                  onPress={() => archiveMutation.mutate(getId(item))}
                />
                <SwipeAction
                  icon={item.isPinned ? 'pin-off-outline' : 'pin-outline'}
                  label={item.isPinned ? 'Unpin' : 'Pin'}
                  color={colors.secondary}
                  onPress={() => (item.isPinned ? unpinMutation : pinMutation).mutate(getId(item))}
                />
                <SwipeAction
                  icon={item.isFavorite ? 'star-off-outline' : 'star-outline'}
                  label={item.isFavorite ? 'Unstar' : 'Star'}
                  color={colors.amber}
                  onPress={() => (item.isFavorite ? unfavoriteMutation : favoriteMutation).mutate(getId(item))}
                />
                <SwipeAction
                  icon={unread ? 'email-open-outline' : 'email-outline'}
                  label={unread ? 'Read' : 'Unread'}
                  color={colors.green}
                  onPress={() => (unread ? markReadMutation : markUnreadMutation).mutate(getId(item))}
                />
                <SwipeAction
                  icon={item.isMuted ? 'bell-ring-outline' : 'bell-off-outline'}
                  label={item.isMuted ? 'Unmute' : 'Mute'}
                  color={colors.muted}
                  onPress={() => (item.isMuted ? unmuteMutation : muteMutation).mutate(getId(item))}
                />
                <SwipeAction
                  icon="delete-outline"
                  label="Delete"
                  color={colors.rose}
                  onPress={() => confirmDelete(title, () => deleteMutation.mutate(getId(item)))}
                />
              </View>
            )}>
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
                  {item.isFavorite ? <Icon name="star" size={14} color={colors.amber} /> : null}
                  {item.isPinned ? <Icon name="pin" size={14} color={colors.secondary} /> : null}
                  {item.isMuted ? <Icon name="bell-off-outline" size={14} color={colors.muted} /> : null}
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
          </Swipeable>
        );
        }}
      />
      <GroupChatModal
        visible={groupOpen}
        groupName={groupName}
        memberIds={groupMembers}
        pending={groupMutation.isPending}
        onChangeName={setGroupName}
        onChangeMembers={setGroupMembers}
        onClose={() => setGroupOpen(false)}
        onCreate={() => groupMutation.mutate()}
      />
    </View>
  );
}

function useChatListMutation(queryKey: unknown[], mutationFn: (chatId: string) => Promise<unknown>, updateChat: (chat: Chat) => Chat | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onMutate: async chatId => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Chat[]>(queryKey) ?? [];
      queryClient.setQueryData<Chat[]>(queryKey, previous.flatMap(chat => {
        if (getId(chat) !== chatId) {
          return [chat];
        }

        const updated = updateChat(chat);
        return updated ? [updated] : [];
      }));
      return { previous };
    },
    onError: (_error, _chatId, context) => {
      queryClient.setQueryData(queryKey, context?.previous ?? []);
      Alert.alert('Chat update failed', 'Unable to update this conversation. Please try again.');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['chats'] });
    },
  });
}

function SwipeAction({ icon, label, color, onPress }: { icon: string; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.swipeButton, { backgroundColor: color }]}>
      <Icon name={icon} size={20} color="#fff" />
      <Text style={styles.swipeText}>{label}</Text>
    </Pressable>
  );
}

function confirmDelete(title: string, onDelete: () => void) {
  Alert.alert('Delete chat?', `Remove ${title} from your messenger?`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete for me', style: 'destructive', onPress: onDelete },
  ]);
}

function chatViewLabel(view: ChatView) {
  if (view === 'favorites') return 'Favorites';
  if (view === 'archived') return 'Archived';
  return 'All chats';
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

function QuickAction({ icon, label, badge, onPress }: { icon: string; label: string; badge?: number; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}>
      <View>
        <Icon name={icon} size={27} color={colors.ink} />
        {badge ? (
          <View style={styles.quickBadge}>
            <Text style={styles.quickBadgeText}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

function GroupChatModal({
  visible,
  groupName,
  memberIds,
  pending,
  onChangeName,
  onChangeMembers,
  onClose,
  onCreate,
}: {
  visible: boolean;
  groupName: string;
  memberIds: string;
  pending: boolean;
  onChangeName: (value: string) => void;
  onChangeMembers: (value: string) => void;
  onClose: () => void;
  onCreate: () => void;
}) {
  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <View style={styles.groupSheet}>
        <View style={styles.sheetHandle} />
        <Text style={styles.groupTitle}>New group chat</Text>
        <Text style={styles.groupHelp}>Enter valid EsyGlob user IDs separated by commas. The backend validates every participant.</Text>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text style={styles.fieldLabel}>Group name</Text>
          <TextInput value={groupName} onChangeText={onChangeName} placeholder="Sourcing team" placeholderTextColor={colors.muted} style={styles.groupInput} />
          <Text style={styles.fieldLabel}>Member IDs</Text>
          <TextInput value={memberIds} onChangeText={onChangeMembers} multiline placeholder="userId1, userId2" placeholderTextColor={colors.muted} style={[styles.groupInput, styles.memberInput]} />
          <Pressable disabled={pending || !groupName.trim() || !memberIds.trim()} onPress={onCreate} style={[styles.createGroupButton, (pending || !groupName.trim() || !memberIds.trim()) && styles.createGroupButtonDisabled]}>
            <Text style={styles.createGroupText}>{pending ? 'Creating...' : 'Create group'}</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
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
    borderRadius: radii.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.98 }],
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
  tabs: {
    backgroundColor: colors.cardMuted,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.lg,
    padding: spacing.xs,
  },
  tabChip: {
    alignItems: 'center',
    borderRadius: radii.pill,
    flex: 1,
    paddingVertical: spacing.sm,
  },
  tabChipActive: {
    backgroundColor: colors.card,
  },
  tabText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '900',
  },
  tabTextActive: {
    color: colors.primaryDark,
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
  swipeActions: {
    alignItems: 'stretch',
    flexDirection: 'row',
    paddingVertical: spacing.sm,
  },
  swipeButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    width: 82,
  },
  swipeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
    marginTop: spacing.xs,
  },
  modalBackdrop: {
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  groupSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    bottom: 0,
    left: 0,
    maxHeight: '78%',
    padding: spacing.xl,
    position: 'absolute',
    right: 0,
  },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: colors.faint,
    borderRadius: radii.pill,
    height: 5,
    marginBottom: spacing.lg,
    width: 54,
  },
  groupTitle: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '900',
  },
  groupHelp: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: spacing.sm,
  },
  fieldLabel: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '900',
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  groupInput: {
    backgroundColor: colors.cardMuted,
    borderColor: colors.faint,
    borderRadius: radii.lg,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
    minHeight: 52,
    paddingHorizontal: spacing.md,
  },
  memberInput: {
    minHeight: 104,
    paddingTop: spacing.md,
    textAlignVertical: 'top',
  },
  createGroupButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
  },
  createGroupButtonDisabled: {
    opacity: 0.48,
  },
  createGroupText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },
});

export default MessagesScreen;
