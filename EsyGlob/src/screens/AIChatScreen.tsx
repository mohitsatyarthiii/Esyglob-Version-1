import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { AIChat, AIMessage, deleteAIChat, fetchAIChat, fetchAIChats, patchAIChat, streamAIChat } from '../api/ai';
import { useAuth } from '../auth/AuthContext';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { colors, radii, spacing } from '../theme';
import AuthScreen from './AuthScreen';

type PluginMode = 'create-rfq' | 'send-quotation' | 'ai-support' | null;
type LocalMessage = AIMessage & { localId?: string; streaming?: boolean };

function AIChatScreen() {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { activeRole, status } = useAuth();
  const role = activeRole === 'seller' ? 'seller' : 'buyer';
  const [search, setSearch] = useState('');
  const [chatId, setChatId] = useState<string | undefined>();
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState('');
  const [plugin, setPlugin] = useState<PluginMode>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const chats = useQuery({
    queryKey: ['ai-chats', role],
    queryFn: () => fetchAIChats(role),
    enabled: status === 'authenticated',
  });
  const filteredChats = useMemo(
    () => (chats.data ?? []).filter(chat => (chat.title ?? '').toLowerCase().includes(search.trim().toLowerCase())),
    [chats.data, search],
  );
  const send = useMutation({
    mutationFn: async (message: string) => {
      const userMessage: LocalMessage = { localId: `u-${Date.now()}`, role: 'user', content: message, createdAt: new Date().toISOString() };
      const assistantId = `a-${Date.now()}`;
      setMessages(current => [...current, userMessage, { localId: assistantId, role: 'assistant', content: '', streaming: true }]);
      setInput('');
      let nextChatId = chatId;

      await streamAIChat({
        message,
        displayMessage: message,
        chatId,
        role,
        conversationType: plugin === 'create-rfq' ? 'rfq' : plugin === 'send-quotation' ? 'quotation' : plugin === 'ai-support' ? 'support' : 'assistant',
        context: { feature: 'AI Chatbot', sourcePath: `/mobile/${role}/ai` },
      }, event => {
        if (event.type === 'start' && typeof event.chatId === 'string') {
          nextChatId = event.chatId;
          setChatId(event.chatId);
        }
        if (event.type === 'token') {
          setMessages(current => current.map(item => item.localId === assistantId ? { ...item, content: `${item.content ?? ''}${String(event.content ?? '')}` } : item));
        }
        if (event.type === 'done') {
          if (typeof event.chatId === 'string') {
            nextChatId = event.chatId;
            setChatId(event.chatId);
          }
          setMessages(current => current.map(item => item.localId === assistantId ? { ...item, streaming: false } : item));
        }
      });

      return nextChatId;
    },
    onSuccess: () => {
      setPlugin(null);
      queryClient.invalidateQueries({ queryKey: ['ai-chats', role] });
    },
    onError: error => {
      setMessages(current => current.map(item => item.streaming ? { ...item, streaming: false, content: item.content || 'AI response failed. Please retry.' } : item));
      Alert.alert('AI unavailable', error instanceof Error ? error.message : 'Unable to contact AI assistant.');
    },
  });

  if (status !== 'authenticated') {
    return <AuthScreen onClose={() => navigation.goBack()} />;
  }

  const openChat = async (chat: AIChat) => {
    const id = chat._id ?? chat.id;
    if (!id) return;
    setHistoryOpen(false);
    setChatId(id);
    const detail = await fetchAIChat(id);
    setMessages(detail.messages ?? []);
  };

  const newChat = () => {
    setChatId(undefined);
    setMessages([]);
    setHistoryOpen(false);
  };

  const submit = (override?: string) => {
    const message = (override ?? input).trim();
    if (!message || send.isPending) return;
    send.mutate(message);
  };

  const archiveChat = async () => {
    if (!chatId) return;
    await deleteAIChat(chatId);
    newChat();
    queryClient.invalidateQueries({ queryKey: ['ai-chats', role] });
  };

  const renameChat = async () => {
    if (!chatId) return;
    const title = messages.find(item => item.role === 'user')?.content?.slice(0, 42) || 'EsyGlob AI chat';
    await patchAIChat({ chatId, title });
    queryClient.invalidateQueries({ queryKey: ['ai-chats', role] });
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconButton}><Icon name="arrow-left" size={24} color={colors.ink} /></Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>AI Assistant</Text>
          <Text style={styles.subtitle}>{role === 'seller' ? 'Seller plugins: quotation, support, files' : 'Buyer plugins: RFQ, support, files'}</Text>
        </View>
        <Pressable onPress={() => setHistoryOpen(true)} style={styles.iconButton}><Icon name="history" size={23} color={colors.ink} /></Pressable>
      </View>
      <FlatList
        data={messages}
        keyExtractor={(item, index) => item._id ?? item.id ?? item.localId ?? String(index)}
        contentContainerStyle={styles.messages}
        ListEmptyComponent={
          <View>
            <EmptyState title="Ask EsyGlob AI" detail="Use marketplace-aware prompts or generate RFQ and quotation suggestions." />
            <View style={styles.suggestionGrid}>
              {suggestions(role).map(item => <Pressable key={item} onPress={() => submit(item)} style={styles.suggestion}><Text style={styles.suggestionText}>{item}</Text></Pressable>)}
            </View>
          </View>
        }
        renderItem={({ item }) => <Bubble item={item} />}
      />
      <View style={styles.pluginRow}>
        {(role === 'seller' ? sellerPlugins : buyerPlugins).map(item => (
          <Pressable key={item.id} onPress={() => setPlugin(item.id as PluginMode)} style={styles.pluginChip}>
            <Icon name={item.icon} size={16} color={colors.primaryDark} />
            <Text style={styles.pluginText}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.composer}>
        <TextInput value={input} onChangeText={setInput} multiline placeholder="Message EsyGlob AI" placeholderTextColor={colors.muted} style={styles.input} />
        <Pressable disabled={!input.trim() || send.isPending} onPress={() => submit()} style={[styles.send, (!input.trim() || send.isPending) && styles.sendDisabled]}>
          {send.isPending ? <ActivityIndicator color="#fff" /> : <Icon name="send" size={18} color="#fff" />}
        </Pressable>
      </View>
      <Modal visible={historyOpen} transparent animationType="slide" onRequestClose={() => setHistoryOpen(false)}>
        <Pressable onPress={() => setHistoryOpen(false)} style={styles.backdrop} />
        <View style={styles.sheet}>
          <View style={styles.sheetTop}>
            <Text style={styles.sheetTitle}>Saved chats</Text>
            <Pressable onPress={newChat} style={styles.newButton}><Text style={styles.newText}>New Chat</Text></Pressable>
          </View>
          <TextInput value={search} onChangeText={setSearch} placeholder="Search history" placeholderTextColor={colors.muted} style={styles.search} />
          {chats.isLoading ? <LoadingState label="Loading chats" /> : chats.isError ? <ErrorState message={(chats.error as Error).message} onRetry={() => chats.refetch()} /> : (
            <FlatList data={filteredChats} keyExtractor={item => item._id ?? item.id ?? item.title ?? Math.random().toString(36)} renderItem={({ item }) => (
              <Pressable onPress={() => openChat(item)} style={styles.chatRow}>
                <Icon name="chat-outline" size={20} color={colors.primary} />
                <View style={styles.chatRowBody}>
                  <Text numberOfLines={1} style={styles.chatTitle}>{item.title ?? 'Untitled chat'}</Text>
                  <Text style={styles.chatMeta}>{item.provider ?? item.conversationType ?? 'assistant'}</Text>
                </View>
              </Pressable>
            )} />
          )}
          {chatId ? (
            <View style={styles.chatActions}>
              <Pressable onPress={renameChat} style={styles.actionButton}><Text style={styles.actionText}>Rename</Text></Pressable>
              <Pressable onPress={archiveChat} style={styles.actionButton}><Text style={styles.deleteText}>Delete</Text></Pressable>
            </View>
          ) : null}
        </View>
      </Modal>
      <PluginModal visible={Boolean(plugin)} mode={plugin} onClose={() => setPlugin(null)} onSubmit={submit} />
    </View>
  );
}

const buyerPlugins = [
  { id: 'create-rfq', label: 'Create RFQ', icon: 'clipboard-list-outline' },
  { id: 'ai-support', label: 'AI Support', icon: 'lifebuoy' },
  { id: 'ai-support', label: 'File Upload', icon: 'paperclip' },
];
const sellerPlugins = [
  { id: 'send-quotation', label: 'Quotation', icon: 'cash-multiple' },
  { id: 'ai-support', label: 'AI Support', icon: 'lifebuoy' },
  { id: 'ai-support', label: 'File Upload', icon: 'paperclip' },
];

function suggestions(role: string) {
  return role === 'seller'
    ? ['Draft a quotation response for a buyer RFQ', 'Improve my supplier profile for exports', 'Explain how to enable Start Order']
    : ['Find verified suppliers for cotton t-shirts', 'Draft an RFQ for 500 units with low MOQ', 'Compare sourcing risks for India and Vietnam'];
}

function Bubble({ item }: { item: LocalMessage }) {
  const mine = item.role === 'user';
  const text = item.content ?? item.message ?? '';
  return (
    <View style={[styles.bubble, mine ? styles.userBubble : styles.aiBubble]}>
      <Text style={[styles.bubbleText, mine && styles.userText]}>{text || (item.streaming ? 'Thinking...' : '')}</Text>
      {item.streaming ? <Text style={styles.streaming}>streaming</Text> : null}
    </View>
  );
}

function PluginModal({ visible, mode, onClose, onSubmit }: { visible: boolean; mode: PluginMode; onClose: () => void; onSubmit: (message: string) => void }) {
  const [product, setProduct] = useState('');
  const [quantity, setQuantity] = useState('');
  const [country, setCountry] = useState('');
  const [notes, setNotes] = useState('');
  const title = mode === 'send-quotation' ? 'Quotation suggestion' : mode === 'create-rfq' ? 'RFQ suggestion' : 'AI support';

  const submit = () => {
    const prompt = mode === 'send-quotation'
      ? `Generate a professional quotation suggestion only. Do not claim the quotation was created, submitted, sent, or saved. Product: ${product}. Price/MOQ/lead time: ${quantity}. Notes: ${notes}.`
      : mode === 'create-rfq'
        ? `Generate a professional RFQ suggestion only. Do not claim the RFQ was posted, submitted, sent, or saved. Product: ${product}. Quantity: ${quantity}. Target country: ${country}. Notes: ${notes}.`
        : `Help me with this EsyGlob support request: ${notes || product}`;
    onClose();
    onSubmit(prompt);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={styles.backdrop} />
      <View style={styles.sheet}>
        <Text style={styles.sheetTitle}>{title}</Text>
        <TextInput value={product} onChangeText={setProduct} placeholder="Product or topic" placeholderTextColor={colors.muted} style={styles.search} />
        {mode !== 'ai-support' ? <TextInput value={quantity} onChangeText={setQuantity} placeholder={mode === 'create-rfq' ? 'Quantity / MOQ' : 'Price / MOQ / lead time'} placeholderTextColor={colors.muted} style={styles.search} /> : null}
        {mode === 'create-rfq' ? <TextInput value={country} onChangeText={setCountry} placeholder="Target country" placeholderTextColor={colors.muted} style={styles.search} /> : null}
        <TextInput value={notes} onChangeText={setNotes} multiline placeholder="Notes, specs, packaging, terms" placeholderTextColor={colors.muted} style={[styles.search, styles.notes]} />
        <Pressable onPress={submit} style={styles.submitButton}><Text style={styles.submitText}>Generate suggestion</Text></Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  header: { alignItems: 'center', backgroundColor: colors.card, borderBottomColor: colors.faint, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', paddingBottom: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.xxl },
  iconButton: { alignItems: 'center', height: 42, justifyContent: 'center', width: 42 },
  headerText: { flex: 1 },
  title: { color: colors.ink, fontSize: 19, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: colors.muted, fontSize: 11, fontWeight: '700', marginTop: 2, textAlign: 'center' },
  messages: { padding: spacing.lg, paddingBottom: spacing.xl },
  suggestionGrid: { gap: spacing.sm, marginTop: spacing.lg },
  suggestion: { backgroundColor: colors.card, borderColor: colors.faint, borderRadius: radii.md, borderWidth: 1, padding: spacing.md },
  suggestionText: { color: colors.ink, fontWeight: '800', lineHeight: 19 },
  bubble: { borderRadius: radii.md, marginBottom: spacing.md, maxWidth: '88%', padding: spacing.md },
  userBubble: { alignSelf: 'flex-end', backgroundColor: colors.primary },
  aiBubble: { alignSelf: 'flex-start', backgroundColor: colors.card },
  bubbleText: { color: colors.ink, fontSize: 14, fontWeight: '700', lineHeight: 21 },
  userText: { color: '#fff' },
  streaming: { color: colors.muted, fontSize: 10, fontWeight: '900', marginTop: spacing.xs, textTransform: 'uppercase' },
  pluginRow: { backgroundColor: colors.card, flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  pluginChip: { alignItems: 'center', backgroundColor: '#fff8f3', borderRadius: radii.pill, flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  pluginText: { color: colors.primaryDark, fontSize: 11, fontWeight: '900' },
  composer: { alignItems: 'flex-end', backgroundColor: colors.card, flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  input: { backgroundColor: colors.cardMuted, borderRadius: radii.md, color: colors.ink, flex: 1, maxHeight: 120, minHeight: 46, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  send: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.pill, height: 46, justifyContent: 'center', width: 46 },
  sendDisabled: { opacity: 0.55 },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.35)', flex: 1 },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, maxHeight: '78%', padding: spacing.lg },
  sheetTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sheetTitle: { color: colors.ink, fontSize: 19, fontWeight: '900', marginBottom: spacing.md },
  newButton: { backgroundColor: '#fff8f3', borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  newText: { color: colors.primaryDark, fontWeight: '900' },
  search: { backgroundColor: colors.cardMuted, borderRadius: radii.md, color: colors.ink, fontWeight: '700', marginBottom: spacing.md, minHeight: 46, paddingHorizontal: spacing.md },
  notes: { minHeight: 96, paddingTop: spacing.md, textAlignVertical: 'top' },
  chatRow: { alignItems: 'center', borderBottomColor: colors.faint, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md },
  chatRowBody: { flex: 1 },
  chatTitle: { color: colors.ink, fontWeight: '900' },
  chatMeta: { color: colors.muted, fontSize: 11, fontWeight: '700', marginTop: 2 },
  chatActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  actionButton: { alignItems: 'center', backgroundColor: colors.cardMuted, borderRadius: radii.pill, flex: 1, padding: spacing.md },
  actionText: { color: colors.ink, fontWeight: '900' },
  deleteText: { color: colors.rose, fontWeight: '900' },
  submitButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.pill, minHeight: 48, justifyContent: 'center' },
  submitText: { color: '#fff', fontWeight: '900' },
});

export default AIChatScreen;
