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
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Swipeable } from 'react-native-gesture-handler';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  archiveChat,
  deleteChatForMe,
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

// ─── WhatsApp Palette ───────────────────────────────────────────────────────

const WP = {
  bg: '#FFFFFF',
  headerBg: '#075E54',
  headerText: '#FFFFFF',
  chatBg: '#FFFFFF',
  unreadBg: '#25D366',
  unreadText: '#FFFFFF',
  title: '#111B21',
  subtitle: '#667781',
  muted: '#8696A0',
  faint: '#E9EDEF',
  divider: '#F0F2F5',
  online: '#25D366',
  pinned: '#E8F5E9',
  swipeArchive: '#5F66CD',
  swipeRead: '#3B82F6',
  swipeDelete: '#EF4444',
  menuBg: '#FFFFFF',
  fab: '#00A884',
};

type ChatView = 'all' | 'archived';

// ─── Helpers ────────────────────────────────────────────────────────────────

function getUserId(user: CurrentUser): string | undefined {
  return user.id ?? user._id;
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
    image: firstImage(other?.profileImage, other?.avatar, other?.image),
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
  Alert.alert('Delete chat?', `Remove "${chatTitle}" from your chats?`, [
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
        previous.flatMap(chat => {
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
      // Get seller from chat
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

      // Get buyer from chat (for seller role)
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
        navigation.navigate('ChatDetails', {
          chatId: getId(result.chat),
          title: result.chat.groupName ?? groupName.trim(),
        });
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
      navigation={navigation}
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
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {view === 'archived'
            ? 'Archived'
            : unreadTotal > 0
            ? `Messages (${unreadTotal})`
            : 'Messages'}
        </Text>
        <View style={styles.headerActions}>
          <Pressable onPress={() => setUnreadOnly(v => !v)} style={styles.headerBtn}>
            <Icon
              name={unreadOnly ? 'filter-check' : 'filter-variant'}
              size={20}
              color={WP.headerText}
            />
          </Pressable>
          <Pressable onPress={() => setGroupOpen(true)} style={styles.headerBtn}>
            <Icon name="account-group-outline" size={20} color={WP.headerText} />
          </Pressable>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBox}>
          <Icon name="magnify" size={20} color={WP.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search"
            placeholderTextColor={WP.muted}
            style={styles.searchInput}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')}>
              <Icon name="close-circle" size={18} color={WP.muted} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.viewTabs}>
        <Pressable
          onPress={() => setView('all')}
          style={[styles.viewTab, view === 'all' && styles.viewTabActive]}>
          <Text style={[styles.viewTabText, view === 'all' && styles.viewTabTextActive]}>
            All
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setView('archived')}
          style={[styles.viewTab, view === 'archived' && styles.viewTabActive]}>
          <Text style={[styles.viewTabText, view === 'archived' && styles.viewTabTextActive]}>
            Archived
          </Text>
        </Pressable>
      </View>

      {/* Chat List */}
      <FlatList
        data={allChats}
        keyExtractor={(item: Chat) => getId(item) ?? ''}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={chats.isRefetching}
            onRefresh={() => chats.refetch()}
            tintColor={WP.online}
          />
        }
        ListEmptyComponent={
          <EmptyState
            title={view === 'archived' ? 'No archived chats' : 'No conversations'}
            detail="Your messages will appear here."
          />
        }
        renderItem={renderItem}
      />

      {/* Menu Modal */}
      <ChatMenuModal
        visible={menuChatId !== null}
        chatTitle={menuTitle}
        isPinned={menuChat?.isPinned ?? false}
        isMuted={menuChat?.isMuted ?? false}
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

      {/* Group Modal */}
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

// ─── Chat Row ───────────────────────────────────────────────────────────────

function ChatRow({
  item,
  user,
  activeRole,
  navigation,
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
  navigation: any;
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
        style={[styles.swipeBtn, { backgroundColor: WP.swipeArchive }]}
        onPress={() => archiveMutation.mutate(getId(item))}>
        <Icon
          name={view === 'archived' ? 'archive-arrow-up-outline' : 'archive-outline'}
          size={20}
          color="#fff"
        />
        <Text style={styles.swipeLabel}>{view === 'archived' ? 'Unarchive' : 'Archive'}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.swipeBtn, { backgroundColor: WP.swipeRead }]}
        onPress={() =>
          unread
            ? markReadMutation.mutate(getId(item))
            : markUnreadMutation.mutate(getId(item))
        }>
        <Icon
          name={unread ? 'email-open-outline' : 'email-outline'}
          size={20}
          color="#fff"
        />
        <Text style={styles.swipeLabel}>{unread ? 'Read' : 'Unread'}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.swipeBtn, { backgroundColor: WP.swipeDelete }]}
        onPress={handleDelete}>
        <Icon name="delete-outline" size={20} color="#fff" />
        <Text style={styles.swipeLabel}>Delete</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Swipeable renderRightActions={renderRightActions} overshootRight={false}>
      <Pressable
        onPress={() =>
          navigation.navigate('ChatDetails', { chatId: getId(item), title })
        }
        style={({ pressed }) => [
          styles.chatRow,
          item.isPinned && styles.pinnedRow,
          pressed && styles.chatRowPressed,
        ]}>
        {/* Avatar */}
        <View style={styles.avatarWrap}>
          {isGroup ? (
            <View style={styles.groupAvatar}>
              <Icon name="account-group" size={24} color={WP.subtitle} />
            </View>
          ) : (
            <RemoteImage
              uri={participant.image}
              width={100}
              height={100}
              style={styles.avatar}
              fallback={
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarText}>
                    {(title[0] ?? 'C').toUpperCase()}
                  </Text>
                </View>
              }
            />
          )}
        </View>

        {/* Content */}
        <View style={styles.chatContent}>
          <View style={styles.chatTopRow}>
            <Text style={styles.chatTitle} numberOfLines={1}>
              {title}
            </Text>
            <View style={styles.chatMeta}>
              {item.isMuted && <Icon name="bell-off-outline" size={12} color={WP.muted} />}
              {item.isPinned && <Icon name="pin-outline" size={12} color={WP.muted} />}
              <Text style={styles.chatDate}>{date}</Text>
            </View>
          </View>
          <View style={styles.chatBottomRow}>
            <Text style={styles.chatSubtitle} numberOfLines={1}>
              {subtitle}
            </Text>
            {unread > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{unread > 99 ? '99+' : unread}</Text>
              </View>
            )}
          </View>
        </View>

        {/* 3-dot */}
        <Pressable
          onPress={() => onOpenMenu(getId(item) ?? '')}
          style={styles.menuBtn}
          hitSlop={8}>
          <Icon name="dots-vertical" size={18} color={WP.muted} />
        </Pressable>
      </Pressable>
    </Swipeable>
  );
}

