import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Swipeable } from 'react-native-gesture-handler';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  archiveChat,
  deleteChatForMe,
  favoriteChat,
  fetchChats,
  markChatRead,
  markChatUnread,
  muteChat,
  pinChat,
  createGroupChat,
} from '../api/marketplace';
import { Chat, CurrentUser, Product, SellerSummary } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import RemoteImage from '../components/RemoteImage';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { getId } from '../utils/format';
import { firstImage } from '../utils/images';
import AuthScreen from './AuthScreen';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Enhanced Palette ───────────────────────────────────────────────────────

const P = {
  bg: '#F8F9FA',
  surface: '#FFFFFF',
  primary: '#075E54',
  primaryLight: '#E8F5E9',
  primaryDark: '#054B44',
  accent: '#25D366',
  text: '#1A1A1A',
  textSecondary: '#667781',
  textMuted: '#8696A0',
  border: '#E9EDEF',
  divider: '#F0F2F5',
  shadow: 'rgba(0,0,0,0.06)',
  unread: '#25D366',
  pinned: '#FFF8E7',
  swipeArchive: '#5F66CD',
  swipeRead: '#3B82F6',
  swipeDelete: '#EF4444',
  online: '#25D366',
  offline: '#94A3B8',
  gold: '#F59E0B',
};

type ChatView = 'all' | 'favorites' | 'archived';

// ─── Helpers ────────────────────────────────────────────────────────────────

function getUserId(user: CurrentUser): string | undefined {
  return user?.id ?? user?._id;
}

function resolveChatParticipant(chat: Chat, currentUserId?: string) {
  const buyer = typeof chat.buyerId === 'object' ? (chat.buyerId as CurrentUser) : undefined;
  const seller = typeof chat.sellerId === 'object' ? (chat.sellerId as CurrentUser) : undefined;
  const current = currentUserId;
  const other =
    current && buyer && getUserId(buyer) === current
      ? seller
      : current && seller && getUserId(seller) === current
      ? buyer
      : seller ?? buyer;

  return {
    name: other?.name ?? other?.fullName ?? other?.email ?? 'User',
    image: firstImage(other?.profileImage, other?.avatarUrl, other?.avatar, other?.image),
  };
}

function formatChatTime(date: Date): string {
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (isYesterday) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function confirmDelete(chatTitle: string, onDelete: () => void) {
  Alert.alert('Delete Chat', `Remove "${chatTitle}" from your chats?`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onDelete },
  ]);
}

function useChatMutation(
  queryKey: unknown[],
  mutationFn: (chatId: string) => Promise<unknown>,
  updateChat: (chat: Chat) => Chat | undefined,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onMutate: async (chatId: string) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Chat[]>(queryKey) ?? [];
      queryClient.setQueryData<Chat[]>(
        queryKey,
        previous.flatMap((chat: Chat) => {
          if (getId(chat) !== chatId) return [chat];
          const updated = updateChat(chat);
          return updated ? [updated] : [];
        }),
      );
      return { previous };
    },
    onError: (_error: unknown, _chatId: string, context: any) => {
      queryClient.setQueryData(queryKey, context?.previous ?? []);
      Alert.alert('Error', 'Unable to update. Please try again.');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['chats'] });
    },
  });
}

// ─── Main Component ─────────────────────────────────────────────────────────

