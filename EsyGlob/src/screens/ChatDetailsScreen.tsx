import React, { useMemo, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { enableChatOrder, fetchChatDetails, sendChatMessage } from '../api/marketplace';
import { CurrentUser, MessageItem, Product } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import RemoteImage from '../components/RemoteImage';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { colors, radii, spacing } from '../theme';
import { formatValue } from '../utils/display';
import { getId } from '../utils/format';
import { firstImage } from '../utils/images';

function ChatDetailsScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { activeRole, user } = useAuth();
  const { chatId, title } = route.params as { chatId: string; title?: string };
  const [draft, setDraft] = useState('');
  const chat = useQuery({
    queryKey: ['chat-details', chatId],
    queryFn: () => fetchChatDetails(chatId),
    enabled: Boolean(chatId),
  });
  const senderId = user?.id ?? user?._id;
  const participant = useMemo(() => {
    const item = chat.data?.chat;
    const buyer = typeof item?.buyerId === 'object' ? item.buyerId as CurrentUser : undefined;
    const seller = typeof item?.sellerId === 'object' ? item.sellerId as CurrentUser : undefined;
    const other = senderId && buyer && getUserId(buyer) === senderId ? seller : senderId && seller && getUserId(seller) === senderId ? buyer : seller ?? buyer;

    return {
      name: other?.name ?? other?.fullName ?? other?.email ?? title ?? 'Conversation',
      image: firstImage(other?.profileImage, other?.avatar, other?.image),
    };
  }, [chat.data?.chat, senderId, title]);
  const send = useMutation({
    mutationFn: (content: string) => sendChatMessage(chatId, content),
    onSuccess: () => {
      setDraft('');
      queryClient.invalidateQueries({ queryKey: ['chat-details', chatId] });
      queryClient.invalidateQueries({ queryKey: ['chats'] });
    },
  });
  const enableOrder = useMutation({
    mutationFn: (nextProductId: string) => enableChatOrder(chatId, nextProductId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-details', chatId] });
      Alert.alert('Start Order enabled', 'The buyer can now start a trade order for this product.');
    },
    onError: error => Alert.alert('Unable to enable Start Order', error instanceof Error ? error.message : 'Backend rejected the request.'),
  });

  const submit = () => {
    const content = draft.trim();

    if (content && !send.isPending) {
      send.mutate(content);
    }
  };

  if (chat.isLoading) {
    return <LoadingState label="Loading messages" />;
  }

  if (chat.isError || !chat.data?.chat) {
    return <ErrorState message={(chat.error as Error)?.message ?? 'Conversation was not returned.'} onRetry={() => chat.refetch()} />;
  }

  const messages = chat.data.messages ?? [];
  const chatProduct = typeof chat.data.chat.productId === 'object' ? chat.data.chat.productId as Product : undefined;
  const activeOrderItems = chat.data.chat.orderEligibility?.filter(item => item.isActive) ?? [];

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconButton}>
          <Icon name="arrow-left" size={24} color={colors.ink} />
        </Pressable>
        <RemoteImage
          uri={participant.image}
          width={84}
          height={84}
          style={styles.headerAvatar}
          fallback={<Text style={styles.avatarText}>{participant.name.slice(0, 1).toUpperCase()}</Text>}
        />
        <View style={styles.headerBody}>
          <Text numberOfLines={1} style={styles.title}>{participant.name}</Text>
          <Text style={styles.status}>Active conversation</Text>
        </View>
      </View>
      {chatProduct || activeOrderItems.length ? (
        <View style={styles.contextBar}>
          {chatProduct ? (
            <View style={styles.contextBody}>
              <Text numberOfLines={1} style={styles.contextTitle}>{chatProduct.name ?? chatProduct.title}</Text>
              <Text style={styles.contextMeta}>{chat.data.chat.chatType ?? 'Product conversation'}</Text>
            </View>
          ) : null}
          {activeRole === 'seller' && chatProduct ? (
            <Pressable disabled={enableOrder.isPending} onPress={() => enableOrder.mutate(getId(chatProduct))} style={styles.contextButton}>
              <Text style={styles.contextButtonText}>Enable Start Order</Text>
            </Pressable>
          ) : null}
          {activeRole === 'buyer' && activeOrderItems.length ? (
            <Pressable onPress={() => {
              const first = activeOrderItems[0];
              const nextProductId = typeof first.productId === 'string' ? first.productId : first.productId?._id ?? chatProduct?._id;
              if (nextProductId) {
                navigation.navigate('OrderCheckout', { mode: 'trade', chatId, productId: nextProductId });
              }
            }} style={styles.contextButton}>
              <Text style={styles.contextButtonText}>Start Order</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <FlatList
        data={messages}
        keyExtractor={item => getId(item)}
        contentContainerStyle={styles.messages}
        ListEmptyComponent={<EmptyState title="No messages yet" detail="Start the conversation with this supplier." />}
        renderItem={({ item, index }) => (
          <MessageBubble item={item} previous={messages[index - 1]} currentUserId={senderId} />
        )}
      />

      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Type a message"
          placeholderTextColor={colors.muted}
          multiline
          style={styles.input}
        />
        <Pressable onPress={submit} disabled={!draft.trim() || send.isPending} style={[styles.sendButton, (!draft.trim() || send.isPending) && styles.sendButtonDisabled]}>
          <Icon name="send" size={20} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function MessageBubble({ item, previous, currentUserId }: { item: MessageItem; previous?: MessageItem; currentUserId?: string }) {
  const sender = typeof item.senderId === 'object' ? item.senderId as CurrentUser : undefined;
  const mine = Boolean(currentUserId && sender && getUserId(sender) === currentUserId);
  const createdAt = item.createdAt ? new Date(item.createdAt) : null;
  const previousDate = previous?.createdAt ? new Date(previous.createdAt) : null;
  const showDate = createdAt && (!previousDate || createdAt.toDateString() !== previousDate.toDateString());

  return (
    <>
      {showDate ? <Text style={styles.dateSeparator}>{createdAt.toLocaleDateString()}</Text> : null}
      <View style={[styles.messageRow, mine && styles.messageRowMine]}>
        {!mine ? (
          <RemoteImage
            uri={firstImage(sender?.profileImage, sender?.avatar, sender?.image)}
            width={64}
            height={64}
            style={styles.messageAvatar}
            fallback={<Text style={styles.smallAvatarText}>{(sender?.name ?? sender?.email ?? 'U').slice(0, 1).toUpperCase()}</Text>}
          />
        ) : null}
        <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
          <MessageContent item={item} mine={mine} />
          {createdAt ? <Text style={[styles.time, mine && styles.timeMine]}>{createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text> : null}
        </View>
      </View>
    </>
  );
}

function MessageContent({ item, mine }: { item: MessageItem; mine: boolean }) {
  const navigation = useNavigation<any>();
  const content = item.content ?? item.text ?? '';
  const cardPayload = item.rfqDetails ?? item.quotationDetails ?? item.orderDetails ?? item.productDetails;
  const title =
    item.messageType === 'rfq' ? 'RFQ summary' :
    item.messageType === 'quotation' ? 'Quotation' :
    item.messageType === 'order' ? 'Order update' :
    item.messageType === 'action' ? humanAction(item.actionType) :
    item.messageType === 'system' ? 'System message' :
    undefined;

  if (!title && !cardPayload) {
    return <Text style={[styles.messageText, mine && styles.messageTextMine]}>{content}</Text>;
  }

  const actionUrl = item.orderDetails && typeof item.orderDetails === 'object' ? String(item.orderDetails.actionUrl ?? '') : '';
  const productId = actionUrl.match(/productId=([^&]+)/)?.[1];
  const chatId = actionUrl.match(/chatId=([^&]+)/)?.[1];

  return (
    <View style={[styles.messageCard, mine && styles.messageCardMine]}>
      <Text style={[styles.cardTitle, mine && styles.messageTextMine]}>{title}</Text>
      {content ? <Text style={[styles.messageText, mine && styles.messageTextMine]}>{content}</Text> : null}
      {cardPayload ? <Text numberOfLines={8} style={[styles.cardMeta, mine && styles.timeMine]}>{formatValue(cardPayload)}</Text> : null}
      {item.actionType === 'start_order' && productId && chatId ? (
        <Pressable onPress={() => navigation.navigate('OrderCheckout', { mode: 'trade', chatId, productId })} style={styles.cardAction}>
          <Text style={styles.cardActionText}>Start Order</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function humanAction(value?: string) {
  return value ? value.replace(/_/g, ' ').replace(/^./, char => char.toUpperCase()) : 'Action';
}

function getUserId(user: CurrentUser) {
  return user.id ?? user._id;
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  header: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderBottomColor: colors.faint,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xxl,
  },
  iconButton: {
    alignItems: 'center',
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  headerAvatar: {
    borderRadius: radii.pill,
    height: 42,
    width: 42,
  },
  avatarText: {
    color: colors.primaryDark,
    fontWeight: '900',
  },
  headerBody: {
    flex: 1,
    marginLeft: spacing.md,
  },
  contextBar: {
    alignItems: 'center',
    backgroundColor: '#fff8f3',
    borderBottomColor: colors.faint,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  contextBody: {
    flex: 1,
  },
  contextTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '900',
  },
  contextMeta: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  contextButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  contextButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
  },
  title: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '900',
  },
  status: {
    color: colors.green,
    fontSize: 12,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  messages: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  dateSeparator: {
    alignSelf: 'center',
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  messageRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  messageRowMine: {
    justifyContent: 'flex-end',
  },
  messageAvatar: {
    borderRadius: radii.pill,
    height: 32,
    width: 32,
  },
  smallAvatarText: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '900',
  },
  bubble: {
    borderRadius: radii.md,
    maxWidth: '78%',
    padding: spacing.md,
  },
  bubbleOther: {
    backgroundColor: colors.card,
  },
  bubbleMine: {
    backgroundColor: colors.primary,
  },
  messageText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  messageTextMine: {
    color: '#fff',
  },
  time: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
    marginTop: spacing.xs,
    textAlign: 'right',
  },
  timeMine: {
    color: 'rgba(255,255,255,0.78)',
  },
  messageCard: {
    gap: spacing.xs,
  },
  messageCardMine: {},
  cardTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  cardMeta: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  cardAction: {
    alignSelf: 'flex-start',
    backgroundColor: colors.card,
    borderRadius: radii.pill,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  cardActionText: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '900',
  },
  composer: {
    alignItems: 'flex-end',
    backgroundColor: colors.card,
    borderTopColor: colors.faint,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  input: {
    backgroundColor: colors.cardMuted,
    borderRadius: radii.md,
    color: colors.ink,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    maxHeight: 110,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  sendButtonDisabled: {
    opacity: 0.45,
  },
});

export default ChatDetailsScreen;
