import React, { useMemo, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Linking, Modal, PermissionsAndroid, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { pick, types as documentTypes } from '@react-native-documents/picker';
import Sound from 'react-native-nitro-sound';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { createProductEnquiry, createQuotation, enableChatOrder, fetchChatDetails, sendChatMessage, uploadChatAttachment, UploadAttachment } from '../api/marketplace';
import { Chat, CurrentUser, MessageItem, Product } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import RemoteImage from '../components/RemoteImage';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { colors, radii, shadow, spacing } from '../theme';
import { getId } from '../utils/format';
import { firstImage, normalizeImageUrl } from '../utils/images';

type SheetMode = 'actions' | 'product' | 'store' | 'rfq' | 'quotation' | 'start_order' | 'voice' | null;

const buyerActions = [
  ['camera-outline', 'Camera', 'camera'],
  ['image-outline', 'Gallery', 'gallery'],
  ['file-document-outline', 'Documents', 'document'],
  ['folder-outline', 'Files', 'file'],
  ['microphone-outline', 'Voice Message', 'voice'],
  ['package-variant-closed', 'Share Product', 'product'],
  ['storefront-outline', 'Share Store', 'store'],
  ['clipboard-list-outline', 'Send RFQ', 'rfq'],
] as const;

const sellerActions = [
  ['camera-outline', 'Camera', 'camera'],
  ['image-outline', 'Gallery', 'gallery'],
  ['file-document-outline', 'Documents', 'document'],
  ['folder-outline', 'Files', 'file'],
  ['microphone-outline', 'Voice Message', 'voice'],
  ['package-variant-closed', 'Share Product', 'product'],
  ['storefront-outline', 'Share Store', 'store'],
  ['cash-multiple', 'Send Quotation', 'quotation'],
  ['rocket-launch-outline', 'Enable Start Order', 'start_order'],
] as const;

function ChatDetailsScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { activeRole, user } = useAuth();
  const { chatId, title } = route.params as { chatId: string; title?: string };
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
    mutationFn: (content: string | Record<string, unknown>) => sendChatMessage(chatId, content),
    onSuccess: () => {
      setDraft('');
      setSheetMode(null);
      resetForm();
      invalidateChat(queryClient, chatId);
    },
    onError: error => Alert.alert('Message failed', error instanceof Error ? error.message : 'Unable to send message.'),
  });
  const business = useMutation({
    mutationFn: async (mode: Exclude<SheetMode, 'actions' | null>) => {
      const product = selectableProducts.find(item => getId(item) === selectedProductId) ?? selectableProducts[0];
      const productId = product ? getId(product) : '';

      if ((mode === 'rfq' || mode === 'quotation' || mode === 'start_order' || mode === 'product') && !productId) {
        throw new Error('Select a product first.');
      }

      if (mode === 'rfq') {
        const sellerUserId = resolveId(chat.data?.chat?.sellerId);
        if (!sellerUserId) {
          throw new Error('Seller was not returned for this conversation.');
        }

        return createProductEnquiry({
          productId,
          sellerUserId,
          productName: product?.name ?? product?.title,
          quantity: Number(quantity) || 1,
          unit: product?.unit ?? 'pcs',
          targetPrice: Number(targetPrice) || undefined,
          destinationCountry: 'India',
          additionalNotes: notes || 'RFQ sent from mobile chat.',
        });
      }

      if (mode === 'quotation') {
        const rfqId = resolveId(chat.data?.chat?.rfqId);
        if (!rfqId) {
          throw new Error('This conversation needs an RFQ before a quotation can be sent.');
        }

        return createQuotation({
          rfqId,
          productId,
          title: product?.name ?? product?.title ?? 'Quotation',
          suppliedQuantity: Number(quantity) || 1,
          unitPrice: Number(targetPrice) || Number(product?.price) || 0,
          currency: product?.currency ?? 'INR',
          sellerMessage: notes || 'Quotation sent from mobile chat.',
        });
      }

      if (mode === 'start_order') {
        return enableChatOrder(chatId, productId);
      }

      if (mode === 'product') {
        return sendChatMessage(chatId, {
          content: `Shared product: ${product?.name ?? product?.title ?? 'Product'}`,
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

      throw new Error('Unsupported business action.');
    },
    onSuccess: () => {
      setSheetMode(null);
      resetForm();
      invalidateChat(queryClient, chatId);
    },
    onError: error => Alert.alert('Action failed', error instanceof Error ? error.message : 'Backend rejected the action.'),
  });

  const submit = () => {
    const content = draft.trim();

    if (content && !send.isPending) {
      send.mutate(content);
    }
  };

  const resetForm = () => {
    setSelectedProductId('');
    setQuantity('100');
    setTargetPrice('');
    setNotes('');
  };

  const openAction = (action: string) => {
    if (action === 'camera') {
      pickCamera();
      return;
    }

    if (action === 'gallery') {
      pickGallery();
      return;
    }

    if (action === 'document' || action === 'file') {
      pickDocument();
      return;
    }

    if (action === 'voice') {
      setSheetMode('voice');
      return;
    }

    setSheetMode(action as SheetMode);
  };

  const uploadAndSend = async (file: { uri: string; name: string; type: string }, messageType: string) => {
    try {
      setUploadLabel(`Uploading ${file.name}`);
      const attachment = await uploadChatAttachment(file);
      await send.mutateAsync({
        content: messageType === 'voice' ? 'Voice message' : `Shared ${file.name}`,
        messageType,
        attachments: [attachment],
      });
    } catch (error) {
      Alert.alert('Upload failed', error instanceof Error ? error.message : 'Unable to upload attachment.');
    } finally {
      setUploadLabel('');
    }
  };

  const pickCamera = async () => {
    if (!(await ensureAndroidPermission(PermissionsAndroid.PERMISSIONS.CAMERA))) {
      Alert.alert('Camera permission needed', 'Allow camera access to capture and send product photos.');
      return;
    }
    const response = await launchCamera({ mediaType: 'photo', quality: 0.8, includeBase64: false });
    const asset = response.assets?.[0];
    if (response.didCancel || !asset?.uri) return;
    await uploadAndSend({ uri: asset.uri, name: asset.fileName ?? `camera-${Date.now()}.jpg`, type: asset.type ?? 'image/jpeg' }, 'image');
  };

  const pickGallery = async () => {
    const response = await launchImageLibrary({ mediaType: 'photo', quality: 0.8, selectionLimit: 1, includeBase64: false });
    const asset = response.assets?.[0];
    if (response.didCancel || !asset?.uri) return;
    await uploadAndSend({ uri: asset.uri, name: asset.fileName ?? `gallery-${Date.now()}.jpg`, type: asset.type ?? 'image/jpeg' }, 'image');
  };

  const pickDocument = async () => {
    try {
      const [file] = await pick({ allowMultiSelection: false, type: [documentTypes.allFiles] });
      if (!file?.uri) return;
      await uploadAndSend({ uri: file.uri, name: file.name ?? `document-${Date.now()}`, type: file.type ?? 'application/octet-stream' }, 'file');
    } catch (error) {
      const maybe = error as { code?: string };
      if (maybe.code !== 'OPERATION_CANCELED') {
        Alert.alert('File picker failed', error instanceof Error ? error.message : 'Unable to pick file.');
      }
    }
  };

  const startRecording = async () => {
    try {
      if (!(await ensureAndroidPermission(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO))) {
        Alert.alert('Microphone permission needed', 'Allow microphone access to record voice messages.');
        return;
      }
      const uri = await Sound.startRecorder(undefined, undefined, true);
      setRecordingUri(uri);
      setRecordingState('recording');
      (Sound as any).addRecordBackListener?.((event: { currentPosition?: number }) => {
        const seconds = Math.max(Math.floor((event.currentPosition ?? 0) / 1000), 0);
        setRecordTime(`${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`);
      });
    } catch (error) {
      Alert.alert('Recording failed', error instanceof Error ? error.message : 'Unable to start voice recording.');
    }
  };

  const pauseRecording = async () => {
    await Sound.pauseRecorder();
    setRecordingState('paused');
  };

  const resumeRecording = async () => {
    await Sound.resumeRecorder();
    setRecordingState('recording');
  };

  const stopRecording = async () => {
    const uri = await Sound.stopRecorder();
    (Sound as any).removeRecordBackListener?.();
    setRecordingUri(uri || recordingUri);
    setRecordingState('preview');
  };

  const cancelRecording = async () => {
    if (recordingState === 'recording' || recordingState === 'paused') {
      await Sound.stopRecorder();
    }
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

  if (chat.isLoading) {
    return <LoadingState label="Loading messages" />;
  }

  if (chat.isError || !chat.data?.chat) {
    return <ErrorState message={(chat.error as Error)?.message ?? 'Conversation was not returned.'} onRetry={() => chat.refetch()} />;
  }

  const messages = chat.data.messages ?? [];
  const chatProduct = typeof chat.data.chat.productId === 'object' ? chat.data.chat.productId as Product : undefined;
  const activeOrderItems = chat.data.chat.orderEligibility?.filter(item => item.isActive) ?? [];
  const selectableProducts = getSelectableProducts(chat.data, chatProduct);
  const selectedProduct = selectableProducts.find(item => getId(item) === selectedProductId) ?? selectableProducts[0];

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
          <Text style={styles.status}>{activeRole === 'seller' ? 'Seller workspace' : 'Buyer workspace'}</Text>
        </View>
      </View>
      {chatProduct || activeOrderItems.length ? (
        <View style={styles.contextBar}>
          {chatProduct ? (
            <Pressable onPress={() => navigation.navigate('ProductDetails', { productId: getId(chatProduct) })} style={styles.contextBody}>
              <Text numberOfLines={1} style={styles.contextTitle}>{chatProduct.name ?? chatProduct.title}</Text>
              <Text style={styles.contextMeta}>{chat.data.chat.chatType ?? 'Product conversation'}</Text>
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
          <MessageBubble item={item} previous={messages[index - 1]} currentUserId={senderId} chatId={chatId} />
        )}
      />

      {uploadLabel ? (
        <View style={styles.uploadBar}>
          <Icon name="cloud-upload-outline" size={18} color={colors.primaryDark} />
          <Text style={styles.uploadText}>{uploadLabel}</Text>
        </View>
      ) : null}
      <View style={styles.composer}>
        <Pressable onPress={() => setSheetMode('actions')} style={styles.roundButton}>
          <Icon name="plus" size={24} color={colors.ink} />
        </Pressable>
        <Pressable onPress={() => openAction('voice')} style={styles.roundButton}>
          <Icon name="microphone-outline" size={22} color={colors.ink} />
        </Pressable>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Type a message"
          placeholderTextColor={colors.muted}
          multiline
          style={styles.input}
        />
        <Pressable onPress={() => Alert.alert('Emoji keyboard', 'Use the device keyboard emoji panel.')} style={styles.roundButton}>
          <Icon name="emoticon-outline" size={22} color={colors.ink} />
        </Pressable>
        <Pressable onPress={submit} disabled={!draft.trim() || send.isPending} style={[styles.sendButton, (!draft.trim() || send.isPending) && styles.sendButtonDisabled]}>
          <Icon name="send" size={20} color="#fff" />
        </Pressable>
      </View>

      <Modal transparent visible={Boolean(sheetMode)} animationType="slide" onRequestClose={() => setSheetMode(null)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setSheetMode(null)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          {sheetMode === 'actions' ? (
            <>
              <Text style={styles.sheetTitle}>{activeRole === 'seller' ? 'Seller actions' : 'Buyer actions'}</Text>
              <View style={styles.actionGrid}>
                {(activeRole === 'seller' ? sellerActions : buyerActions).map(([icon, label, action]) => (
                  <Pressable key={label} onPress={() => openAction(action)} style={styles.actionItem}>
                    <View style={styles.actionIcon}>
                      <Icon name={icon} size={24} color={colors.primaryDark} />
                    </View>
                    <Text style={styles.actionLabel}>{label}</Text>
                  </Pressable>
                ))}
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
              selectedProductId={selectedProductId || (selectedProduct ? getId(selectedProduct) : '')}
              onSelectProduct={setSelectedProductId}
              quantity={quantity}
              setQuantity={setQuantity}
              targetPrice={targetPrice}
              setTargetPrice={setTargetPrice}
              notes={notes}
              setNotes={setNotes}
              sellerProfile={chat.data.sellerProfile}
              pending={business.isPending}
              onSubmit={() => sheetMode && business.mutate(sheetMode as Exclude<SheetMode, 'actions' | null>)}
            />
          )}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function BusinessPanel(props: {
  mode: SheetMode;
  products: Product[];
  selectedProductId: string;
  onSelectProduct: (id: string) => void;
  quantity: string;
  setQuantity: (value: string) => void;
  targetPrice: string;
  setTargetPrice: (value: string) => void;
  notes: string;
  setNotes: (value: string) => void;
  sellerProfile?: Record<string, unknown>;
  pending: boolean;
  onSubmit: () => void;
}) {
  const title =
    props.mode === 'rfq' ? 'Send RFQ' :
    props.mode === 'quotation' ? 'Send Quotation' :
    props.mode === 'start_order' ? 'Enable Start Order' :
    props.mode === 'store' ? 'Share Store' :
    'Share Product';
  const needsProduct = props.mode !== 'store';

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <Text style={styles.sheetTitle}>{title}</Text>
      {props.mode === 'store' ? (
        <View style={styles.storePreview}>
          <Icon name="storefront-outline" size={28} color={colors.primaryDark} />
          <View style={styles.storeBody}>
            <Text style={styles.storeName}>{sellerProfileName(props.sellerProfile)}</Text>
            <Text style={styles.storeMeta}>{String(props.sellerProfile?.country ?? props.sellerProfile?.businessType ?? 'Supplier store')}</Text>
          </View>
        </View>
      ) : null}
      {needsProduct ? (
        <>
          <Text style={styles.fieldLabel}>Select product</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.productPicker}>
            {props.products.map(product => {
              const id = getId(product);
              const active = props.selectedProductId === id;
              return (
                <Pressable key={id} onPress={() => props.onSelectProduct(id)} style={[styles.productPickCard, active && styles.productPickCardActive]}>
                  <RemoteImage uri={firstImage(product.image, product.images)} width={112} height={112} style={styles.productPickImage} fallback={<Icon name="package-variant-closed" size={22} color={colors.muted} />} />
                  <Text numberOfLines={2} style={styles.productPickName}>{product.name ?? product.title ?? 'Product'}</Text>
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
              <TextInput value={props.quantity} onChangeText={props.setQuantity} keyboardType="numeric" placeholder="100" placeholderTextColor={colors.muted} style={styles.sheetInput} />
            </View>
            <View style={styles.formField}>
              <Text style={styles.fieldLabel}>{props.mode === 'rfq' ? 'Target price' : 'Unit price'}</Text>
              <TextInput value={props.targetPrice} onChangeText={props.setTargetPrice} keyboardType="numeric" placeholder="Price" placeholderTextColor={colors.muted} style={styles.sheetInput} />
            </View>
          </View>
          <Text style={styles.fieldLabel}>Message</Text>
          <TextInput value={props.notes} onChangeText={props.setNotes} multiline placeholder="Add requirements, terms, or notes" placeholderTextColor={colors.muted} style={[styles.sheetInput, styles.notesInput]} />
        </>
      ) : null}
      <Pressable disabled={props.pending || (needsProduct && !props.selectedProductId)} onPress={props.onSubmit} style={[styles.sheetSubmit, (props.pending || (needsProduct && !props.selectedProductId)) && styles.sendButtonDisabled]}>
        <Text style={styles.sheetSubmitText}>{props.pending ? 'Sending...' : title}</Text>
      </Pressable>
    </ScrollView>
  );
}

function VoicePanel(props: {
  recordingState: 'idle' | 'recording' | 'paused' | 'preview';
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
        <Icon name={active ? 'record-circle-outline' : 'waveform'} size={32} color={active ? colors.rose : colors.primaryDark} />
        <View style={styles.voiceWave}>
          {Array.from({ length: 18 }).map((_, index) => (
            <View key={index} style={[styles.waveBar, { height: 10 + (index % 5) * 5 }, active && styles.waveBarActive]} />
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
        {active ? <IconButton label="Pause" icon="pause" onPress={props.onPause} /> : null}
        {paused ? <IconButton label="Resume" icon="play" onPress={props.onResume} /> : null}
        {active || paused ? <IconButton label="Preview" icon="stop" onPress={props.onStop} /> : null}
        {preview ? <IconButton label="Play" icon="play-circle-outline" onPress={() => Sound.startPlayer(props.recordingUri)} /> : null}
        {props.recordingState !== 'idle' ? <IconButton label="Cancel" icon="close" onPress={props.onCancel} /> : null}
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

function IconButton({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.voiceButton}>
      <Icon name={icon} size={19} color={colors.ink} />
      <Text style={styles.voiceButtonText}>{label}</Text>
    </Pressable>
  );
}

function MessageBubble({ item, previous, currentUserId, chatId }: { item: MessageItem; previous?: MessageItem; currentUserId?: string; chatId: string }) {
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
          <MessageContent item={item} mine={mine} chatId={chatId} />
          {createdAt ? <Text style={[styles.time, mine && styles.timeMine]}>{createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text> : null}
        </View>
      </View>
    </>
  );
}

function MessageContent({ item, mine, chatId }: { item: MessageItem; mine: boolean; chatId: string }) {
  const navigation = useNavigation<any>();
  const content = item.content ?? item.text ?? '';
  const storeDetails = (item as MessageItem & { storeDetails?: Record<string, unknown> }).storeDetails;
  const attachments = Array.isArray(item.attachments) ? item.attachments as unknown[] : [];

  if (item.productDetails) {
    const product = item.productDetails as Product;
    return <BusinessCard title={product.name ?? product.title ?? 'Product'} subtitle={content || 'Shared product'} icon="package-variant-closed" image={firstImage(product.image, product.images)} mine={mine} onPress={() => navigation.navigate('ProductDetails', { productId: getId(product) })} />;
  }

  if (item.rfqDetails) {
    const rfq = item.rfqDetails as Record<string, unknown>;
    return <BusinessCard title={String(rfq.title ?? rfq.productName ?? 'RFQ')} subtitle={`Quantity ${String(rfq.quantity ?? '-')} ${String(rfq.unit ?? '')}`} icon="clipboard-list-outline" mine={mine} onPress={() => navigation.navigate('RFQDetails', { rfqId: getId(rfq) })} />;
  }

  if (item.quotationDetails) {
    const quotation = item.quotationDetails as Record<string, unknown>;
    return <BusinessCard title={String(quotation.title ?? 'Quotation')} subtitle={[quotation.status, quotation.totalPrice ? `${quotation.currency ?? ''} ${quotation.totalPrice}` : undefined].filter(Boolean).join(' - ')} icon="cash-multiple" mine={mine} onPress={() => navigation.navigate('QuotationDetails', { quotationId: getId(quotation) })} />;
  }

  if (item.orderDetails) {
    const order = item.orderDetails as Record<string, unknown>;
    const actionUrl = String(order.actionUrl ?? '');
    const productId = actionUrl.match(/productId=([^&]+)/)?.[1];
    const nextChatId = actionUrl.match(/chatId=([^&]+)/)?.[1] ?? chatId;
    return (
      <BusinessCard
        title={item.actionType === 'start_order' ? 'Start Order Enabled' : String(order.orderNumber ?? 'Order')}
        subtitle={content || String(order.status ?? 'Trade order')}
        icon="rocket-launch-outline"
        mine={mine}
        actionLabel={item.actionType === 'start_order' ? 'Start Order' : 'Open Order'}
        onPress={() => item.actionType === 'start_order' && productId ? navigation.navigate('OrderCheckout', { mode: 'trade', chatId: nextChatId, productId }) : navigation.navigate('OrderDetails', { orderId: getId(order) })}
      />
    );
  }

  if (storeDetails) {
    return <BusinessCard title={sellerProfileName(storeDetails)} subtitle={content || 'Shared store'} icon="storefront-outline" mine={mine} onPress={() => navigation.navigate('SellerDetails', { sellerId: getId(storeDetails) })} />;
  }

  if (attachments.length) {
    return (
      <View style={styles.attachmentStack}>
        {content ? <Text style={[styles.messageText, mine && styles.messageTextMine]}>{content}</Text> : null}
        {attachments.map((attachment, index) => <AttachmentCard key={index} attachment={attachment} mine={mine} />)}
      </View>
    );
  }

  return <Text style={[styles.messageText, mine && styles.messageTextMine]}>{content}</Text>;
}

function AttachmentCard({ attachment, mine }: { attachment: unknown; mine: boolean }) {
  const item = typeof attachment === 'string' ? { url: attachment, name: attachment.split('/').pop() } : attachment as UploadAttachment;
  const mime = item.mimeType ?? '';
  const image = mime.startsWith('image/');
  const voice = mime.startsWith('audio/');
  const title = item.name ?? (voice ? 'Voice message' : 'Attachment');
  const url = normalizeImageUrl(item.url) ?? item.url;

  return (
    <Pressable onPress={() => url && (voice ? Sound.startPlayer(url) : Linking.openURL(url))} style={[styles.attachmentCard, mine && styles.attachmentCardMine]}>
      {image ? (
        <RemoteImage uri={url} width={220} height={220} style={styles.attachmentImage} fallback={<Icon name="image-outline" size={28} color={colors.muted} />} />
      ) : (
        <View style={styles.attachmentRow}>
          <Icon name={voice ? 'play-circle-outline' : 'file-download-outline'} size={26} color={mine ? '#fff' : colors.primaryDark} />
          <View style={styles.attachmentBody}>
            <Text numberOfLines={1} style={[styles.attachmentTitle, mine && styles.messageTextMine]}>{title}</Text>
            <Text style={[styles.attachmentMeta, mine && styles.timeMine]}>{voice ? 'Tap to play' : 'Tap to download'}</Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}

function BusinessCard({ title, subtitle, icon, image, mine, actionLabel, onPress }: { title: string; subtitle?: string; icon: string; image?: string | null; mine: boolean; actionLabel?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.messageCard, mine && styles.messageCardMine]}>
      <View style={styles.cardHeader}>
        <RemoteImage uri={image} width={78} height={78} style={styles.cardThumb} fallback={<Icon name={icon} size={24} color={mine ? '#fff' : colors.primaryDark} />} />
        <View style={styles.cardBody}>
          <Text numberOfLines={2} style={[styles.cardTitle, mine && styles.messageTextMine]}>{title}</Text>
          {subtitle ? <Text numberOfLines={2} style={[styles.cardMeta, mine && styles.timeMine]}>{subtitle}</Text> : null}
        </View>
      </View>
      <View style={[styles.cardAction, mine && styles.cardActionMine]}>
        <Text style={styles.cardActionText}>{actionLabel ?? 'Open'}</Text>
      </View>
    </Pressable>
  );
}

function getSelectableProducts(data: { chat?: Chat; sellerProducts?: Product[]; rfqProducts?: Product[] }, chatProduct?: Product) {
  const products = [chatProduct, ...(data.sellerProducts ?? []), ...(data.rfqProducts ?? [])].filter(Boolean) as Product[];
  const seen = new Set<string>();
  return products.filter(product => {
    const id = getId(product);
    if (!id || seen.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  });
}

function resolveId(value: unknown) {
  if (!value) {
    return undefined;
  }

  if (typeof value === 'string') {
    return value;
  }

  return getId(value as Record<string, unknown>);
}

function sellerProfileName(profile?: Record<string, unknown>) {
  return String(profile?.companyName ?? profile?.businessName ?? profile?.displayName ?? 'Supplier store');
}

function invalidateChat(queryClient: ReturnType<typeof useQueryClient>, chatId: string) {
  queryClient.invalidateQueries({ queryKey: ['chat-details', chatId] });
  queryClient.invalidateQueries({ queryKey: ['chats'] });
}

function getUserId(user: CurrentUser) {
  return user.id ?? user._id;
}

async function ensureAndroidPermission(permission: Parameters<typeof PermissionsAndroid.check>[0]) {
  if (Platform.OS !== 'android') {
    return true;
  }

  const granted = await PermissionsAndroid.check(permission);
  if (granted) {
    return true;
  }

  const result = await PermissionsAndroid.request(permission);
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
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
  iconButton: { alignItems: 'center', height: 42, justifyContent: 'center', width: 42 },
  headerAvatar: { borderRadius: radii.pill, height: 42, width: 42 },
  avatarText: { color: colors.primaryDark, fontWeight: '900' },
  headerBody: { flex: 1, marginLeft: spacing.md },
  title: { color: colors.ink, fontSize: 17, fontWeight: '900' },
  status: { color: colors.green, fontSize: 12, fontWeight: '800', marginTop: spacing.xs },
  contextBar: {
    alignItems: 'center',
    backgroundColor: '#fff8f3',
    borderBottomColor: colors.faint,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  contextBody: { flex: 1 },
  contextTitle: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  contextMeta: { color: colors.muted, fontSize: 12, fontWeight: '800', marginTop: 2 },
  contextButton: { backgroundColor: colors.primary, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  contextButtonText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  messages: { padding: spacing.lg, paddingBottom: spacing.xxl },
  dateSeparator: { alignSelf: 'center', color: colors.muted, fontSize: 11, fontWeight: '800', marginBottom: spacing.md, marginTop: spacing.sm },
  messageRow: { alignItems: 'flex-end', flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  messageRowMine: { justifyContent: 'flex-end' },
  messageAvatar: { borderRadius: radii.pill, height: 32, width: 32 },
  smallAvatarText: { color: colors.primaryDark, fontSize: 12, fontWeight: '900' },
  bubble: { borderRadius: radii.md, maxWidth: '82%', padding: spacing.md },
  bubbleOther: { backgroundColor: colors.card },
  bubbleMine: { backgroundColor: colors.primary },
  messageText: { color: colors.ink, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  messageTextMine: { color: '#fff' },
  time: { color: colors.muted, fontSize: 10, fontWeight: '800', marginTop: spacing.xs, textAlign: 'right' },
  timeMine: { color: 'rgba(255,255,255,0.78)' },
  messageCard: { gap: spacing.sm, minWidth: 230 },
  messageCardMine: {},
  cardHeader: { flexDirection: 'row', gap: spacing.md },
  cardThumb: { backgroundColor: colors.cardMuted, borderRadius: radii.sm, height: 46, width: 46 },
  cardBody: { flex: 1 },
  cardTitle: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  cardMeta: { color: colors.muted, fontSize: 12, fontWeight: '700', lineHeight: 18, marginTop: 2 },
  cardAction: { alignSelf: 'flex-start', backgroundColor: colors.cardMuted, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  cardActionMine: { backgroundColor: colors.card },
  cardActionText: { color: colors.primaryDark, fontSize: 12, fontWeight: '900' },
  composer: {
    alignItems: 'flex-end',
    backgroundColor: colors.card,
    borderTopColor: colors.faint,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  uploadBar: {
    alignItems: 'center',
    backgroundColor: '#fff8f3',
    borderTopColor: colors.faint,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  uploadText: { color: colors.primaryDark, flex: 1, fontSize: 12, fontWeight: '900' },
  roundButton: { alignItems: 'center', backgroundColor: colors.cardMuted, borderRadius: radii.pill, height: 42, justifyContent: 'center', width: 42 },
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
  sendButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.pill, height: 44, justifyContent: 'center', width: 44 },
  sendButtonDisabled: { opacity: 0.45 },
  sheetBackdrop: { backgroundColor: 'rgba(0,0,0,0.32)', flex: 1 },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    bottom: 0,
    left: 0,
    maxHeight: '78%',
    padding: spacing.lg,
    position: 'absolute',
    right: 0,
    ...shadow,
  },
  sheetHandle: { alignSelf: 'center', backgroundColor: colors.faint, borderRadius: radii.pill, height: 4, marginBottom: spacing.lg, width: 46 },
  sheetTitle: { color: colors.ink, fontSize: 20, fontWeight: '900', marginBottom: spacing.lg },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.lg },
  actionItem: { alignItems: 'center', gap: spacing.sm, width: '25%' },
  actionIcon: { alignItems: 'center', backgroundColor: '#fff4ee', borderRadius: radii.lg, height: 54, justifyContent: 'center', width: 54 },
  actionLabel: { color: colors.ink, fontSize: 11, fontWeight: '800', textAlign: 'center' },
  fieldLabel: { color: colors.muted, fontSize: 12, fontWeight: '900', marginBottom: spacing.sm, textTransform: 'uppercase' },
  productPicker: { gap: spacing.md, paddingBottom: spacing.lg },
  productPickCard: { backgroundColor: colors.cardMuted, borderColor: colors.faint, borderRadius: radii.md, borderWidth: 1, padding: spacing.sm, width: 120 },
  productPickCardActive: { borderColor: colors.primary, borderWidth: 2 },
  productPickImage: { backgroundColor: colors.card, borderRadius: radii.sm, height: 70, width: '100%' },
  productPickName: { color: colors.ink, fontSize: 12, fontWeight: '900', lineHeight: 16, marginTop: spacing.sm },
  formRow: { flexDirection: 'row', gap: spacing.md },
  formField: { flex: 1 },
  sheetInput: { backgroundColor: colors.cardMuted, borderRadius: radii.md, color: colors.ink, fontSize: 14, fontWeight: '800', minHeight: 44, paddingHorizontal: spacing.md },
  notesInput: { minHeight: 86, paddingTop: spacing.md, textAlignVertical: 'top' },
  sheetSubmit: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.pill, marginTop: spacing.lg, paddingVertical: spacing.md },
  sheetSubmitText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  storePreview: { alignItems: 'center', backgroundColor: colors.cardMuted, borderRadius: radii.md, flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg, padding: spacing.md },
  storeBody: { flex: 1 },
  storeName: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  storeMeta: { color: colors.muted, fontSize: 12, fontWeight: '800', marginTop: 2 },
  voicePreview: { alignItems: 'center', backgroundColor: colors.cardMuted, borderRadius: radii.md, flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg, padding: spacing.md },
  voiceWave: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 3, height: 42 },
  waveBar: { backgroundColor: colors.faint, borderRadius: radii.pill, width: 4 },
  waveBarActive: { backgroundColor: colors.rose },
  voiceTime: { color: colors.ink, fontSize: 15, fontWeight: '900', minWidth: 52, textAlign: 'right' },
  voiceControls: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  voicePrimary: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.pill, flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  voicePrimaryText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  voiceButton: { alignItems: 'center', backgroundColor: colors.cardMuted, borderRadius: radii.pill, flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  voiceButtonText: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  attachmentStack: { gap: spacing.sm },
  attachmentCard: { backgroundColor: colors.cardMuted, borderRadius: radii.sm, overflow: 'hidden' },
  attachmentCardMine: { backgroundColor: 'rgba(255,255,255,0.16)' },
  attachmentImage: { backgroundColor: colors.cardMuted, borderRadius: radii.sm, height: 150, width: 220 },
  attachmentRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, minWidth: 220, padding: spacing.md },
  attachmentBody: { flex: 1 },
  attachmentTitle: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  attachmentMeta: { color: colors.muted, fontSize: 11, fontWeight: '800', marginTop: 2 },
});

export default ChatDetailsScreen;