function MessagesScreen() {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { activeRole, status, user } = useAuth();
  const [query, setQuery] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [view, setView] = useState<ChatView>('all');
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [menuChatId, setMenuChatId] = useState<string | null>(null);

  const queryKey = ['chats', activeRole, view, unreadOnly];

  const chats = useQuery({
    queryKey,
    queryFn: () => fetchChats({ role: activeRole, view, unreadOnly }),
    enabled: status === 'authenticated',
    staleTime: 45_000,
  });

  // Extract unique chat participants for group creation
  const chatSellers = useMemo(() => {
    if (!chats.data?.length) return [];

    const sellerMap = new Map<string, SellerSummary>();

    chats.data.forEach((chat: Chat) => {
      const seller =
        typeof chat.sellerId === 'object' ? (chat.sellerId as SellerSummary) : undefined;

      if (seller) {
        const id = getId(seller) ?? seller._id ?? seller.id;
        if (id && !sellerMap.has(id)) {
          sellerMap.set(id, {
            ...seller,
            _id: id,
            id: id,
          });
        }
      }

      const buyer =
        typeof chat.buyerId === 'object' ? (chat.buyerId as CurrentUser) : undefined;

      if (buyer) {
        const id = buyer._id ?? buyer.id;
        if (id && !sellerMap.has(id)) {
          sellerMap.set(id, {
            _id: id,
            id: id,
            companyName: buyer.name ?? buyer.fullName ?? buyer.email ?? 'User',
            displayName: buyer.name ?? buyer.fullName,
            logo: buyer.profileImage ?? buyer.avatar ?? buyer.image,
            companyLogo: buyer.profileImage ?? buyer.avatar ?? buyer.image,
            logoUrl: buyer.profileImage ?? buyer.avatar ?? buyer.image,
          } as SellerSummary);
        }
      }
    });

    return Array.from(sellerMap.values());
  }, [chats.data]);

  const archiveMutation = useChatMutation(
    queryKey,
    (chatId: string) => archiveChat(chatId, view !== 'archived'),
    () => undefined,
  );
  const pinMutation = useChatMutation(
    queryKey,
    (chatId: string) => pinChat(chatId, true),
    (chat: Chat) => ({ ...chat, isPinned: true }),
  );
  const unpinMutation = useChatMutation(
    queryKey,
    (chatId: string) => pinChat(chatId, false),
    (chat: Chat) => ({ ...chat, isPinned: false }),
  );
  const muteMutation = useChatMutation(
    queryKey,
    (chatId: string) => muteChat(chatId, true),
    (chat: Chat) => ({ ...chat, isMuted: true }),
  );
  const unmuteMutation = useChatMutation(
    queryKey,
    (chatId: string) => muteChat(chatId, false),
    (chat: Chat) => ({ ...chat, isMuted: false }),
  );
  const favoriteMutation = useChatMutation(
    queryKey,
    (chatId: string) => favoriteChat(chatId, true),
    (chat: Chat) => ({ ...chat, isFavorite: true }),
  );
  const unfavoriteMutation = useChatMutation(
    queryKey,
    (chatId: string) => favoriteChat(chatId, false),
    (chat: Chat) => ({ ...chat, isFavorite: false }),
  );
  const markReadMutation = useChatMutation(
    queryKey,
    (chatId: string) => markChatRead(chatId),
    (chat: Chat) => ({
      ...chat,
      buyerUnreadCount: activeRole === 'seller' ? chat.buyerUnreadCount : 0,
      sellerUnreadCount: activeRole === 'seller' ? 0 : chat.sellerUnreadCount,
    }),
  );
  const markUnreadMutation = useChatMutation(
    queryKey,
    (chatId: string) => markChatUnread(chatId),
    (chat: Chat) => ({
      ...chat,
      buyerUnreadCount: activeRole === 'seller' ? chat.buyerUnreadCount : 1,
      sellerUnreadCount: activeRole === 'seller' ? 1 : chat.sellerUnreadCount,
    }),
  );
  const deleteMutation = useChatMutation(
    queryKey,
    (chatId: string) => deleteChatForMe(chatId),
    () => undefined,
  );

  const groupMutation = useMutation({
    mutationFn: () =>
      createGroupChat({
        groupName: groupName.trim(),
        memberIds: selectedMembers,
        role: activeRole,
      }),
    onSuccess: (result: any) => {
      setGroupOpen(false);
      setGroupName('');
      setSelectedMembers([]);
      queryClient.invalidateQueries({ queryKey: ['chats'] });
      if (result.chat) {
        const chatId = getId(result.chat);
        if (chatId) {
          navigation.navigate('ChatDetails', {
            chatId: chatId,
            title: result.chat.groupName ?? groupName.trim(),
          });
        }
      }
    },
    onError: (error: unknown) =>
      Alert.alert(
        'Group chat failed',
        error instanceof Error ? error.message : 'Unable to create group chat.',
      ),
  });

  const toggleMember = useCallback((id: string) => {
    setSelectedMembers(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id],
    );
  }, []);

  const chatItems = useMemo(
    () =>
      (chats.data ?? []).filter((item: Chat) => {
        const participant = resolveChatParticipant(item, user?.id ?? user?._id);
        const product =
          typeof item.productId === 'object' ? (item.productId as Product) : undefined;
        const haystack = [
          participant.name,
          product?.name,
          product?.title,
          item.chatType,
          item.lastMessage,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        const unread =
          activeRole === 'seller' ? item.sellerUnreadCount : item.buyerUnreadCount;
        return (
          (!unreadOnly || Boolean(unread)) &&
          (!query.trim() || haystack.includes(query.trim().toLowerCase()))
        );
      }),
    [activeRole, chats.data, query, unreadOnly, user],
  );

  const { pinnedChats, unpinnedChats } = useMemo(() => {
    const pinned: Chat[] = [];
    const unpinned: Chat[] = [];
    chatItems.forEach((item: Chat) => {
      (item.isPinned ? pinned : unpinned).push(item);
    });
    return { pinnedChats: pinned, unpinnedChats: unpinned };
  }, [chatItems]);

  const allChats = useMemo(
    () => [...pinnedChats, ...unpinnedChats],
    [pinnedChats, unpinnedChats],
  );

  const unreadTotal = (chats.data ?? []).reduce((total: number, item: Chat) => {
    const unread = activeRole === 'seller' ? item.sellerUnreadCount : item.buyerUnreadCount;
    return total + (unread ?? 0);
  }, 0);

  const menuChat = useMemo(
    () => chatItems.find((c: Chat) => getId(c) === menuChatId),
    [chatItems, menuChatId],
  );

  const menuTitle = useMemo(() => {
    if (!menuChat) return 'Conversation';
    return resolveChatParticipant(menuChat, user?.id ?? user?._id).name;
  }, [menuChat, user]);

  // ─── FIXED: Handle chat navigation with proper error handling ──────────

  const handleChatPress = useCallback((chat: Chat) => {
    try {
      const chatId = getId(chat);
      if (!chatId) {
        Alert.alert('Error', 'Invalid chat ID. Please try again.');
        return;
      }

      const participant = resolveChatParticipant(chat, user?.id ?? user?._id);
      const title = chat.chatType === 'group' 
        ? chat.groupName ?? 'Group chat'
        : participant.name ?? 'Chat';

      // Navigate to chat using root navigation
      navigation.navigate('ChatDetails', {
        chatId: chatId,
        title: title,
      });
    } catch (error) {
      console.error('Navigation error:', error);
      Alert.alert('Error', 'Unable to open chat. Please try again.');
    }
  }, [navigation, user]);

  if (status !== 'authenticated') {
    return <AuthScreen onClose={() => navigation.navigate('Home')} />;
  }

  if (chats.isLoading) {
    return <LoadingState label="Loading conversations..." />;
  }

  if (chats.isError) {
    return (
      <ErrorState
        message={(chats.error as Error)?.message ?? 'Failed to load'}
        onRetry={() => chats.refetch()}
      />
    );
  }

  const renderItem = ({ item }: { item: Chat }) => (
    <ChatRow
      item={item}
      user={user}
      activeRole={activeRole ?? 'buyer'}
      onPress={handleChatPress}
      view={view}
      archiveMutation={archiveMutation}
      markReadMutation={markReadMutation}
      markUnreadMutation={markUnreadMutation}
      deleteMutation={deleteMutation}
      onOpenMenu={setMenuChatId}
    />
  );

  return (
    <View style={styles.screen}>
      {/* Enhanced Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {view === 'archived'
            ? 'Archived Chats'
            : unreadTotal > 0
            ? `Chats (${unreadTotal})`
            : 'Chats'}
        </Text>
        <View style={styles.headerActions}>
          <TouchableOpacity 
            onPress={() => setUnreadOnly(v => !v)} 
            style={[styles.headerBtn, unreadOnly && styles.headerBtnActive]}
          >
            <Icon
              name={unreadOnly ? 'filter-check' : 'filter-variant'}
              size={20}
              color={unreadOnly ? '#FFF' : P.textSecondary}
            />
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => setGroupOpen(true)} 
            style={styles.headerBtn}
          >
            <Icon name="account-group-plus" size={20} color={P.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Enhanced Search */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBox}>
          <Icon name="magnify" size={20} color={P.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search chats..."
            placeholderTextColor={P.textMuted}
            style={styles.searchInput}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Icon name="close-circle" size={18} color={P.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Enhanced Tabs */}
      <View style={styles.tabContainer}>
        <View style={styles.tabsWrapper}>
          {(['all', 'favorites', 'archived'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => setView(tab)}
              style={[
                styles.tab,
                view === tab && styles.tabActive,
              ]}
            >
              <Text style={[
                styles.tabText,
                view === tab && styles.tabTextActive,
              ]}>
                {tab === 'all' ? 'All' : tab === 'favorites' ? 'Starred' : 'Archived'}
              </Text>
              {view === tab && <View style={styles.tabIndicator} />}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Chat List */}
      <FlatList
        data={allChats}
        keyExtractor={(item: Chat) => getId(item) ?? Math.random().toString()}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={chats.isRefetching}
            onRefresh={() => chats.refetch()}
            tintColor={P.primary}
            colors={[P.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="chat-outline" size={60} color={P.textMuted} />
            <Text style={styles.emptyTitle}>
              {view === 'archived' ? 'No archived chats' : 'No conversations yet'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {view === 'archived' 
                ? 'Archived chats will appear here' 
                : 'Start a conversation with a supplier or buyer'}
            </Text>
          </View>
        }
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
      />

      {/* Enhanced Menu Modal */}
      <ChatMenuModal
        visible={menuChatId !== null}
        isPinned={menuChat?.isPinned ?? false}
        isMuted={menuChat?.isMuted ?? false}
        isFavorite={menuChat?.isFavorite ?? false}
        unread={
          menuChat
            ? activeRole === 'seller'
              ? menuChat.sellerUnreadCount ?? 0
              : menuChat.buyerUnreadCount ?? 0
            : 0
        }
        onClose={() => setMenuChatId(null)}
        onPin={() => {
          if (menuChatId) {
            (menuChat?.isPinned ? unpinMutation : pinMutation).mutate(menuChatId);
          }
          setMenuChatId(null);
        }}
        onMute={() => {
          if (menuChatId) {
            (menuChat?.isMuted ? unmuteMutation : muteMutation).mutate(menuChatId);
          }
          setMenuChatId(null);
        }}
        onFavorite={() => {
          if (menuChatId) {
            (menuChat?.isFavorite ? unfavoriteMutation : favoriteMutation).mutate(menuChatId);
          }
          setMenuChatId(null);
        }}
        onMarkRead={() => {
          if (menuChatId) markReadMutation.mutate(menuChatId);
          setMenuChatId(null);
        }}
        onMarkUnread={() => {
          if (menuChatId) markUnreadMutation.mutate(menuChatId);
          setMenuChatId(null);
        }}
        onDelete={() => {
          if (menuChatId) {
            confirmDelete(menuTitle, () => deleteMutation.mutate(menuChatId));
          }
          setMenuChatId(null);
        }}
      />

      {/* Enhanced Group Modal */}
      <GroupChatModal
        visible={groupOpen}
        groupName={groupName}
        selectedMembers={selectedMembers}
        suppliers={chatSellers}
        pending={groupMutation.isPending}
        onChangeName={setGroupName}
        onToggleMember={toggleMember}
        onClose={() => {
          setGroupOpen(false);
          setSelectedMembers([]);
          setGroupName('');
        }}
        onCreate={() => groupMutation.mutate()}
      />
    </View>
  );
}

// ─── Enhanced Chat Row ─────────────────────────────────────────────────────

function ChatRow({
  item,
  user,
  activeRole,
  onPress,
  view,
  archiveMutation,
  markReadMutation,
  markUnreadMutation,
  deleteMutation,
  onOpenMenu,
}: {
  item: Chat;
  user: CurrentUser | null;
  activeRole?: string;
  onPress: (chat: Chat) => void;
  view: ChatView;
  archiveMutation: any;
  markReadMutation: any;
  markUnreadMutation: any;
  deleteMutation: any;
  onOpenMenu: (id: string) => void;
}) {
  const role = activeRole ?? 'buyer';
  const unread = role === 'seller' ? (item.sellerUnreadCount ?? 0) : (item.buyerUnreadCount ?? 0);
  const participant = resolveChatParticipant(item, user?.id ?? user?._id);
  const product =
    typeof item.productId === 'object' ? (item.productId as Product) : undefined;
  const isGroup = item.chatType === 'group';
  const title = isGroup
    ? item.groupName ?? 'Group chat'
    : participant.name ?? product?.name ?? item.chatType ?? 'Conversation';
  const subtitle = item.lastMessage ?? 'Tap to start chatting';
  const date = item.lastMessageAt ? formatChatTime(new Date(item.lastMessageAt)) : '';

  const handleDelete = () => {
    confirmDelete(title, () => deleteMutation.mutate(getId(item)));
  };

  const renderRightActions = () => (
    <View style={styles.swipeActions}>
      <TouchableOpacity
        style={[styles.swipeBtn, { backgroundColor: P.swipeArchive }]}
        onPress={() => archiveMutation.mutate(getId(item))}>
        <Icon name={view === 'archived' ? 'archive-arrow-up' : 'archive'} size={22} color="#fff" />
        <Text style={styles.swipeLabel}>{view === 'archived' ? 'Unarchive' : 'Archive'}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.swipeBtn, { backgroundColor: P.swipeRead }]}
        onPress={() =>
          unread
            ? markReadMutation.mutate(getId(item))
            : markUnreadMutation.mutate(getId(item))
        }>
        <Icon name={unread ? 'email-open-outline' : 'email-outline'} size={22} color="#fff" />
        <Text style={styles.swipeLabel}>{unread ? 'Read' : 'Unread'}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.swipeBtn, { backgroundColor: P.swipeDelete }]}
        onPress={handleDelete}>
        <Icon name="delete-outline" size={22} color="#fff" />
        <Text style={styles.swipeLabel}>Delete</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Swipeable renderRightActions={renderRightActions} overshootRight={false}>
      <Pressable
        onPress={() => onPress(item)}
        style={({ pressed }) => [
          styles.chatRow,
          item.isPinned && styles.chatRowPinned,
          pressed && styles.chatRowPressed,
        ]}
      >
        {/* Avatar with online indicator */}
        <View style={styles.avatarContainer}>
          {isGroup ? (
            <View style={styles.groupAvatar}>
              <Icon name="account-group" size={28} color={P.textMuted} />
            </View>
          ) : (
            <View>
              <RemoteImage
                uri={participant.image}
                width={100}
                height={100}
                style={styles.avatar}
                fallback={
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarText}>
                      {(title[0] ?? '?').toUpperCase()}
                    </Text>
                  </View>
                }
              />
              {/* Online indicator - remove if not needed */}
              <View style={[styles.onlineDot, { backgroundColor: P.offline }]} />
            </View>
          )}
        </View>

        {/* Content */}
        <View style={styles.chatContent}>
          <View style={styles.chatTopRow}>
            <Text style={styles.chatTitle} numberOfLines={1}>
              {title}
            </Text>
            <View style={styles.chatMeta}>
              {item.isMuted && <Icon name="bell-off" size={14} color={P.textMuted} />}
              {item.isPinned && <Icon name="pin" size={14} color={P.textMuted} />}
              <Text style={styles.chatDate}>{date}</Text>
            </View>
          </View>
          <View style={styles.chatBottomRow}>
            <Text style={[styles.chatSubtitle, unread > 0 && styles.chatSubtitleUnread]} numberOfLines={1}>
              {subtitle}
            </Text>
            {unread > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{unread > 99 ? '99+' : unread}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Menu button */}
        <TouchableOpacity
          onPress={() => {
            const id = getId(item);
            if (id) onOpenMenu(id);
          }}
          style={styles.menuBtn}
          hitSlop={8}
        >
          <Icon name="dots-vertical" size={20} color={P.textMuted} />
        </TouchableOpacity>
      </Pressable>
    </Swipeable>
  );
}

