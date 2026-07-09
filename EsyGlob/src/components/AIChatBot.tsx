import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

// ─── Types ──────────────────────────────────────────────────────────────────

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
};

type SSEChunk =
  | { type: 'token'; content: string }
  | { type: 'done'; chatId?: string }
  | { type: 'start'; chatId?: string }
  | { type: 'typing' }
  | { type: 'error'; message?: string };

// ─── Palette ────────────────────────────────────────────────────────────────

const P = {
  bg: '#0F172A',
  card: '#1E293B',
  cardAlt: '#334155',
  primary: '#6366F1',
  primaryLight: '#818CF8',
  accent: '#06B6D4',
  userBubble: '#6366F1',
  aiBubble: '#1E293B',
  text: '#F1F5F9',
  muted: '#94A3B8',
  faint: '#475569',
};

const QUICK_PROMPTS = [
  { icon: 'magnify', text: 'Find suppliers for electronics' },
  { icon: 'calculator', text: 'Calculate import duties' },
  { icon: 'trending-up', text: 'Trending products this week' },
  { icon: 'shield-check', text: 'How to verify a supplier?' },
  { icon: 'truck-delivery', text: 'Shipping options to India' },
  { icon: 'file-document', text: 'Create an RFQ' },
];

// ─── Helper: get base URL & token ───────────────────────────────────────────

// NOTE: Replace with your actual API config
const API_BASE = 'https://api.esyglob.com/api'; // Change to your backend URL
let AUTH_TOKEN = '';

export function setAIChatToken(token: string) {
  AUTH_TOKEN = token;
}


// ─── Streaming via XMLHttpRequest (React Native compatible) ─────────────────

