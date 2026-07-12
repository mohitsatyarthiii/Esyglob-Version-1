import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,  
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { pick, types as documentTypes } from '@react-native-documents/picker';
import Sound from 'react-native-nitro-sound';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  createProductEnquiry,
  createQuotation,
  enableChatOrder,
  fetchChatDetails,
  sendChatMessage,
  uploadChatAttachment,
  UploadAttachment,
  blockChatUser,
  favoriteChat,
} from '../api/marketplace';
import { Chat, CurrentUser, MessageItem, Product } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import RemoteImage from '../components/RemoteImage';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { getId } from '../utils/format';
import { firstImage, normalizeImageUrl } from '../utils/images';
import { getRealtimeSocket } from '../realtime/socket';

// ─── WhatsApp Palette ───────────────────────────────────────────────────────

const WP = {
  bg: '#E8DDD9',
  headerBg: '#075E54',
  headerText: '#FFFFFF',
  bubbleMine: '#DCF8C6',
  bubbleOther: '#FFFFFF',
  textMine: '#111B21',
  textOther: '#111B21',
  timeMine: '#667781',
  timeOther: '#667781',
  muted: '#8696A0',
  faint: '#E9EDEF',
  primary: '#25D366',
  primaryDark: '#075E54',
  rose: '#EF4444',
  dateSep: '#667781',
  dateSepBg: '#E1F3FB',
  composerBg: '#F0F2F5',
  inputBg: '#FFFFFF',
  sendBtn: '#075E54',
  contextBg: '#FFFFFF',
  cardBg: '#FFFFFF',
  attachmentBg: '#F0F2F5',
};

type SheetMode = 'actions' | 'product' | 'store' | 'rfq' | 'quotation' | 'start_order' | 'voice' | null;
type LocalMessage = MessageItem & {
  localId?: string;
  retryPayload?: string | Record<string, unknown>;
};

const buyerActions = [
  ['camera-outline', 'Camera', 'camera'],
  ['image-outline', 'Gallery', 'gallery'],
  ['file-document-outline', 'Documents', 'document'],
  ['folder-outline', 'Files', 'file'],
  ['microphone-outline', 'Voice', 'voice'],
  ['package-variant-closed', 'Product', 'product'],
  ['storefront-outline', 'Store', 'store'],
  ['clipboard-list-outline', 'RFQ', 'rfq'],
] as const;

const sellerActions = [
  ['camera-outline', 'Camera', 'camera'],
  ['image-outline', 'Gallery', 'gallery'],
  ['file-document-outline', 'Documents', 'document'],
  ['folder-outline', 'Files', 'file'],
  ['microphone-outline', 'Voice', 'voice'],
  ['package-variant-closed', 'Product', 'product'],
  ['storefront-outline', 'Store', 'store'],
  ['cash-multiple', 'Quotation', 'quotation'],
  ['rocket-launch-outline', 'Order', 'start_order'],
] as const;

// ─── Safe Helper Functions ────────────────────────────────────────────────

function getUserId(user: CurrentUser | null | undefined): string | undefined {
  if (!user) return undefined;
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
    image: firstImage(other?.profileImage, other?.avatarUrl, other?.avatar, other?.image),
  };
}

// ─── Main Component ─────────────────────────────────────────────────────────

function ChatDetailsScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { activeRole, user } = useAuth();
  const { chatId, title } = route.params as { chatId: string; title?: string };
  
  // ─── State ──────────────────────────────────────────────────────────────
  
  const [draft, setDraft] = useState('');
  const [sheetMode, setSheetMode] = useState<SheetMode>(null);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState('100');
  const [targetPrice, setTargetPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [uploadLabel, setUploadLabel] = useState('');
  const [recordingUri, setRecordingUri] = useState('');
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'paused' | 'preview'>('idle');
  const [recordTime, setRecordTime] = useState('00:00');
  const [olderMessages, setOlderMessages] = useState<MessageItem[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [localMessages, setLocalMessages] = useState<LocalMessage[]>([]);
  const [profileActionsOpen, setProfileActionsOpen] = useState(false);
  const [participantTyping, setParticipantTyping] = useState(false);
  const [participantOnline, setParticipantOnline] = useState(false);

  // ─── Queries ─────────────────────────────────────────────────────────────

  const chat = useQuery({
    queryKey: ['chat-details', chatId],
    queryFn: () => fetchChatDetails(chatId),
    enabled: Boolean(chatId),
    refetchInterval: 5000,
  });

  // ─── Safe Sender ID ────────────────────────────────────────────────────

  const senderId = useMemo(() => getUserId(user), [user]);

  // ─── Safe Participant ──────────────────────────────────────────────────

  const participant = useMemo(() => {
    const item = chat.data?.chat;
    if (!item) {
      return { name: title ?? 'Chat', image: undefined as string | undefined };
    }
    if (item?.chatType === 'group') {
      return { name: item.groupName ?? title ?? 'Group', image: undefined as string | undefined };
    }
    const buyer = typeof item?.buyerId === 'object' ? (item.buyerId as CurrentUser) : undefined;
    const seller = typeof item?.sellerId === 'object' ? (item.sellerId as CurrentUser) : undefined;
    const other =
      senderId && buyer && getUserId(buyer) === senderId
        ? seller
        : senderId && seller && getUserId(seller) === senderId
        ? buyer
        : seller ?? buyer;

    return {
      name: other?.name ?? other?.fullName ?? other?.email ?? title ?? 'Chat',
      image: firstImage(other?.profileImage, other?.avatar, other?.image) as string | undefined,
    };
  }, [chat.data?.chat, senderId, title]);

  // ─── Safe Participant ID ───────────────────────────────────────────────

  const participantId = useMemo(() => {
    const item = chat.data?.chat;
    if (!item) return undefined;
    const buyerId = typeof item?.buyerId === 'string' 
      ? item.buyerId 
      : getUserId(item?.buyerId as CurrentUser);
    const sellerId = typeof item?.sellerId === 'string' 
      ? item.sellerId 
      : getUserId(item?.sellerId as CurrentUser);
    if (!buyerId || !sellerId) return undefined;
    return buyerId === senderId ? sellerId : buyerId;
  }, [chat.data?.chat, senderId]);

  // ─── Socket Effects ────────────────────────────────────────────────────

  // Main Socket Effect
  useEffect(() => {
    if (!chatId || !participantId || !senderId) {
      console.warn('⚠️ Chat not ready for socket connection');
      return undefined;
    }
    
    try {
      const socket = getRealtimeSocket();
      if (!socket) {
        console.warn('⚠️ Socket not available');
        return undefined;
      }
      
      const join = () => {
        try {
          socket.emit('join_chat', { chatId });
          socket.emit('mark_read', { chatId });
        } catch (e) {
          console.warn('Failed to join chat:', e);
        }
      };
      
      const onMessage = (message: MessageItem) => {
        if (String(message.chatId ?? '') === String(chatId)) {
          queryClient.invalidateQueries({ queryKey: ['chat-details', chatId] });
        }
      };
      
      const onTyping = (event: { chatId?: string; userId?: string; typing?: boolean }) => {
        if (event.chatId === chatId && event.userId !== senderId) {
          setParticipantTyping(Boolean(event.typing));
        }
      };
      
      const onPresence = (event: { userId?: string; online?: boolean }) => {
        if (event.userId === participantId) {
          setParticipantOnline(Boolean(event.online));
        }
      };
      
      const onUpdate = (event: { chatId?: string }) => {
        if (!event.chatId || event.chatId === chatId) {
          queryClient.invalidateQueries({ queryKey: ['chat-details', chatId] });
        }
      };
      
      socket.on('connect', join);
      socket.on('new_message', onMessage);
      socket.on('typing_updated', onTyping);
      socket.on('presence_updated', onPresence);
      socket.on('messages_read', onUpdate);
      socket.on('quotation_updated', onUpdate);
      
      join();
      
      return () => {
        try {
          socket.emit('typing', { chatId, typing: false });
          socket.emit('leave_chat', { chatId });
        } catch (e) {
          // Ignore cleanup errors
        }
        socket.off('connect', join);
        socket.off('new_message', onMessage);
        socket.off('typing_updated', onTyping);
        socket.off('presence_updated', onPresence);
        socket.off('messages_read', onUpdate);
        socket.off('quotation_updated', onUpdate);
      };
    } catch (error) {
      console.error('Socket setup error:', error);
      return undefined;
    }
  }, [chatId, participantId, queryClient, senderId]);

  // Typing Effect
  useEffect(() => {
    if (!chatId) return undefined;
    
    try {
      const socket = getRealtimeSocket();
      if (!socket) return undefined;
      
      const typing = draft.trim().length > 0;
      socket.emit('typing', { chatId, typing });
      
      const timer = setTimeout(() => {
        try {
          socket.emit('typing', { chatId, typing: false });
        } catch (e) {
          // Ignore
        }
      }, 1800);
      
      return () => {
        clearTimeout(timer);
        try {
          socket.emit('typing', { chatId, typing: false });
        } catch (e) {
          // Ignore
        }
      };
    } catch (error) {
      console.warn('Typing effect error:', error);
      return undefined;
    }
  }, [chatId, draft]);

  // ─── Mutations ──────────────────────────────────────────────────────────

  const contactAction = useMutation({
    mutationFn: ({ action }: { action: 'favorite' | 'block' }) =>
      action === 'favorite' ? favoriteChat(chatId, true) : blockChatUser(chatId, true),
    onSuccess: (_result, variables) => {
      setProfileActionsOpen(false);
      Alert.alert(
        variables.action === 'block' ? 'User blocked' : 'Conversation saved', 
        variables.action === 'block' ? 'This contact can no longer message you.' : 'Added to your favorite conversations.'
      );
      queryClient.invalidateQueries({ queryKey: ['chat-details', chatId] });
    },
    onError: error => Alert.alert('Action failed', error instanceof Error ? error.message : 'Please try again.'),
  });

  const send = useMutation({
    mutationFn: (content: string | Record<string, unknown>) => sendChatMessage(chatId, content),
    onMutate: content => {
      const localId = `local-${Date.now()}`;
      const optimistic = buildOptimisticMessage(localId, content, user);
      setLocalMessages(current => [...current, optimistic]);
      return { localId, content };
    },
    onSuccess: (_message, _content, context) => {
      setDraft('');
      setSheetMode(null);
      resetForm();
      if (context?.localId) {
        setLocalMessages(current => current.filter(item => item.localId !== context.localId));
      }
      invalidateChat(queryClient, chatId);
    },
    onError: (error, _content, context) => {
      if (context?.localId) {
        setLocalMessages(current =>
          current.map(item =>
            item.localId === context.localId ? { ...item, localStatus: 'failed' } : item,
          ),
        );
      }
      Alert.alert('Failed', error instanceof Error ? error.message : 'Unable to send.');
    },
  });

  const business = useMutation({
    mutationFn: async (mode: Exclude<SheetMode, 'actions' | null>) => {
      const product =
        selectableProducts.find(item => getId(item) === selectedProductId) ?? selectableProducts[0];
      const productId = product ? getId(product) : '';

      if (
        (mode === 'rfq' || mode === 'quotation' || mode === 'start_order' || mode === 'product') &&
        !productId
      ) {
        throw new Error('Select a product first.');
      }

      if (mode === 'rfq') {
        const sellerUserId = resolveId(chat.data?.chat?.sellerId);
        if (!sellerUserId) throw new Error('Seller not found.');
        return createProductEnquiry({
          productId,
          sellerUserId,
          productName: product?.name ?? product?.title,
          quantity: Number(quantity) || 1,
          unit: product?.unit ?? 'pcs',
          targetPrice: Number(targetPrice) || undefined,
          destinationCountry: 'India',
          additionalNotes: notes || 'RFQ from chat.',
        });
      }

      if (mode === 'quotation') {
        const rfqId = resolveId(chat.data?.chat?.rfqId);
        if (!rfqId) throw new Error('RFQ required first.');
        return createQuotation({
          rfqId,
          productId,
          title: product?.name ?? product?.title ?? 'Quotation',
          suppliedQuantity: Number(quantity) || 1,
          unitPrice: Number(targetPrice) || Number(product?.price) || 0,
          currency: product?.currency ?? 'INR',
          sellerMessage: notes || 'Quotation from chat.',
        });
      }

      if (mode === 'start_order') {
        return enableChatOrder(chatId, productId);
      }

      if (mode === 'product') {
        return sendChatMessage(chatId, {
          content: `Shared: ${product?.name ?? 'Product'}`,
          messageType: 'product',
          productDetails: product,
        });
      }

      if (mode === 'store') {
        return sendChatMessage(chatId, {
          content: `Shared store: ${sellerProfileName(chat.data?.sellerProfile)}`,
          messageType: 'store',
          storeDetails: chat.data?.sellerProfile,
        });
      }

      throw new Error('Unsupported action.');
    },
    onSuccess: () => {
      setSheetMode(null);
      resetForm();
      invalidateChat(queryClient, chatId);
    },
    onError: error =>
      Alert.alert('Failed', error instanceof Error ? error.message : 'Action rejected.'),
  });

  // ─── Handlers ───────────────────────────────────────────────────────────

  const submit = () => {
    const content = draft.trim();
    if (content && !send.isPending) send.mutate(content);
  };

  const loadOlderMessages = async () => {
    const first = messages[0];
    if (!first?.createdAt || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const result = await fetchChatDetails(chatId, {
        markRead: false,
        before: first.createdAt,
        limit: 30,
      });
      setOlderMessages(current => mergeMessages(result.messages ?? [], current));
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Unable to load.');
    } finally {
      setLoadingOlder(false);
    }
  };

  const resetForm = () => {
    setSelectedProductId('');
    setQuantity('100');
    setTargetPrice('');
    setNotes('');
  };

  const openAction = (action: string) => {
    if (action === 'camera') { pickCamera(); return; }
    if (action === 'gallery') { pickGallery(); return; }
    if (action === 'document' || action === 'file') { pickDocument(); return; }
    if (action === 'voice') { setSheetMode('voice'); return; }
    setSheetMode(action as SheetMode);
  };

  // ─── File/Media Handlers ───────────────────────────────────────────────

  const uploadAndSend = async (
    file: { uri: string; name: string; type: string },
    messageType: string,
  ) => {
    try {
      setUploadLabel(`Uploading ${file.name}`);
      const attachment = await uploadChatAttachment(file);
      await send.mutateAsync({
        content: messageType === 'voice' ? 'Voice message' : `Shared ${file.name}`,
        messageType,
        attachments: [attachment],
      });
    } catch (error) {
      Alert.alert('Upload failed', error instanceof Error ? error.message : 'Unable to upload.');
    } finally {
      setUploadLabel('');
    }
  };

  const pickCamera = async () => {
    if (!(await ensureAndroidPermission(PermissionsAndroid.PERMISSIONS.CAMERA))) {
      Alert.alert('Permission', 'Camera access needed.');
      return;
    }
    const response = await launchCamera({ mediaType: 'photo', quality: 0.8, includeBase64: false });
    const asset = response.assets?.[0];
    if (response.didCancel || !asset?.uri) return;
    await uploadAndSend(
      { uri: asset.uri, name: asset.fileName ?? `camera-${Date.now()}.jpg`, type: asset.type ?? 'image/jpeg' },
      'image',
    );
  };

  const pickGallery = async () => {
    const response = await launchImageLibrary({
      mediaType: 'photo',
      quality: 0.8,
      selectionLimit: 1,
      includeBase64: false,
    });
    const asset = response.assets?.[0];
    if (response.didCancel || !asset?.uri) return;
    await uploadAndSend(
      { uri: asset.uri, name: asset.fileName ?? `gallery-${Date.now()}.jpg`, type: asset.type ?? 'image/jpeg' },
      'image',
    );
  };

  const pickDocument = async () => {
    try {
      const [file] = await pick({ allowMultiSelection: false, type: [documentTypes.allFiles] });
      if (!file?.uri) return;
      await uploadAndSend(
        { uri: file.uri, name: file.name ?? `doc-${Date.now()}`, type: file.type ?? 'application/octet-stream' },
        'file',
      );
    } catch (error) {
      const maybe = error as { code?: string };
      if (maybe.code !== 'OPERATION_CANCELED') {
        Alert.alert('Error', error instanceof Error ? error.message : 'Unable to pick file.');
      }
    }
  };

  // ─── Voice Recording ────────────────────────────────────────────────────

  const startRecording = async () => {
    try {
      if (!(await ensureAndroidPermission(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO))) {
        Alert.alert('Permission', 'Microphone access needed.');
        return;
      }
      const uri = await Sound.startRecorder(undefined, undefined, true);
      setRecordingUri(uri);
      setRecordingState('recording');
      (Sound as any).addRecordBackListener?.((event: { currentPosition?: number }) => {
        const seconds = Math.max(Math.floor((event.currentPosition ?? 0) / 1000), 0);
        setRecordTime(
          `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`,
        );
      });
    } catch (error) {
      Alert.alert('Recording failed', error instanceof Error ? error.message : 'Unable to record.');
    }
  };

  const pauseRecording = async () => { await Sound.pauseRecorder(); setRecordingState('paused'); };
  const resumeRecording = async () => { await Sound.resumeRecorder(); setRecordingState('recording'); };

  const stopRecording = async () => {
    const uri = await Sound.stopRecorder();
    (Sound as any).removeRecordBackListener?.();
    setRecordingUri(uri || recordingUri);
    setRecordingState('preview');
  };

  const cancelRecording = async () => {
    if (recordingState === 'recording' || recordingState === 'paused') await Sound.stopRecorder();
    (Sound as any).removeRecordBackListener?.();
    setRecordingUri('');
    setRecordTime('00:00');
    setRecordingState('idle');
  };

  const sendVoice = async () => {
    const uri = recordingState === 'preview' ? recordingUri : await Sound.stopRecorder();
    (Sound as any).removeRecordBackListener?.();
    await uploadAndSend({ uri, name: `voice-${Date.now()}.m4a`, type: 'audio/mp4' }, 'voice');
    setRecordingUri('');
    setRecordTime('00:00');
    setRecordingState('idle');
    setSheetMode(null);
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  if (chat.isLoading) return <LoadingState label="Loading messages" />;
  if (chat.isError || !chat.data?.chat)
    return (
      <ErrorState
        message={(chat.error as Error)?.message ?? 'Chat not found.'}
        onRetry={() => chat.refetch()}
      />
    );

  const messages = mergeMessages(olderMessages, chat.data.messages ?? [], localMessages);
  const chatProduct =
    typeof chat.data.chat.productId === 'object' ? (chat.data.chat.productId as Product) : undefined;
  const activeOrderItems = chat.data.chat.orderEligibility?.filter(item => item.isActive) ?? [];
  const selectableProducts = getSelectableProducts(chat.data, chatProduct);
  const selectedProduct =
    selectableProducts.find(item => getId(item) === selectedProductId) ?? selectableProducts[0];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="arrow-left" size={24} color={WP.headerText} />
        </Pressable>
        <Pressable onPress={() => setProfileActionsOpen(true)} style={styles.headerContact}>
          <RemoteImage 
            uri={participant.image} 
            width={80} 
            height={80} 
            style={styles.headerAvatar}
            fallback={
              <View style={styles.headerAvatarFallback}>
                <Text style={styles.headerAvatarText}>
                  {(participant.name[0] ?? '?').toUpperCase()}
                </Text>
              </View>
            } 
          />
          <View style={styles.headerBody}>
            <Text numberOfLines={1} style={styles.headerName}>{participant.name}</Text>
            <Text style={styles.headerStatus}>
              {participantTyping ? 'typing...' : participantOnline ? 'online' : 'Tap for contact actions'}
            </Text>
          </View>
          <Icon name="dots-vertical" size={22} color={WP.headerText} />
        </Pressable>
      </View>

      {/* Context Bar */}
      {chatProduct || activeOrderItems.length ? (
        <View style={styles.contextBar}>
          {chatProduct ? (
            <Pressable
              onPress={() =>
                navigation.navigate('ProductDetails', { productId: getId(chatProduct) })
              }
              style={styles.contextBody}>
              <Text numberOfLines={1} style={styles.contextTitle}>
                {chatProduct.name ?? chatProduct.title}
              </Text>
              <Text style={styles.contextMeta}>{chat.data.chat.chatType ?? 'Chat'}</Text>
            </Pressable>
          ) : null}
          {activeRole === 'buyer' && activeOrderItems.length ? (
            <Pressable
              onPress={() => {
                const first = activeOrderItems[0];
                const nextProductId =
                  typeof first.productId === 'string'
                    ? first.productId
                    : first.productId?._id ?? chatProduct?._id;
                if (nextProductId) {
                  navigation.navigate('OrderCheckout', {
                    mode: 'trade',
                    chatId,
                    productId: nextProductId,
                  });
                }
              }}
              style={styles.contextBtn}>
              <Text style={styles.contextBtnText}>Start Order</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* Messages */}
      <FlatList
        data={messages}
        keyExtractor={item => getId(item) || Math.random().toString()}
        contentContainerStyle={styles.messages}
        inverted={false}
        ListHeaderComponent={
          chat.data.pagination?.hasOlder || olderMessages.length ? (
            <Pressable
              onPress={loadOlderMessages}
              disabled={loadingOlder}
              style={styles.loadOlder}>
              <Text style={styles.loadOlderText}>
                {loadingOlder ? 'Loading...' : 'Load older messages'}
              </Text>
            </Pressable>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState title="No messages" detail="Start the conversation." />
        }
        renderItem={({ item, index }) => (
          <MessageBubble
            item={item}
            previous={messages[index - 1]}
            currentUserId={senderId}
            onRetry={(payload, localId) => {
              setLocalMessages(current =>
                current.filter(message => message.localId !== localId),
              );
              send.mutate(payload);
            }}
          />
        )}
      />

      {/* Upload Bar */}
      {uploadLabel ? (
        <View style={styles.uploadBar}>
          <Icon name="cloud-upload-outline" size={16} color={WP.primaryDark} />
          <Text style={styles.uploadText}>{uploadLabel}</Text>
        </View>
      ) : null}

      {/* Composer */}
      <View style={styles.composer}>
        <Pressable onPress={() => setSheetMode('actions')} style={styles.composerBtn}>
          <Icon name="plus" size={24} color={WP.muted} />
        </Pressable>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Message"
          placeholderTextColor={WP.muted}
          multiline
          style={styles.input}
        />
        <Pressable
          onPress={() => Alert.alert('Emoji', 'Use device emoji keyboard.')}
          style={styles.composerBtn}>
          <Icon name="emoticon-outline" size={24} color={WP.muted} />
        </Pressable>
        {draft.trim() ? (
          <Pressable
            onPress={submit}
            disabled={send.isPending}
            style={styles.sendBtn}>
            <Icon name="send" size={20} color="#fff" />
          </Pressable>
        ) : (
          <Pressable onPress={() => openAction('voice')} style={styles.composerBtn}>
            <Icon name="microphone-outline" size={24} color={WP.muted} />
          </Pressable>
        )}
      </View>

      {/* Action Sheet Modal */}
      <Modal 
        visible={profileActionsOpen} 
        transparent 
        animationType="slide" 
        onRequestClose={() => setProfileActionsOpen(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setProfileActionsOpen(false)}>
          <View style={styles.contactSheet}>
            <Text style={styles.contactSheetTitle}>{participant.name}</Text>
            {[
              ['account-outline', 'View Profile', () => chat.data?.sellerProfile?._id && navigation.navigate('SellerDetails', { sellerId: chat.data.sellerProfile._id })],
              ['clipboard-list-outline', 'Create RFQ', () => navigation.navigate('RFQCreate', { prefill: { sellerId: chat.data?.sellerProfile?._id, supplierName: participant.name, productId: chatProduct ? getId(chatProduct) : undefined } })],
              ['rocket-launch-outline', 'Start Order', () => chatProduct && navigation.navigate('OrderCheckout', { mode: 'trade', chatId, productId: getId(chatProduct) })],
              ['package-variant', 'View Product', () => chatProduct && navigation.navigate('ProductDetails', { productId: getId(chatProduct) })],
              ['heart-outline', 'Favorite', () => contactAction.mutate({ action: 'favorite' })],
              ['block-helper', 'Block User', () => contactAction.mutate({ action: 'block' })],
              ['alert-octagon-outline', 'Report', () => Linking.openURL(`mailto:support@esyglob.com?subject=${encodeURIComponent(`Report chat ${chatId}`)}`)],
              ['share-variant-outline', 'Share Contact', () => Share.share({ message: `${participant.name}${chat.data?.sellerProfile?.companyWebsite ? `\n${chat.data.sellerProfile.companyWebsite}` : ''}` })],
            ].map(([icon, label, handler]) => (
              <Pressable key={String(label)} onPress={handler as () => void} style={styles.contactSheetRow}>
                <Icon name={String(icon)} size={21} color={label === 'Block User' || label === 'Report' ? WP.rose : WP.primaryDark} />
                <Text style={styles.contactSheetText}>{String(label)}</Text>
                <Icon name="chevron-right" size={18} color={WP.muted} />
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
      
      <Modal
        transparent
        visible={Boolean(sheetMode)}
        animationType="slide"
        onRequestClose={() => setSheetMode(null)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setSheetMode(null)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          {sheetMode === 'actions' ? (
            <>
              <Text style={styles.sheetTitle}>
                {activeRole === 'seller' ? 'Seller actions' : 'Actions'}
              </Text>
              <View style={styles.actionGrid}>
                {(activeRole === 'seller' ? sellerActions : buyerActions).map(
                  ([icon, label, action]) => (
                    <Pressable
                      key={label}
                      onPress={() => openAction(action)}
                      style={styles.actionItem}>
                      <View style={styles.actionIcon}>
                        <Icon name={icon} size={22} color={WP.primaryDark} />
                      </View>
                      <Text style={styles.actionLabel}>{label}</Text>
                    </Pressable>
                  ),
                )}
              </View>
            </>
          ) : sheetMode === 'voice' ? (
            <VoicePanel
              recordingState={recordingState}
              recordTime={recordTime}
              recordingUri={recordingUri}
              onStart={startRecording}
              onPause={pauseRecording}
              onResume={resumeRecording}
              onStop={stopRecording}
              onCancel={cancelRecording}
              onSend={sendVoice}
            />
          ) : (
            <BusinessPanel
              mode={sheetMode}
              products={selectableProducts}
              selectedProductId={
                selectedProductId || (selectedProduct ? getId(selectedProduct) : '')
              }
              onSelectProduct={setSelectedProductId}
              quantity={quantity}
              setQuantity={setQuantity}
              targetPrice={targetPrice}
              setTargetPrice={setTargetPrice}
              notes={notes}
              setNotes={setNotes}
              sellerProfile={chat.data.sellerProfile}
              pending={business.isPending}
              onSubmit={() =>
                sheetMode && business.mutate(sheetMode as Exclude<SheetMode, 'actions' | null>)
              }
            />
          )}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ─── Business Panel ─────────────────────────────────────────────────────────

function BusinessPanel(props: {
  mode: SheetMode;
  products: Product[];
  selectedProductId: string;
  onSelectProduct: (id: string) => void;
  quantity: string;
  setQuantity: (v: string) => void;
  targetPrice: string;
  setTargetPrice: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  sellerProfile?: Record<string, unknown>;
  pending: boolean;
  onSubmit: () => void;
}) {
  const title =
    props.mode === 'rfq'
      ? 'Send RFQ'
      : props.mode === 'quotation'
      ? 'Send Quotation'
      : props.mode === 'start_order'
      ? 'Enable Order'
      : props.mode === 'store'
      ? 'Share Store'
      : 'Share Product';
  const needsProduct = props.mode !== 'store';

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <Text style={styles.sheetTitle}>{title}</Text>
      {props.mode === 'store' ? (
        <View style={styles.storePreview}>
          <Icon name="storefront-outline" size={28} color={WP.primaryDark} />
          <View style={styles.storeBody}>
            <Text style={styles.storeName}>{sellerProfileName(props.sellerProfile)}</Text>
            <Text style={styles.storeMeta}>
              {String(props.sellerProfile?.country ?? props.sellerProfile?.businessType ?? 'Store')}
            </Text>
          </View>
        </View>
      ) : null}
      {needsProduct ? (
        <>
          <Text style={styles.fieldLabel}>Select product</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.productPicker}>
            {props.products.map(product => {
              const id = getId(product);
              const active = props.selectedProductId === id;
              return (
                <Pressable
                  key={id}
                  onPress={() => props.onSelectProduct(id)}
                  style={[styles.productPick, active && styles.productPickActive]}>
                  <RemoteImage
                    uri={firstImage(product.image, product.images)}
                    width={100}
                    height={100}
                    style={styles.productPickImg}
                    fallback={<Icon name="package-variant" size={20} color={WP.muted} />}
                  />
                  <Text numberOfLines={2} style={styles.productPickName}>
                    {product.name ?? product.title ?? 'Product'}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      ) : null}
      {props.mode === 'rfq' || props.mode === 'quotation' ? (
        <>
          <View style={styles.formRow}>
            <View style={styles.formField}>
              <Text style={styles.fieldLabel}>Quantity</Text>
              <TextInput
                value={props.quantity}
                onChangeText={props.setQuantity}
                keyboardType="numeric"
                placeholder="100"
                placeholderTextColor={WP.muted}
                style={styles.sheetInput}
              />
            </View>
            <View style={styles.formField}>
              <Text style={styles.fieldLabel}>
                {props.mode === 'rfq' ? 'Target price' : 'Unit price'}
              </Text>
              <TextInput
                value={props.targetPrice}
                onChangeText={props.setTargetPrice}
                keyboardType="numeric"
                placeholder="Price"
                placeholderTextColor={WP.muted}
                style={styles.sheetInput}
              />
            </View>
          </View>
          <Text style={styles.fieldLabel}>Message</Text>
          <TextInput
            value={props.notes}
            onChangeText={props.setNotes}
            multiline
            placeholder="Add notes..."
            placeholderTextColor={WP.muted}
            style={[styles.sheetInput, styles.notesInput]}
          />
        </>
      ) : null}
      <Pressable
        disabled={props.pending || (needsProduct && !props.selectedProductId)}
        onPress={props.onSubmit}
        style={[
          styles.sheetSubmit,
          (props.pending || (needsProduct && !props.selectedProductId)) &&
            styles.sheetSubmitDisabled,
        ]}>
        <Text style={styles.sheetSubmitText}>{props.pending ? 'Sending...' : title}</Text>
      </Pressable>
    </ScrollView>
  );
}

// ─── Voice Panel ────────────────────────────────────────────────────────────

function VoicePanel(props: {
  recordingState: string;
  recordTime: string;
  recordingUri: string;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onCancel: () => void;
  onSend: () => void;
}) {
  const active = props.recordingState === 'recording';
  const paused = props.recordingState === 'paused';
  const preview = props.recordingState === 'preview';

  return (
    <View>
      <Text style={styles.sheetTitle}>Voice message</Text>
      <View style={styles.voicePreview}>
        <Icon
          name={active ? 'record-circle-outline' : 'waveform'}
          size={32}
          color={active ? WP.rose : WP.primaryDark}
        />
        <View style={styles.voiceWave}>
          {Array.from({ length: 18 }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.waveBar,
                { height: 10 + (i % 5) * 5 },
                active && styles.waveBarActive,
              ]}
            />
          ))}
        </View>
        <Text style={styles.voiceTime}>{props.recordTime}</Text>
      </View>
      <View style={styles.voiceControls}>
        {props.recordingState === 'idle' ? (
          <Pressable onPress={props.onStart} style={styles.voicePrimary}>
            <Icon name="microphone" size={20} color="#fff" />
            <Text style={styles.voicePrimaryText}>Record</Text>
          </Pressable>
        ) : null}
        {active ? <IconBtn icon="pause" label="Pause" onPress={props.onPause} /> : null}
        {paused ? <IconBtn icon="play" label="Resume" onPress={props.onResume} /> : null}
        {active || paused ? <IconBtn icon="stop" label="Stop" onPress={props.onStop} /> : null}
        {preview ? (
          <IconBtn
            icon="play-circle-outline"
            label="Play"
            onPress={() => Sound.startPlayer(props.recordingUri)}
          />
        ) : null}
        {props.recordingState !== 'idle' ? (
          <IconBtn icon="close" label="Cancel" onPress={props.onCancel} />
        ) : null}
        {preview ? (
          <Pressable onPress={props.onSend} style={styles.voicePrimary}>
            <Icon name="send" size={18} color="#fff" />
            <Text style={styles.voicePrimaryText}>Send</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function IconBtn({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.voiceBtn}>
      <Icon name={icon} size={18} color={WP.textOther} />
      <Text style={styles.voiceBtnText}>{label}</Text>
    </Pressable>
  );
}

// ─── Message Bubble ─────────────────────────────────────────────────────────

function MessageBubble({
  item,
  previous,
  currentUserId,
  onRetry,
}: {
  item: LocalMessage;
  previous?: MessageItem;
  currentUserId?: string;
  onRetry?: (payload: string | Record<string, unknown>, localId: string) => void;
}) {
  const sender = typeof item.senderId === 'object' ? (item.senderId as CurrentUser) : undefined;
  const mine = Boolean(currentUserId && sender && getUserId(sender) === currentUserId);
  const createdAt = item.createdAt ? new Date(item.createdAt) : null;
  const previousDate = previous?.createdAt ? new Date(previous.createdAt) : null;
  const showDate =
    createdAt &&
    (!previousDate || createdAt.toDateString() !== previousDate.toDateString());

  return (
    <>
      {showDate ? (
        <View style={styles.dateWrap}>
          <Text style={styles.dateSep}>
            {createdAt.toLocaleDateString([], {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
          </Text>
        </View>
      ) : null}
      <View style={[styles.msgRow, mine && styles.msgRowMine]}>
        <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
          <MessageContent item={item} mine={mine} />
          <View style={styles.bubbleFooter}>
            {item.localStatus === 'failed' ? (
              <Pressable
                onPress={() =>
                  item.retryPayload && item.localId && onRetry?.(item.retryPayload, item.localId)
                }
                style={styles.retryBtn}>
                <Icon name="alert-circle-outline" size={12} color={WP.rose} />
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            ) : null}
            <Text style={[styles.time, mine ? styles.timeMine : styles.timeOther]}>
              {item.localStatus === 'sending'
                ? 'Sending...'
                : createdAt
                ? createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : ''}
            </Text>
            {mine && item.localStatus !== 'failed' ? (
              <Icon
                name={
                  item.localStatus === 'sending'
                    ? 'clock-outline'
                    : 'check-all'
                }
                size={14}
                color={WP.timeMine}
              />
            ) : null}
          </View>
        </View>
      </View>
    </>
  );
}

// ─── Message Content ────────────────────────────────────────────────────────

function MessageContent({
  item,
  mine,
}: {
  item: MessageItem;
  mine: boolean;
}) {
  const navigation = useNavigation<any>();
  const content = item.content ?? item.text ?? '';
  const storeDetails = (item as any).storeDetails as Record<string, unknown> | undefined;
  const attachments = Array.isArray(item.attachments) ? (item.attachments as unknown[]) : [];

  if (item.productDetails) {
    const product = item.productDetails as Product;
    return (
      <BusinessCard
        title={product.name ?? product.title ?? 'Product'}
        subtitle={content || 'Shared product'}
        icon="package-variant-closed"
        image={firstImage(product.image, product.images)}
        onPress={() => navigation.navigate('ProductDetails', { productId: getId(product) })}
      />
    );
  }

  if (item.rfqDetails) {
    const rfq = item.rfqDetails as Record<string, unknown>;
    return (
      <BusinessCard
        title={String(rfq.title ?? rfq.productName ?? 'RFQ')}
        subtitle={`Qty ${String(rfq.quantity ?? '-')}`}
        icon="clipboard-list-outline"
        onPress={() => navigation.navigate('RFQDetails', { rfqId: getId(rfq) })}
      />
    );
  }

  if (item.quotationDetails) {
    const q = item.quotationDetails as Record<string, unknown>;
    return (
      <BusinessCard
        title={String(q.title ?? 'Quotation')}
        subtitle={`${q.currency ?? ''} ${q.totalPrice ?? q.unitPrice ?? ''}`}
        icon="cash-multiple"
        onPress={() => navigation.navigate('QuotationDetails', { quotationId: getId(q) })}
      />
    );
  }

  if (item.orderDetails) {
    const order = item.orderDetails as Record<string, unknown>;
    return (
      <BusinessCard
        title={String(order.orderNumber ?? 'Order')}
        subtitle={String(order.status ?? '')}
        icon="rocket-launch-outline"
        actionLabel="View Order"
        onPress={() => navigation.navigate('OrderDetails', { orderId: getId(order) })}
      />
    );
  }

  if (storeDetails) {
    return (
      <BusinessCard
        title={sellerProfileName(storeDetails)}
        subtitle="Shared store"
        icon="storefront-outline"
        onPress={() =>
          navigation.navigate('SellerDetails', { sellerId: getId(storeDetails) })
        }
      />
    );
  }

  if (attachments.length) {
    return (
      <View style={styles.attachStack}>
        {content ? (
          <Text style={[styles.msgText, mine && styles.msgTextMine]}>{content}</Text>
        ) : null}
        {attachments.map((att, i) => (
          <AttachmentCard key={i} attachment={att} mine={mine} />
        ))}
      </View>
    );
  }

  return <Text style={[styles.msgText, mine && styles.msgTextMine]}>{content}</Text>;
}

// ─── Attachment Card ────────────────────────────────────────────────────────

function AttachmentCard({ attachment, mine }: { attachment: unknown; mine: boolean }) {
  const item =
    typeof attachment === 'string'
      ? { url: attachment, name: attachment.split('/').pop() }
      : (attachment as UploadAttachment);
  const mime = item.mimeType ?? '';
  const image = mime.startsWith('image/');
  const voice = mime.startsWith('audio/');
  const title = item.name ?? (voice ? 'Voice message' : 'Attachment');
  const url = normalizeImageUrl(item.url) ?? item.url;

  return (
    <Pressable
      onPress={() => url && (voice ? Sound.startPlayer(url) : Linking.openURL(url))}
      style={[styles.attachCard, mine && styles.attachCardMine]}>
      {image ? (
        <RemoteImage
          uri={url}
          width={200}
          height={200}
          style={styles.attachImg}
          fallback={<Icon name="image-outline" size={24} color={WP.muted} />}
        />
      ) : (
        <View style={styles.attachRow}>
          <Icon
            name={voice ? 'play-circle-outline' : 'file-download-outline'}
            size={24}
            color={mine ? WP.textOther : WP.primaryDark}
          />
          <View style={styles.attachBody}>
            <Text numberOfLines={1} style={[styles.attachTitle, mine && styles.msgTextMine]}>
              {title}
            </Text>
            <Text style={[styles.attachMeta, mine && styles.timeMine]}>
              {voice ? 'Tap to play' : 'Tap to download'}
            </Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}

// ─── Business Card ──────────────────────────────────────────────────────────

function BusinessCard({
  title,
  subtitle,
  icon,
  image,
  actionLabel,
  onPress,
}: {
  title: string;
  subtitle?: string;
  icon: string;
  image?: string | null;
  actionLabel?: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.bizCard}>
      <View style={styles.bizHeader}>
        <RemoteImage
          uri={image}
          width={60}
          height={60}
          style={styles.bizThumb}
          fallback={<Icon name={icon} size={22} color={WP.primaryDark} />}
        />
        <View style={styles.bizBody}>
          <Text numberOfLines={2} style={styles.bizTitle}>
            {title}
          </Text>
          {subtitle ? (
            <Text numberOfLines={2} style={styles.bizMeta}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.bizAction}>
        <Text style={styles.bizActionText}>{actionLabel ?? 'Open'}</Text>
      </View>
    </Pressable>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getSelectableProducts(
  data: { chat?: Chat; sellerProducts?: Product[]; rfqProducts?: Product[] },
  chatProduct?: Product,
) {
  const products = [
    chatProduct,
    ...(data.sellerProducts ?? []),
    ...(data.rfqProducts ?? []),
  ].filter(Boolean) as Product[];
  const seen = new Set<string>();
  return products.filter(product => {
    const id = getId(product);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function buildOptimisticMessage(
  localId: string,
  payload: string | Record<string, unknown>,
  user?: CurrentUser | null,
): LocalMessage {
  const record = typeof payload === 'string' ? { content: payload } : payload;
  return {
    id: localId,
    localId,
    senderId: user ?? undefined,
    content: typeof record.content === 'string' ? record.content : '',
    messageType: typeof record.messageType === 'string' ? record.messageType : 'text',
    attachments: Array.isArray(record.attachments) ? (record.attachments as string[]) : undefined,
    productDetails: record.productDetails as Product | undefined,
    orderDetails: record.orderDetails as Record<string, unknown> | undefined,
    rfqDetails: record.rfqDetails as Record<string, unknown> | undefined,
    quotationDetails: record.quotationDetails as Record<string, unknown> | undefined,
    createdAt: new Date().toISOString(),
    localStatus: 'sending',
    retryPayload: payload,
  };
}

function mergeMessages(...groups: MessageItem[][]) {
  const seen = new Set<string>();
  return groups
    .flat()
    .filter(message => {
      const id = getId(message);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .sort(
      (a, b) =>
        new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime(),
    );
}

function resolveId(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  return getId(value as Record<string, unknown>);
}

function sellerProfileName(profile?: Record<string, unknown>) {
  return String(
    profile?.companyName ?? profile?.businessName ?? profile?.displayName ?? 'Store',
  );
}

function invalidateChat(queryClient: ReturnType<typeof useQueryClient>, chatId: string) {
  queryClient.invalidateQueries({ queryKey: ['chat-details', chatId] });
  queryClient.invalidateQueries({ queryKey: ['chats'] });
}

async function ensureAndroidPermission(permission: Parameters<typeof PermissionsAndroid.check>[0]) {
  if (Platform.OS !== 'android') return true;
  const granted = await PermissionsAndroid.check(permission);
  if (granted) return true;
  const result = await PermissionsAndroid.request(permission);
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: WP.bg },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: WP.headerBg,
    paddingTop: 48,
    paddingBottom: 10,
    paddingHorizontal: 12,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerAvatar: { width: 40, height: 40, borderRadius: 20 },
  headerAvatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  headerBody: { flex: 1 },
  headerContact: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  contactSheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: WP.cardBg, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 28 },
  contactSheetTitle: { fontSize: 18, fontWeight: '700', color: WP.textOther, marginBottom: 10 },
  contactSheetRow: { height: 48, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: WP.faint },
  contactSheetText: { flex: 1, fontSize: 14, fontWeight: '600', color: WP.textOther },
  headerName: { fontSize: 17, fontWeight: '600', color: WP.headerText },
  headerStatus: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 1 },

  // Context
  contextBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: WP.contextBg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: WP.faint,
    gap: 10,
  },
  contextBody: { flex: 1 },
  contextTitle: { fontSize: 13, fontWeight: '600', color: WP.textOther },
  contextMeta: { fontSize: 11, color: WP.muted, marginTop: 1 },
  contextBtn: {
    backgroundColor: WP.primary,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  contextBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  // Messages
  messages: { padding: 12, paddingBottom: 20, flexGrow: 1 },
  loadOlder: { alignSelf: 'center', paddingVertical: 10 },
  loadOlderText: { fontSize: 12, color: WP.muted, fontWeight: '500' },

  // Date separator
  dateWrap: { alignItems: 'center', marginVertical: 8 },
  dateSep: {
    fontSize: 11,
    fontWeight: '500',
    color: WP.dateSep,
    backgroundColor: WP.dateSepBg,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: 'hidden',
  },

  // Message row
  msgRow: { flexDirection: 'row', marginBottom: 4, paddingHorizontal: 4 },
  msgRowMine: { justifyContent: 'flex-end' },

  // Bubble
  bubble: {
    maxWidth: '80%',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  bubbleMine: {
    backgroundColor: WP.bubbleMine,
    borderTopRightRadius: 2,
  },
  bubbleOther: {
    backgroundColor: WP.bubbleOther,
    borderTopLeftRadius: 2,
  },
  bubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 3,
    marginTop: 2,
  },

  // Text
  msgText: { fontSize: 14, lineHeight: 20, color: WP.textOther },
  msgTextMine: { color: WP.textMine },
  time: { fontSize: 10, fontWeight: '500' },
  timeMine: { color: WP.timeMine },
  timeOther: { color: WP.timeOther },

  // Retry
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  retryText: { fontSize: 10, color: WP.rose, fontWeight: '600' },

  // Attachments
  attachStack: { gap: 6 },
  attachCard: { backgroundColor: WP.attachmentBg, borderRadius: 6, overflow: 'hidden' },
  attachCardMine: { backgroundColor: 'rgba(0,0,0,0.05)' },
  attachImg: { width: 200, height: 150, borderRadius: 6, backgroundColor: WP.faint },
  attachRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, minWidth: 180 },
  attachBody: { flex: 1 },
  attachTitle: { fontSize: 12, fontWeight: '600', color: WP.textOther },
  attachMeta: { fontSize: 10, color: WP.muted, marginTop: 2 },

  // Business cards
  bizCard: { minWidth: 200, gap: 8 },
  bizHeader: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  bizThumb: { width: 40, height: 40, borderRadius: 6, backgroundColor: WP.faint },
  bizBody: { flex: 1 },
  bizTitle: { fontSize: 13, fontWeight: '600', color: WP.textOther },
  bizMeta: { fontSize: 11, color: WP.muted, marginTop: 2 },
  bizAction: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  bizActionText: { fontSize: 11, fontWeight: '600', color: WP.primaryDark },

  // Composer
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: WP.composerBg,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: WP.faint,
  },
  composerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: WP.inputBg,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    color: WP.textOther,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: WP.sendBtn,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Upload bar
  uploadBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: WP.contextBg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: WP.faint,
  },
  uploadText: { fontSize: 12, color: WP.primaryDark, fontWeight: '500', flex: 1 },

  // Sheet
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 34,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '75%',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: WP.faint,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: WP.textOther, marginBottom: 16 },

  // Actions grid
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 },
  actionItem: { width: '25%', alignItems: 'center', gap: 6 },
  actionIcon: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: WP.attachmentBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { fontSize: 10, fontWeight: '600', color: WP.textOther, textAlign: 'center' },

  // Forms
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: WP.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
    marginTop: 10,
  },
  productPicker: { gap: 8, paddingBottom: 12 },
  productPick: {
    width: 110,
    backgroundColor: WP.attachmentBg,
    borderRadius: 8,
    padding: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  productPickActive: { borderColor: WP.primary },
  productPickImg: {
    width: '100%',
    height: 60,
    borderRadius: 4,
    backgroundColor: WP.faint,
  },
  productPickName: { fontSize: 11, fontWeight: '600', color: WP.textOther, marginTop: 4 },
  formRow: { flexDirection: 'row', gap: 10 },
  formField: { flex: 1 },
  sheetInput: {
    backgroundColor: WP.attachmentBg,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 42,
    fontSize: 14,
    color: WP.textOther,
  },
  notesInput: { minHeight: 70, paddingTop: 10, textAlignVertical: 'top' },
  sheetSubmit: {
    backgroundColor: WP.primary,
    borderRadius: 20,
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 16,
  },
  sheetSubmitDisabled: { opacity: 0.45 },
  sheetSubmitText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  // Store
  storePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: WP.attachmentBg,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  storeBody: { flex: 1 },
  storeName: { fontSize: 15, fontWeight: '600', color: WP.textOther },
  storeMeta: { fontSize: 12, color: WP.muted, marginTop: 2 },

  // Voice
  voicePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: WP.attachmentBg,
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
  },
  voiceWave: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2, height: 36 },
  waveBar: { width: 3, borderRadius: 2, backgroundColor: WP.faint },
  waveBarActive: { backgroundColor: WP.rose },
  voiceTime: { fontSize: 14, fontWeight: '600', color: WP.textOther, minWidth: 48, textAlign: 'right' },
  voiceControls: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  voicePrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: WP.primary,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  voicePrimaryText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  voiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: WP.attachmentBg,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  voiceBtnText: { fontSize: 12, fontWeight: '600', color: WP.textOther },
});

export default ChatDetailsScreen;