// ─── Enhanced Chat Menu Modal ─────────────────────────────────────────────

function ChatMenuModal({
  visible,
  isPinned,
  isMuted,
  isFavorite,
  unread,
  onClose,
  onPin,
  onMute,
  onFavorite,
  onMarkRead,
  onMarkUnread,
  onDelete,
}: {
  visible: boolean;
  isPinned: boolean;
  isMuted: boolean;
  isFavorite: boolean;
  unread: number;
  onClose: () => void;
  onPin: () => void;
  onMute: () => void;
  onFavorite: () => void;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onDelete: () => void;
}) {
  if (!visible) return null;

  const menuItems = [
    { 
      icon: isPinned ? 'pin-off' : 'pin', 
      label: isPinned ? 'Unpin chat' : 'Pin chat', 
      onPress: onPin,
      color: P.text 
    },
    { 
      icon: isMuted ? 'bell-ring' : 'bell-off', 
      label: isMuted ? 'Unmute' : 'Mute', 
      onPress: onMute,
      color: P.text 
    },
    { 
      icon: isFavorite ? 'star-off' : 'star', 
      label: isFavorite ? 'Remove star' : 'Star chat', 
      onPress: onFavorite,
      color: P.text 
    },
    { 
      icon: unread > 0 ? 'email-open-outline' : 'email-outline', 
      label: unread > 0 ? 'Mark as read' : 'Mark as unread', 
      onPress: unread > 0 ? onMarkRead : onMarkUnread,
      color: P.text 
    },
    { 
      icon: 'delete-outline', 
      label: 'Delete chat', 
      onPress: onDelete,
      color: P.swipeDelete 
    },
  ];

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.menuBackdrop} onPress={onClose}>
        <View style={styles.menuSheet}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              onPress={item.onPress}
              style={[
                styles.menuItem,
                index === menuItems.length - 1 && styles.menuItemLast,
              ]}
            >
              <Icon name={item.icon} size={22} color={item.color} />
              <Text style={[
                styles.menuText,
                item.color === P.swipeDelete && styles.menuTextDanger,
              ]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

// ─── Enhanced Group Chat Modal ─────────────────────────────────────────────

function GroupChatModal({
  visible,
  groupName,
  selectedMembers,
  suppliers,
  pending,
  onChangeName,
  onToggleMember,
  onClose,
  onCreate,
}: {
  visible: boolean;
  groupName: string;
  selectedMembers: string[];
  suppliers: SellerSummary[];
  pending: boolean;
  onChangeName: (value: string) => void;
  onToggleMember: (id: string) => void;
  onClose: () => void;
  onCreate: () => void;
}) {
  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <View style={styles.groupSheet}>
        <View style={styles.sheetHandle} />
        
        <View style={styles.groupHeader}>
          <Text style={styles.groupTitle}>New Group Chat</Text>
          <TouchableOpacity onPress={onClose} style={styles.groupCloseBtn}>
            <Icon name="close" size={24} color={P.text} />
          </TouchableOpacity>
        </View>

        <Text style={styles.fieldLabel}>Group Name</Text>
        <TextInput
          value={groupName}
          onChangeText={onChangeName}
          placeholder="Enter group name..."
          placeholderTextColor={P.textMuted}
          style={styles.groupInput}
        />

        <Text style={styles.fieldLabel}>
          Select Members ({selectedMembers.length} selected)
        </Text>
        {suppliers.length === 0 ? (
          <View style={styles.emptySuppliers}>
            <Icon name="chat-outline" size={40} color={P.textMuted} />
            <Text style={styles.emptySuppliersTitle}>No contacts available</Text>
            <Text style={styles.emptySuppliersText}>
              Start a conversation first to create a group
            </Text>
          </View>
        ) : (
          <FlatList
            data={suppliers}
            keyExtractor={(item: SellerSummary) => getId(item) ?? Math.random().toString()}
            style={styles.supplierList}
            renderItem={({ item }: { item: SellerSummary }) => {
              const id = getId(item) ?? item._id ?? item.id ?? '';
              const isSelected = selectedMembers.includes(id);
              const name = item.companyName ?? item.businessName ?? item.displayName ?? id;

              return (
                <TouchableOpacity
                  onPress={() => onToggleMember(id)}
                  style={[styles.supplierItem, isSelected && styles.supplierItemSelected]}
                >
                  <View style={styles.supplierAvatar}>
                    <RemoteImage
                      uri={firstImage(item.logo, item.companyLogo, item.logoUrl)}
                      width={80}
                      height={80}
                      style={styles.supplierAvatarImg}
                      fallback={
                        <View style={styles.supplierAvatarFallback}>
                          <Text style={styles.supplierAvatarText}>
                            {(name[0] ?? '?').toUpperCase()}
                          </Text>
                        </View>
                      }
                    />
                  </View>
                  <View style={styles.supplierInfo}>
                    <Text style={styles.supplierName} numberOfLines={1}>
                      {name}
                    </Text>
                    <Text style={styles.supplierMeta}>
                      {item.address?.country ?? item.country ?? 'Chat contact'}
                    </Text>
                  </View>
                  <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                    {isSelected && <Icon name="check" size={16} color="#FFF" />}
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}

        <TouchableOpacity
          disabled={pending || !groupName.trim() || selectedMembers.length === 0}
          onPress={onCreate}
          style={[
            styles.createBtn,
            (pending || !groupName.trim() || selectedMembers.length === 0) &&
              styles.createBtnDisabled,
          ]}
        >
          {pending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.createBtnText}>Create Group</Text>
          )}
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ─── Enhanced Styles ───────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: P.bg,
  },

  // Header
  header: {
    backgroundColor: P.surface,
    paddingTop: 48,
    paddingBottom: 12,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: P.border,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: P.text,
    letterSpacing: -0.3,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: P.bg,
  },
  headerBtnActive: {
    backgroundColor: P.primary,
  },

  // Search
  searchContainer: {
    backgroundColor: P.surface,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: P.border,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: P.bg,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 42,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: P.text,
    padding: 0,
  },

  // Tabs
  tabContainer: {
    backgroundColor: P.surface,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: P.border,
  },
  tabsWrapper: {
    flexDirection: 'row',
    gap: 4,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    position: 'relative',
  },
  tabActive: {
    backgroundColor: P.primaryLight,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: P.textSecondary,
  },
  tabTextActive: {
    color: P.primary,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: '30%',
    right: '30%',
    height: 2,
    backgroundColor: P.primary,
    borderRadius: 1,
  },

  // List
  listContent: {
    paddingBottom: 80,
  },

  // Chat Row
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: P.surface,
    borderBottomWidth: 1,
    borderBottomColor: P.divider,
  },
  chatRowPinned: {
    backgroundColor: P.pinned,
  },
  chatRowPressed: {
    backgroundColor: P.bg,
  },
  avatarContainer: {
    marginRight: 12,
    position: 'relative',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: P.bg,
  },
  avatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: P.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: P.primary,
  },
  groupAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: P.bg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: P.border,
  },
  onlineDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: P.surface,
  },
  chatContent: {
    flex: 1,
    paddingVertical: 4,
  },
  chatTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  chatTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: P.text,
    flex: 1,
  },
  chatMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  chatDate: {
    fontSize: 11,
    color: P.textMuted,
    fontWeight: '500',
  },
  chatBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chatSubtitle: {
    fontSize: 13,
    color: P.textSecondary,
    flex: 1,
  },
  chatSubtitleUnread: {
    color: P.text,
    fontWeight: '600',
  },
  unreadBadge: {
    backgroundColor: P.unread,
    borderRadius: 12,
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  unreadText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  menuBtn: {
    padding: 8,
    marginLeft: 4,
  },

  // Swipe
  swipeActions: {
    flexDirection: 'row',
    height: '100%',
  },
  swipeBtn: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  swipeLabel: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },

  // Menu Modal
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuSheet: {
    backgroundColor: P.surface,
    borderRadius: 16,
    width: SCREEN_WIDTH * 0.85,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: P.divider,
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuText: {
    fontSize: 15,
    fontWeight: '500',
    color: P.text,
  },
  menuTextDanger: {
    color: P.swipeDelete,
  },

  // Group Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  groupSheet: {
    backgroundColor: P.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    bottom: 0,
    left: 0,
    maxHeight: '85%',
    position: 'absolute',
    right: 0,
    padding: 20,
    paddingBottom: 34,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: P.border,
    marginBottom: 16,
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  groupTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: P.text,
  },
  groupCloseBtn: {
    padding: 4,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: P.textSecondary,
    marginBottom: 6,
    marginTop: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  groupInput: {
    backgroundColor: P.bg,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 46,
    fontSize: 15,
    color: P.text,
  },
  supplierList: {
    maxHeight: 300,
    marginTop: 8,
  },
  supplierItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 12,
  },
  supplierItemSelected: {
    backgroundColor: P.primaryLight,
  },
  supplierAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: P.bg,
  },
  supplierAvatarImg: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  supplierAvatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: P.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supplierAvatarText: {
    fontSize: 17,
    fontWeight: '700',
    color: P.primary,
  },
  supplierInfo: {
    flex: 1,
  },
  supplierName: {
    fontSize: 15,
    fontWeight: '600',
    color: P.text,
  },
  supplierMeta: {
    fontSize: 12,
    color: P.textMuted,
    marginTop: 1,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: P.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: P.primary,
    borderColor: P.primary,
  },
  emptySuppliers: {
    alignItems: 'center',
    padding: 30,
    gap: 8,
  },
  emptySuppliersTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: P.textSecondary,
  },
  emptySuppliersText: {
    fontSize: 13,
    color: P.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  createBtn: {
    backgroundColor: P.primary,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
    marginTop: 20,
  },
  createBtnDisabled: {
    opacity: 0.5,
  },
  createBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  // Empty State
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: P.textSecondary,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: P.textMuted,
    textAlign: 'center',
    marginTop: 8,
  },
});

export default MessagesScreen;