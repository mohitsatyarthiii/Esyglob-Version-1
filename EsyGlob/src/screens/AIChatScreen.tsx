import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  PermissionsAndroid,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { pick, types as documentTypes } from '@react-native-documents/picker';
import {
  AIChat,
  AIMessage,
  deleteAIChat,
  fetchAIChat,
  fetchAIChats,
  patchAIChat,
  streamAIChat,
} from '../api/ai';
import { getActiveAIChatId, setActiveAIChatId } from '../ai/aiSession';
import { useAuth } from '../auth/AuthContext';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { colors, radii, spacing } from '../theme';
import AuthScreen from './AuthScreen';
import { uploadFiles, type UploadAttachment } from '../api/marketplace';
import RemoteImage from '../components/RemoteImage';
import CompactAIStatus from '../components/CompactAIStatus';
import { useCurrency } from '../currency/CurrencyContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = SCREEN_WIDTH * 0.82;

type PluginMode = 'create-rfq' | 'send-quotation' | 'ai-support' | null;
type LocalMessage = AIMessage & { localId?: string; streaming?: boolean };

function AIChatScreen() {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { activeRole, status } = useAuth();
  const role = activeRole === 'seller' ? 'seller' : 'buyer';
  const [search, setSearch] = useState('');
  const [chatId, setChatId] = useState<string | undefined>(() => getActiveAIChatId(role));
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState('');
  const [plugin, setPlugin] = useState<PluginMode>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [attachments, setAttachments] = useState<UploadAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [failedFiles, setFailedFiles] = useState<Array<{ uri: string; name: string; type: string }>>([]);
  const [failedMessage, setFailedMessage] = useState('');
  
  const drawerAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput>(null);
  const flatListRef = useRef<FlatList>(null);

  const chats = useQuery({
    queryKey: ['ai-chats', role],
    queryFn: () => fetchAIChats(role),
    enabled: status === 'authenticated',
  });

  const filteredChats = useMemo(
    () => (chats.data ?? []).filter(chat =>
      (chat.title ?? '').toLowerCase().includes(search.trim().toLowerCase())
    ),
    [chats.data, search],
  );

  useEffect(() => {
    if (!chatId || messages.length) return;
    fetchAIChat(chatId)
      .then(detail => setMessages(detail.messages ?? []))
      .catch(() => setActiveAIChatId(role));
  }, [chatId, messages.length, role]);

  const openDrawer = () => {
    setHistoryOpen(true);
    Animated.parallel([
      Animated.spring(drawerAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }),
      Animated.timing(overlayAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
  };

  const closeDrawer = () => {
    Animated.parallel([
      Animated.spring(drawerAnim, { toValue: -DRAWER_WIDTH, useNativeDriver: true, tension: 65, friction: 11 }),
      Animated.timing(overlayAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setHistoryOpen(false));
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => gs.dx > 15 && gs.dx > Math.abs(gs.dy * 2),
      onPanResponderMove: (_, gs) => {
        if (gs.dx > 0 && gs.dx < DRAWER_WIDTH) {
          drawerAnim.setValue(gs.dx - DRAWER_WIDTH);
          overlayAnim.setValue(gs.dx / DRAWER_WIDTH);
        }
      },
      onPanResponderRelease: (_, gs) => {
        gs.dx > DRAWER_WIDTH * 0.25 ? openDrawer() : closeDrawer();
      },
    })
  ).current;

  const send = useMutation({
    mutationFn: async (message: string) => {
      const attachmentUrls = attachments.map(file => file.secure_url ?? file.url ?? file.location).filter(Boolean);
      const userMessage: LocalMessage = {
        localId: `u-${Date.now()}`,
        role: 'user',
        content: message,
        createdAt: new Date().toISOString(),
        metadata: attachmentUrls.length ? { attachmentUrls } : undefined,
      };
      const assistantId = `a-${Date.now()}`;
      setMessages(current => [...current, userMessage, { localId: assistantId, role: 'assistant', content: '', streaming: true }]);
      setInput('');
      let nextChatId = chatId;
      let tokenBuffer = '';
      let flushTimer: ReturnType<typeof setTimeout> | null = null;
      
      const flushTokens = () => {
        const chunk = tokenBuffer;
        tokenBuffer = '';
        flushTimer = null;
        if (!chunk) return;
        setMessages(current => current.map(item =>
          item.localId === assistantId ? { ...item, content: `${item.content ?? ''}${chunk}` } : item
        ));
      };

      const messageWithFiles = attachmentUrls.length ? `${message}\n\nAttached files:\n${attachmentUrls.join('\n')}` : message;
      
      await streamAIChat({
        message: messageWithFiles,
        displayMessage: message,
        chatId,
        role,
        conversationType: plugin === 'create-rfq' ? 'rfq' : plugin === 'send-quotation' ? 'quotation' : plugin === 'ai-support' ? 'support' : 'assistant',
        context: { feature: 'AI Chatbot', sourcePath: `/mobile/${role}/ai`, attachments: attachmentUrls },
        pluginPayload: plugin ? { pluginId: plugin, attachmentUrls } : attachmentUrls.length ? { pluginId: 'file-analysis', attachmentUrls } : null,
      }, event => {
        if (event.type === 'start' && typeof event.chatId === 'string') {
          nextChatId = event.chatId;
          setChatId(event.chatId);
          setActiveAIChatId(role, event.chatId);
        }
        if (event.type === 'token') {
          tokenBuffer += String(event.content ?? '');
          if (!flushTimer) flushTimer = setTimeout(flushTokens, 40);
        }
        if (event.type === 'done') {
          if (flushTimer) clearTimeout(flushTimer);
          flushTimer = null;
          const finalChunk = tokenBuffer;
          tokenBuffer = '';
          if (typeof event.chatId === 'string') {
            nextChatId = event.chatId;
            setChatId(event.chatId);
            setActiveAIChatId(role, event.chatId);
          }
          setMessages(current => current.map(item =>
            item.localId === assistantId ? {
              ...item,
              content: `${item.content ?? ''}${finalChunk}`,
              streaming: false,
              metadata: { ...(item.metadata ?? {}), marketplace: event.marketplace, suggestedFollowUps: event.suggestedFollowUps, provider: event.provider, model: event.model },
            } : item
          ));
        }
      });
      return nextChatId;
    },
    onSuccess: () => {
      setFailedMessage('');
      setPlugin(null);
      setAttachments([]);
      queryClient.invalidateQueries({ queryKey: ['ai-chats', role] });
    },
    onError: error => {
      const latest = messages.filter(item => item.role === 'user').at(-1)?.content ?? input;
      setFailedMessage(String(latest ?? ''));
      setMessages(current => current.map(item =>
        item.streaming ? { ...item, streaming: false, content: item.content || 'AI response failed. Please retry.' } : item
      ));
      Alert.alert('AI unavailable', error instanceof Error ? error.message : 'Unable to contact AI assistant.');
    },
  });

  if (status !== 'authenticated') return <AuthScreen onClose={() => navigation.goBack()} />;

  const openChat = async (chat: AIChat) => {
    const id = chat._id ?? chat.id;
    if (!id) return;
    closeDrawer();
    setChatId(id);
    setActiveAIChatId(role, id);
    const detail = await fetchAIChat(id);
    setMessages(detail.messages ?? []);
  };

  const newChat = () => {
    closeDrawer();
    setChatId(undefined);
    setActiveAIChatId(role);
    setMessages([]);
  };

  const submit = (override?: string) => {
    const message = (override ?? input).trim();
    if ((!message && !attachments.length) || send.isPending) return;
    send.mutate(message || 'Please analyze the attached file(s).');
    inputRef.current?.clear();
  };

  const uploadSelected = async (files: Array<{ uri: string; name: string; type: string }>) => {
    if (!files.length) return;
    setUploading(true);
    setFailedFiles([]);
    try {
      const result = await uploadFiles('ai-chat', files);
      const uploaded = result.uploads ?? result.files ?? [];
      if (uploaded.length !== files.length) throw new Error('Some files were not uploaded.');
      setAttachments(current => [...current, ...uploaded]);
    } catch (error) {
      setFailedFiles(files);
      Alert.alert('Upload failed', error instanceof Error ? error.message : 'Unable to upload files.');
    } finally {
      setUploading(false);
    }
  };

  const pickImages = async () => {
    const result = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 5, quality: 0.8 });
    await uploadSelected((result.assets ?? []).filter(a => a.uri).map(a => ({
      uri: a.uri!, name: a.fileName ?? `ai-${Date.now()}.jpg`, type: a.type ?? 'image/jpeg',
    })));
  };

  const pickCamera = async () => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) return;
    }
    const result = await launchCamera({ mediaType: 'photo', quality: 0.8, includeBase64: false });
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    await uploadSelected([{ uri: asset.uri, name: asset.fileName ?? `ai-camera-${Date.now()}.jpg`, type: asset.type ?? 'image/jpeg' }]);
  };

  const pickDocuments = async () => {
    const files = await pick({ allowMultiSelection: true, type: [documentTypes.pdf, documentTypes.doc, documentTypes.docx, documentTypes.xls, documentTypes.xlsx] });
    await uploadSelected(files.map(file => ({
      uri: file.uri, name: file.name ?? `document-${Date.now()}`, type: file.type ?? 'application/octet-stream',
    })));
  };

  const archiveChat = async () => {
    if (!chatId) return;
    Alert.alert('Delete chat', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteAIChat(chatId); newChat(); queryClient.invalidateQueries({ queryKey: ['ai-chats', role] }); } },
    ]);
  };

  const renameChat = async () => {
    if (!chatId) return;
    const title = messages.find(item => item.role === 'user')?.content?.slice(0, 42) || 'EsyGlob AI chat';
    await patchAIChat({ chatId, title });
    queryClient.invalidateQueries({ queryKey: ['ai-chats', role] });
  };

  const scrollToBottom = () => setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={openDrawer} style={styles.hdrBtn}>
          <Icon name="menu" size={18} color="#1e293b" />
        </TouchableOpacity>
        <Text style={styles.hdrTitle}>Esy AI</Text>
        <TouchableOpacity onPress={newChat} style={styles.hdrBtn}>
          <Icon name="square-edit-outline" size={18} color="#1e293b" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex} keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}>
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item, index) => item._id ?? item.id ?? item.localId ?? String(index)}
          contentContainerStyle={styles.msgList}
          onContentSizeChange={scrollToBottom}
          onLayout={scrollToBottom}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>How can I help you today?</Text>
              <View style={styles.suggGrid}>
                {(role === 'seller' ? [
  'What is my supplier trust score?',
  'How to verify my business profile?',
  'Show my recent RFQ matches',
  'Update my product catalog',
  'Check my pending orders',
] : [
  'Show top verified t-shirt suppliers',
  'Create quick RFQ for 500 units',
  'Compare prices: India vs China',
  'Check shipment tracking #123',
  'List suppliers with lowest MOQ',
]).map((item, i) => (
                  <TouchableOpacity key={i} onPress={() => submit(item)} style={styles.suggCard}>
                    <Text style={styles.suggText}>{item}</Text>
                    <Icon name="arrow-up-right" size={11} color="#94a3b8" />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <Bubble
              item={item}
              onSuggested={prompt => submit(prompt)}
              onRegenerate={item.role === 'assistant' ? () => {
                const latest = messages.filter(m => m.role === 'user').at(-1)?.content;
                if (latest) submit(latest);
              } : undefined}
            />
          )}
        />

        {attachments.length > 0 && (
          <ScrollView horizontal style={styles.attScroll} showsHorizontalScrollIndicator={false}>
            {attachments.map((file, i) => (
              <View key={`${file.url}-${i}`} style={styles.attChip}>
                <Icon name={file.mimeType?.startsWith('image/') ? 'image' : 'file-document'} size={11} color="#3b82f6" />
                <Text numberOfLines={1} style={styles.attName}>{file.name ?? `File ${i + 1}`}</Text>
                <TouchableOpacity onPress={() => setAttachments(cur => cur.filter((_, j) => j !== i))}>
                  <Icon name="close" size={12} color="#94a3b8" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        {failedMessage ? (
          <View style={styles.errBar}>
            <Icon name="alert-circle" size={12} color="#ef4444" />
            <Text style={styles.errText}>Failed</Text>
            <TouchableOpacity onPress={() => submit(failedMessage)} disabled={send.isPending}>
              <Text style={styles.errRetry}>Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setFailedMessage('')}>
              <Icon name="x" size={12} color="#94a3b8" />
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.composer}>
          <TouchableOpacity onPress={() => setAttachmentMenuOpen(true)} disabled={uploading} style={styles.plusBtn}>
            <Icon name="plus" size={18} color="#64748b" />
          </TouchableOpacity>
          <TextInput
            ref={inputRef}
            value={input}
            onChangeText={setInput}
            multiline
            placeholder="Message..."
            placeholderTextColor="#94a3b8"
            style={styles.input}
            maxLength={4000}
          />
          <TouchableOpacity
            disabled={(!input.trim() && !attachments.length) || send.isPending || uploading}
            onPress={() => submit()}
            style={[styles.sendBtn, ((!input.trim() && !attachments.length) || send.isPending || uploading) && styles.sendDisabled]}
          >
            {send.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Icon name="arrow-up" size={16} color="#fff" />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Drawer Overlay */}
      {historyOpen && (
        <Animated.View style={[styles.overlay, { opacity: overlayAnim }]}>
          <TouchableOpacity style={styles.overlayTouch} onPress={closeDrawer} activeOpacity={1} />
        </Animated.View>
      )}

      {/* Drawer */}
      <Animated.View style={[styles.drawer, { transform: [{ translateX: drawerAnim }] }]}>
        <View style={styles.drawerContent}>
          <View style={styles.drawerHead}>
            <Text style={styles.drawerTitle}>Recent chats</Text>
            <TouchableOpacity onPress={closeDrawer} style={styles.drawerClose}>
              <Icon name="close" size={18} color="#64748b" />
            </TouchableOpacity>
          </View>

          <View style={styles.srchWrap}>
            <Icon name="magnify" size={14} color="#94a3b8" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search..."
              placeholderTextColor="#94a3b8"
              style={styles.srchInput}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Icon name="close-circle" size={14} color="#94a3b8" />
              </TouchableOpacity>
            )}
          </View>

          {chats.isLoading ? (
            <View style={styles.loadWrap}><ActivityIndicator size="small" color="#3b82f6" /></View>
          ) : chats.isError ? (
            <ErrorState message={(chats.error as Error).message} onRetry={() => chats.refetch()} />
          ) : (
            <FlatList
              data={filteredChats}
              keyExtractor={item => item._id ?? item.id ?? Math.random().toString(36)}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.chatListInner}
              ListEmptyComponent={
                <View style={styles.noChat}>
                  <Icon name="chat-outline" size={32} color="#cbd5e1" />
                  <Text style={styles.noChatText}>No conversations yet</Text>
                </View>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.chatItem, (item._id ?? item.id) === chatId && styles.chatItemActive]}
                  onPress={() => openChat(item)}
                  activeOpacity={0.7}
                >
                  <Text numberOfLines={1} style={[styles.chatItemTitle, (item._id ?? item.id) === chatId && styles.chatItemTitleActive]}>
                    {item.title ?? 'New conversation'}
                  </Text>
                  <Text style={styles.chatItemMeta}>{item.provider ?? item.conversationType ?? 'assistant'}</Text>
                </TouchableOpacity>
              )}
            />
          )}

          <TouchableOpacity onPress={newChat} style={styles.newChatBtn}>
            <Icon name="plus" size={14} color="#fff" />
            <Text style={styles.newChatText}>New chat</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Attachment Menu Modal */}
      <Modal transparent visible={attachmentMenuOpen} animationType="slide" onRequestClose={() => setAttachmentMenuOpen(false)}>
        <Pressable style={styles.modalBack} onPress={() => setAttachmentMenuOpen(false)}>
          <View style={styles.bottomSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Actions</Text>
            {[
  ['file-document-edit-outline', role === 'seller' ? 'Draft Quotation' : 'Create RFQ', () => setPlugin(role === 'seller' ? 'send-quotation' : 'create-rfq')],
  ['lifebuoy', 'AI Support', () => setPlugin('ai-support')],
  ['camera', 'Camera', pickCamera],
  ['image-multiple', 'Gallery', pickImages],
  ['file-document-multiple', 'Documents', pickDocuments],
].map(([icon, label, action], i) => (
              <TouchableOpacity key={i} onPress={() => { setAttachmentMenuOpen(false); Promise.resolve((action as () => unknown)()).catch(() => Alert.alert('Error', 'Action failed.')); }} style={styles.menuItem}>
                <Icon name={String(icon)} size={16} color="#3b82f6" />
                <Text style={styles.menuText}>{String(label)}</Text>
                <Icon name="chevron-right" size={14} color="#cbd5e1" />
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      <PluginModal visible={Boolean(plugin)} mode={plugin} onClose={() => setPlugin(null)} onSubmit={submit} />
    </View>
  );
}

function Bubble({ item, onRegenerate, onSuggested }: { item: LocalMessage; onRegenerate?: () => void; onSuggested: (prompt: string) => void }) {
  const mine = item.role === 'user';
  const text = item.content ?? item.message ?? '';
  const followUps = Array.isArray(item.metadata?.suggestedFollowUps) ? item.metadata.suggestedFollowUps.map(String).slice(0, 3) : [];

  return (
    <View style={[styles.bubble, mine ? styles.bubbleUser : styles.bubbleAI]}>
      <Text selectable style={[styles.bubbleText, mine ? styles.textUser : styles.textAI]}>
        {text || (item.streaming ? '...' : '')}
      </Text>
      {item.streaming && <CompactAIStatus />}
      {!mine && !item.streaming && text && (
        <View style={styles.actions}>
          <TouchableOpacity onPress={() => Share.share({ message: text })} style={styles.actBtn}>
            <Icon name="share-outline" size={11} color="#94a3b8" />
          </TouchableOpacity>
          {onRegenerate && (
            <TouchableOpacity onPress={onRegenerate} style={styles.actBtn}>
              <Icon name="refresh" size={11} color="#94a3b8" />
            </TouchableOpacity>
          )}
        </View>
      )}
      {!mine && followUps.length > 0 && (
        <View style={styles.followWrap}>
          {followUps.map((p, i) => (
            <TouchableOpacity key={i} onPress={() => onSuggested(p)} style={styles.followChip}>
              <Text style={styles.followText}>{p}</Text>
              <Icon name="arrow-up-right" size={9} color="#3b82f6" />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

function PluginModal({ visible, mode, onClose, onSubmit }: { visible: boolean; mode: PluginMode; onClose: () => void; onSubmit: (message: string) => void }) {
  const [product, setProduct] = useState('');
  const [quantity, setQuantity] = useState('');
  const [country, setCountry] = useState('');
  const [notes, setNotes] = useState('');
  const title = mode === 'send-quotation' ? 'Quotation' : mode === 'create-rfq' ? 'RFQ' : 'Support';

  const submit = () => {
    const prompt = mode === 'send-quotation'
      ? `Generate quotation suggestion. Product: ${product}. Price/MOQ/lead time: ${quantity}. Notes: ${notes}.`
      : mode === 'create-rfq'
      ? `Generate RFQ suggestion. Product: ${product}. Quantity: ${quantity}. Country: ${country}. Notes: ${notes}.`
      : `Help with: ${notes || product}`;
    onClose();
    onSubmit(prompt);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={styles.modalBack} />
      <View style={styles.bottomSheet}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>{title}</Text>
        <TextInput value={product} onChangeText={setProduct} placeholder="Product or topic" placeholderTextColor="#94a3b8" style={styles.pluginInput} />
        {mode !== 'ai-support' && <TextInput value={quantity} onChangeText={setQuantity} placeholder={mode === 'create-rfq' ? 'Quantity / MOQ' : 'Price / MOQ / lead time'} placeholderTextColor="#94a3b8" style={styles.pluginInput} />}
        {mode === 'create-rfq' && <TextInput value={country} onChangeText={setCountry} placeholder="Target country" placeholderTextColor="#94a3b8" style={styles.pluginInput} />}
        <TextInput value={notes} onChangeText={setNotes} multiline placeholder="Notes, specs, requirements..." placeholderTextColor="#94a3b8" style={[styles.pluginInput, styles.pluginNotes]} textAlignVertical="top" />
        <TouchableOpacity onPress={submit} style={styles.pluginSubmit}>
          <Text style={styles.pluginSubmitText}>Generate</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: Platform.OS === 'ios' ? 56 : 36,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#fff',
  },
  hdrBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'center' },
  hdrTitle: { fontSize: 13, fontWeight: '600', color: '#1e293b', letterSpacing: -0.2 },
  msgList: { padding: 10, paddingBottom: 16, flexGrow: 1 },
  empty: { flex: 1, justifyContent: 'center', paddingHorizontal: 16, paddingTop: 40 },
  emptyTitle: { fontSize: 13, fontWeight: '600', color: '#1e293b', textAlign: 'center', marginBottom: 16 },
  suggGrid: { gap: 6 },
  suggCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  suggText: { flex: 1, fontSize: 10, fontWeight: '500', color: '#334155', lineHeight: 14 },
  bubble: { maxWidth: '88%', marginBottom: 8, borderRadius: 12, padding: 8 },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: '#3b82f6' },
  bubbleAI: { alignSelf: 'flex-start', backgroundColor: '#f1f5f9' },
  bubbleText: { fontSize: 11, lineHeight: 16, fontWeight: '400' },
  textUser: { color: '#fff' },
  textAI: { color: '#1e293b' },
  actions: { flexDirection: 'row', gap: 6, marginTop: 4, paddingTop: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e2e8f0' },
  actBtn: { padding: 2 },
  followWrap: { marginTop: 6, gap: 3 },
  followChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#eff6ff', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, gap: 4 },
  followText: { flex: 1, fontSize: 9, color: '#1e40af', fontWeight: '500', lineHeight: 12 },
  attScroll: { paddingHorizontal: 10, paddingTop: 4 },
  attChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 6,
    gap: 4,
  },
  attName: { fontSize: 9, color: '#475569', maxWidth: 80 },
  errBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fef2f2', paddingHorizontal: 10, paddingVertical: 4, gap: 4 },
  errText: { flex: 1, fontSize: 9, color: '#ef4444', fontWeight: '500' },
  errRetry: { fontSize: 9, color: '#ef4444', fontWeight: '600', textDecorationLine: 'underline' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', padding: 8, gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#f1f5f9' },
  plusBtn: { width: 28, height: 28, justifyContent: 'center', alignItems: 'center' },
  input: { flex: 1, backgroundColor: '#f8fafc', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, fontSize: 11, color: '#1e293b', maxHeight: 80 },
  sendBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center' },
  sendDisabled: { backgroundColor: '#cbd5e1' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 10 },
  overlayTouch: { flex: 1 },
  drawer: { position: 'absolute', left: 0, top: 0, bottom: 0, width: DRAWER_WIDTH, backgroundColor: '#fff', zIndex: 20, shadowColor: '#000', shadowOffset: { width: 2, height: 0 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 16 },
  drawerContent: { flex: 1, paddingTop: Platform.OS === 'ios' ? 56 : 36 },
  drawerHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f1f5f9' },
  drawerTitle: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  drawerClose: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'center' },
  srchWrap: { flexDirection: 'row', alignItems: 'center', margin: 10, backgroundColor: '#f8fafc', borderRadius: 8, paddingHorizontal: 8, gap: 6 },
  srchInput: { flex: 1, fontSize: 10, color: '#1e293b', paddingVertical: 6 },
  loadWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  chatListInner: { paddingHorizontal: 12 },
  chatItem: { paddingVertical: 8, paddingHorizontal: 8, borderRadius: 8, marginBottom: 2 },
  chatItemActive: { backgroundColor: '#eff6ff' },
  chatItemTitle: { fontSize: 10, fontWeight: '500', color: '#1e293b' },
  chatItemTitleActive: { color: '#3b82f6' },
  chatItemMeta: { fontSize: 8, color: '#94a3b8', marginTop: 1 },
  noChat: { alignItems: 'center', paddingVertical: 32 },
  noChatText: { fontSize: 10, color: '#94a3b8', marginTop: 8 },
  newChatBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, margin: 12, backgroundColor: '#3b82f6', borderRadius: 10, paddingVertical: 8 },
  newChatText: { fontSize: 10, fontWeight: '600', color: '#fff' },
  modalBack: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  bottomSheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, paddingBottom: 32 },
  sheetHandle: { width: 28, height: 3, backgroundColor: '#e2e8f0', borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 11, fontWeight: '600', color: '#1e293b', marginBottom: 12 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 8 },
  menuText: { flex: 1, fontSize: 10, color: '#334155', fontWeight: '500' },
  pluginInput: { backgroundColor: '#f8fafc', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 10, color: '#1e293b', marginBottom: 6 },
  pluginNotes: { minHeight: 60 },
  pluginSubmit: { backgroundColor: '#3b82f6', borderRadius: 10, paddingVertical: 8, alignItems: 'center', marginTop: 4 },
  pluginSubmitText: { fontSize: 10, fontWeight: '600', color: '#fff' },
});

export default AIChatScreen;