// ─── Chat Menu Modal ────────────────────────────────────────────────────────

function ChatMenuModal({
  visible,
  chatTitle,
  isPinned,
  isMuted,
  unread,
  onClose,
  onPin,
  onMute,
  onMarkRead,
  onMarkUnread,
  onDelete,
}: {
  visible: boolean;
  chatTitle: string;
  isPinned: boolean;
  isMuted: boolean;
  unread: number;
  onClose: () => void;
  onPin: () => void;
  onMute: () => void;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onDelete: () => void;
}) {
  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.menuBackdrop} onPress={onClose}>
        <View style={styles.menuSheet}>
          <Pressable onPress={onPin} style={styles.menuItem}>
            <Icon
              name={isPinned ? 'pin-off-outline' : 'pin-outline'}
              size={20}
              color={WP.title}
            />
            <Text style={styles.menuText}>{isPinned ? 'Unpin chat' : 'Pin chat'}</Text>
          </Pressable>
          <Pressable onPress={onMute} style={styles.menuItem}>
            <Icon
              name={isMuted ? 'bell-ring-outline' : 'bell-off-outline'}
              size={20}
              color={WP.title}
            />
            <Text style={styles.menuText}>{isMuted ? 'Unmute' : 'Mute'}</Text>
          </Pressable>
          {unread > 0 ? (
            <Pressable onPress={onMarkRead} style={styles.menuItem}>
              <Icon name="email-open-outline" size={20} color={WP.title} />
              <Text style={styles.menuText}>Mark as read</Text>
            </Pressable>
          ) : (
            <Pressable onPress={onMarkUnread} style={styles.menuItem}>
              <Icon name="email-outline" size={20} color={WP.title} />
              <Text style={styles.menuText}>Mark as unread</Text>
            </Pressable>
          )}
          <View style={styles.menuDivider} />
          <Pressable onPress={onDelete} style={styles.menuItem}>
            <Icon name="delete-outline" size={20} color="#EF4444" />
            <Text style={[styles.menuText, { color: '#EF4444' }]}>Delete chat</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