async function* streamAIResponse(
  message: string,
  chatId?: string,
): AsyncGenerator<SSEChunk> {
  const xhr = new XMLHttpRequest();
  let lastIndex = 0;
  let buffer = '';
  const chunkQueue: SSEChunk[] = [];

  const promise = new Promise<void>((resolve, reject) => {
    xhr.open('POST', `${API_BASE}/ai/chat/stream`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Authorization', `Bearer ${AUTH_TOKEN}`);

    xhr.onprogress = () => {
      const newData = xhr.responseText.substring(lastIndex);
      lastIndex = xhr.responseText.length;

      buffer += newData;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        try {
          const jsonStr = trimmed.slice(6);
          const data = JSON.parse(jsonStr) as SSEChunk;
          chunkQueue.push(data);
        } catch {
          // skip malformed lines
        }
      }
    };

    xhr.onload = () => {
      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith('data: ')) {
          try {
            const data = JSON.parse(trimmed.slice(6)) as SSEChunk;
            chunkQueue.push(data);
          } catch {
            // skip
          }
        }
      }
      chunkQueue.push({ type: 'done' });
      resolve();
    };

    xhr.onerror = () => {
      chunkQueue.push({ type: 'error', message: 'Network error' });
      reject(new Error('Network error'));
    };

    xhr.ontimeout = () => {
      chunkQueue.push({ type: 'error', message: 'Request timed out' });
      reject(new Error('Timeout'));
    };

    xhr.timeout = 60000;

    xhr.send(
      JSON.stringify({
        message,
        chatId: chatId || undefined,
        role: 'buyer',
        conversationType: 'assistant',
      }),
    );
  });

  // Poll queue until done
  while (true) {
    // Wait 50ms before checking queue
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    // Drain queue
    while (chunkQueue.length > 0) {
      const chunk = chunkQueue.shift()!;
      yield chunk;
      if (chunk.type === 'done' || chunk.type === 'error') {
        return;
      }
    }

    // Check if XHR is done
    if (xhr.readyState === 4) {
      while (chunkQueue.length > 0) {
        const chunk = chunkQueue.shift()!;
        yield chunk;
      }
      return;
    }
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function AIChatBot() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        "Hello! I'm your EsyGlob AI assistant. I can help you find products, suppliers, calculate duties, and more. What would you like to explore today?",
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [chatId, setChatId] = useState<string | undefined>();
  const [isStreaming, setIsStreaming] = useState(false);
  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, []);

  const addMessage = useCallback(
    (msg: ChatMessage) => {
      setMessages(prev => [...prev, msg]);
      scrollToBottom();
    },
    [scrollToBottom],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;

      setInput('');

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: trimmed,
        timestamp: Date.now(),
      };
      addMessage(userMsg);

      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
      };
      addMessage(aiMsg);

      setIsStreaming(true);
      let fullResponse = '';

      try {
        const stream = streamAIResponse(trimmed, chatId);

        for await (const chunk of stream) {
          if (chunk.type === 'error') {
            fullResponse = chunk.message ?? 'Something went wrong. Please try again.';
            break;
          }
          if (chunk.type === 'token') {
            fullResponse += chunk.content;
            // update last message
            setMessages(prev => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.isStreaming) {
                updated[updated.length - 1] = { ...last, content: fullResponse };
              }
              return updated;
            });
          }
          if (chunk.type === 'done' && chunk.chatId) {
            setChatId(chunk.chatId);
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Network error';
        fullResponse = `Connection failed: ${message}`;
      }

      // Finalize
      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.isStreaming) {
          updated[updated.length - 1] = {
            ...last,
            content: fullResponse || 'I could not generate a response.',
            isStreaming: false,
          };
        }
        return updated;
      });
      setIsStreaming(false);
    },
    [isStreaming, chatId, addMessage],
  );

  const renderMessage = useCallback(
    ({ item }: { item: ChatMessage }) => {
      const isUser = item.role === 'user';

      return (
        <Animated.View
          style={[
            styles.messageRow,
            isUser ? styles.messageRowUser : styles.messageRowAI,
            { opacity: fadeAnim },
          ]}>
          {!isUser && (
            <View style={styles.aiAvatar}>
              <Icon name="robot" size={16} color={P.primaryLight} />
            </View>
          )}
          <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
            <Text style={[styles.bubbleText, isUser && styles.userBubbleText]}>
              {item.content}
              {item.isStreaming && <Text style={styles.cursor}> ▌</Text>}
            </Text>
            <Text style={[styles.timestamp, isUser && styles.userTimestamp]}>
              {new Date(item.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          </View>
          {isUser && (
            <View style={styles.userAvatar}>
              <Icon name="account" size={16} color={P.primaryLight} />
            </View>
          )}
        </Animated.View>
      );
    },
    [fadeAnim],
  );

  const showSuggestions = messages.length === 1 && !isStreaming;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.aiBadge}>
            <Icon name="robot" size={18} color={P.primaryLight} />
          </View>
          <View>
            <Text style={styles.headerTitle}>AI Assistant</Text>
            <Text style={styles.headerSubtitle}>
              {isStreaming ? 'Typing...' : 'Online · Powered by AI'}
            </Text>
          </View>
        </View>
        <Pressable
          style={styles.newChatBtn}
          onPress={() => {
            setMessages([
              {
                id: 'welcome',
                role: 'assistant',
                content:
                  "Hello! I'm your EsyGlob AI assistant. How can I help you today?",
                timestamp: Date.now(),
              },
            ]);
            setChatId(undefined);
          }}>
          <Icon name="plus" size={18} color={P.muted} />
        </Pressable>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={scrollToBottom}
        ListFooterComponent={
          showSuggestions ? (
            <View style={styles.suggestions}>
              <Text style={styles.suggestionsTitle}>Try asking about</Text>
              <View style={styles.suggestionGrid}>
                {QUICK_PROMPTS.map((prompt, i) => (
                  <Pressable
                    key={i}
                    style={styles.suggestionChip}
                    onPress={() => sendMessage(prompt.text)}>
                    <Icon name={prompt.icon} size={14} color={P.accent} />
                    <Text style={styles.suggestionText} numberOfLines={2}>
                      {prompt.text}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null
        }
      />

      {/* Input */}
      <View style={styles.inputBar}>
        <View style={styles.inputRow}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask anything about products, suppliers..."
            placeholderTextColor={P.faint}
            style={styles.textInput}
            multiline
            maxLength={500}
            returnKeyType="send"
            blurOnSubmit
            onSubmitEditing={() => sendMessage(input)}
          />
          <Pressable
            onPress={() => sendMessage(input)}
            disabled={!input.trim() || isStreaming}
            style={[
              styles.sendBtn,
              (!input.trim() || isStreaming) && styles.sendBtnDisabled,
            ]}>
            {isStreaming ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Icon name="send" size={18} color="#fff" />
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: P.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: P.card,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  aiBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: P.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 15, fontWeight: '700', color: P.text, letterSpacing: -0.2 },
  headerSubtitle: { fontSize: 11, fontWeight: '500', color: P.muted, marginTop: 1 },
  newChatBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: P.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageList: { paddingHorizontal: 12, paddingVertical: 16, flexGrow: 1 },
  messageRow: { flexDirection: 'row', marginBottom: 16, gap: 8, maxWidth: '88%' },
  messageRowUser: { alignSelf: 'flex-end' },
  messageRowAI: { alignSelf: 'flex-start' },
  aiAvatar: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: P.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: P.primaryLight + '30',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  bubble: { padding: 12, borderRadius: 16, borderBottomLeftRadius: 4 },
  userBubble: {
    backgroundColor: P.userBubble,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 4,
  },
  aiBubble: { backgroundColor: P.aiBubble, borderWidth: 1, borderColor: P.cardAlt },
  bubbleText: { fontSize: 13, lineHeight: 19, color: P.text },
  userBubbleText: { color: '#fff' },
  cursor: { color: P.primaryLight, fontWeight: '300' },
  timestamp: { fontSize: 9, fontWeight: '500', color: P.faint, marginTop: 4, textAlign: 'right' },
  userTimestamp: { color: 'rgba(255,255,255,0.5)' },
  suggestions: { paddingTop: 20 },
  suggestionsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: P.muted,
    textAlign: 'center',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  suggestionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: P.card,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: P.cardAlt,
    width: '47%',
  },
  suggestionText: { fontSize: 11, fontWeight: '600', color: P.text, flex: 1, lineHeight: 15 },
  inputBar: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: P.card,
    backgroundColor: P.bg,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    backgroundColor: P.card,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: P.cardAlt,
  },
  textInput: { flex: 1, fontSize: 13, color: P.text, maxHeight: 100, padding: 0 },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: P.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: P.cardAlt },
});