// ─── Group Chat Modal ───────────────────────────────────────────────────────

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
        <Text style={styles.groupTitle}>New group chat</Text>

        <Text style={styles.fieldLabel}>Group name</Text>
        <TextInput
          value={groupName}
          onChangeText={onChangeName}
          placeholder="Enter group name"
          placeholderTextColor={WP.muted}
          style={styles.groupInput}
        />

        <Text style={styles.fieldLabel}>
          Select from your chats ({selectedMembers.length} selected)
        </Text>
        {suppliers.length === 0 ? (
          <View style={styles.emptySuppliers}>
            <Icon name="chat-outline" size={24} color={WP.muted} />
            <Text style={styles.emptySuppliersText}>
              No chat contacts available. Start a conversation first.
            </Text>
          </View>
        ) : (
          <FlatList
            data={suppliers}
            keyExtractor={(item: SellerSummary) => getId(item) ?? ''}
            style={styles.supplierList}
            renderItem={({ item }: { item: SellerSummary }) => {
              const id = getId(item) ?? item._id ?? item.id ?? '';
              const isSelected = selectedMembers.includes(id);
              const name = item.companyName ?? item.businessName ?? item.displayName ?? id;

              return (
                <Pressable
                  onPress={() => onToggleMember(id)}
                  style={[styles.supplierItem, isSelected && styles.supplierItemSelected]}>
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
                  <Icon
                    name={
                      isSelected ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'
                    }
                    size={24}
                    color={isSelected ? WP.online : WP.muted}
                  />
                </Pressable>
              );
            }}
          />
        )}

        <Pressable
          disabled={pending || !groupName.trim() || selectedMembers.length === 0}
          onPress={onCreate}
          style={[
            styles.createBtn,
            (pending || !groupName.trim() || selectedMembers.length === 0) &&
              styles.createBtnDisabled,
          ]}>
          {pending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.createBtnText}>Create group</Text>
          )}
        </Pressable>
      </View>
    </Modal>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: WP.bg,
  },

  // Header
  header: {
    backgroundColor: WP.headerBg,
    paddingTop: 48,
    paddingBottom: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: WP.headerText,
    letterSpacing: 0.2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 4,
  },
  headerBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Search
  searchContainer: {
    backgroundColor: WP.bg,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: WP.faint,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: WP.faint,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 36,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: WP.title,
    padding: 0,
  },

  // View Tabs
  viewTabs: {
    flexDirection: 'row',
    backgroundColor: WP.bg,
    borderBottomWidth: 1,
    borderBottomColor: WP.faint,
  },
  viewTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  },
  viewTabActive: {
    borderBottomWidth: 3,
    borderBottomColor: WP.online,
  },
  viewTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: WP.muted,
  },
  viewTabTextActive: {
    color: WP.online,
  },

  // Chat List
  listContent: {
    paddingBottom: 80,
  },

  // Chat Row
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: WP.chatBg,
  },
  pinnedRow: {
    backgroundColor: WP.pinned,
  },
  chatRowPressed: {
    backgroundColor: WP.faint,
  },
  avatarWrap: {
    marginRight: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: WP.faint,
  },
  avatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: WP.faint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: WP.subtitle,
  },
  groupAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: WP.faint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatContent: {
    flex: 1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: WP.divider,
    paddingVertical: 8,
  },
  chatTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chatTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: WP.title,
    flex: 1,
  },
  chatMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  chatDate: {
    fontSize: 11,
    color: WP.muted,
  },
  chatBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 3,
  },
  chatSubtitle: {
    fontSize: 13,
    color: WP.subtitle,
    flex: 1,
  },
  unreadBadge: {
    backgroundColor: WP.unreadBg,
    borderRadius: 12,
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    marginLeft: 8,
  },
  unreadText: {
    color: WP.unreadText,
    fontSize: 11,
    fontWeight: '700',
  },

  // Menu Button
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuSheet: {
    backgroundColor: WP.menuBg,
    borderRadius: 14,
    width: 260,
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
  },
  menuText: {
    fontSize: 14,
    fontWeight: '500',
    color: WP.title,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: WP.faint,
    marginVertical: 4,
  },

  // Group Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  groupSheet: {
    backgroundColor: WP.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    bottom: 0,
    left: 0,
    maxHeight: '85%',
    position: 'absolute',
    right: 0,
    padding: 20,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: WP.faint,
    marginBottom: 16,
  },
  groupTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: WP.title,
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: WP.subtitle,
    marginBottom: 6,
    marginTop: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  groupInput: {
    backgroundColor: WP.faint,
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 44,
    fontSize: 14,
    color: WP.title,
  },
  supplierList: {
    maxHeight: 280,
    marginTop: 8,
  },
  supplierItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 10,
  },
  supplierItemSelected: {
    backgroundColor: '#E8F5E9',
  },
  supplierAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: WP.faint,
  },
  supplierAvatarImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  supplierAvatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: WP.faint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supplierAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: WP.subtitle,
  },
  supplierInfo: {
    flex: 1,
  },
  supplierName: {
    fontSize: 14,
    fontWeight: '600',
    color: WP.title,
  },
  supplierMeta: {
    fontSize: 11,
    color: WP.muted,
    marginTop: 1,
  },
  emptySuppliers: {
    alignItems: 'center',
    padding: 24,
    gap: 8,
  },
  emptySuppliersText: {
    fontSize: 12,
    color: WP.muted,
    textAlign: 'center',
    lineHeight: 18,
  },
  createBtn: {
    backgroundColor: WP.fab,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    marginTop: 20,
  },
  createBtnDisabled: {
    opacity: 0.5,
  },
  createBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});

export default MessagesScreen;