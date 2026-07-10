import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StatusBar,
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

// ─── Light Theme Palette ────────────────────────────────────────────────────

const P = {
  bg: '#F0F4FF',
  headerBg: '#FFFFFF',
  card: '#FFFFFF',
  primary: '#6366F1',
  primaryLight: '#EEF2FF',
  accent: '#06B6D4',
  accentLight: '#ECFEFF',
  userBubble: '#6366F1',
  userBubbleText: '#FFFFFF',
  aiBubble: '#FFFFFF',
  aiBubbleBorder: '#E8ECF4',
  text: '#1A1A2E',
  textSecondary: '#6B7280',
  muted: '#9CA3AF',
  faint: '#E5E7EB',
  inputBg: '#F9FAFB',
  inputBorder: '#E5E7EB',
  online: '#10B981',
  time: '#9CA3AF',
  suggestionBg: '#FFFFFF',
  suggestionBorder: '#E8ECF4',
  suggestionIcon: '#6366F1',
};

// ─── Quick Prompts ──────────────────────────────────────────────────────────

const QUICK_PROMPTS = [
  { icon: 'magnify', text: 'Find suppliers for electronics', color: '#6366F1' },
  { icon: 'calculator-variant', text: 'Calculate import duties', color: '#F59E0B' },
  { icon: 'trending-up', text: 'Trending products this week', color: '#10B981' },
  { icon: 'shield-check', text: 'How to verify a supplier?', color: '#3B82F6' },
  { icon: 'truck-delivery', text: 'Shipping options to India', color: '#8B5CF6' },
  { icon: 'file-document', text: 'Create an RFQ', color: '#EC4899' },
];

// ─── API Config ─────────────────────────────────────────────────────────────

const API_BASE = 'https://api.esyglob.com/api';
let AUTH_TOKEN = '';

export function setAIChatToken(token: string) {
  AUTH_TOKEN = token;
}

// ─── Streaming ──────────────────────────────────────────────────────────────

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
      chunkQueue.push({ type: 'error', message: 'Network error. Please try again.' });
      reject(new Error('Network error'));
    };

    xhr.ontimeout = () => {
      chunkQueue.push({ type: 'error', message: 'Request timed out.' });
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
  promise.catch(() => undefined);

  // Poll queue
  while (true) {
    await new Promise<void>(resolve => setTimeout(resolve, 50));

    while (chunkQueue.length > 0) {
      const chunk = chunkQueue.shift()!;
      yield chunk;
      if (chunk.type === 'done' || chunk.type === 'error') {
        return;
      }
    }

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
        "👋 Hello! I'm your EsyGlob AI assistant. I can help you find products, suppliers, calculate duties, and more. What would you like to explore today?",
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
      duration: 600,
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
            fullResponse = chunk.message ?? 'Something went wrong.';
            break;
          }
          if (chunk.type === 'token') {
            fullResponse += chunk.content;
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
        const msg = err instanceof Error ? err.message : 'Network error';
        fullResponse = `❌ Connection failed: ${msg}`;
      }

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
      const time = new Date(item.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });

      return (
        <Animated.View
          style={[
            styles.messageRow,
            isUser ? styles.messageRowUser : styles.messageRowAI,
            { opacity: fadeAnim },
          ]}>
          {/* AI Avatar */}
          {!isUser && (
            <View style={styles.avatarCircle}>
              <Icon name="robot-outline" size={18} color={P.primary} />
            </View>
          )}

          <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAI]}>
            <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>
              {item.content}
              {item.isStreaming && (
                <Text style={styles.typingDots}> ●</Text>
              )}
            </Text>
            <View style={styles.bubbleFooter}>
              <Text style={[styles.bubbleTime, isUser && styles.bubbleTimeUser]}>
                {time}
              </Text>
              {isUser && (
                <Icon name="check-all" size={14} color="rgba(255,255,255,0.6)" />
              )}
            </View>
          </View>

          {/* User Avatar */}
          {isUser && (
            <View style={[styles.avatarCircle, styles.avatarUser]}>
              <Icon name="account-outline" size={18} color="#FFF" />
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
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 70}>
      <StatusBar barStyle="dark-content" backgroundColor={P.bg} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.aiAvatarCircle}>
            <Icon name="robot" size={20} color={P.primary} />
          </View>
          <View>
            <Text style={styles.headerTitle}>AI Assistant</Text>
            <View style={styles.statusRow}>
              <View style={styles.onlineDot} />
              <Text style={styles.statusText}>
                {isStreaming ? 'Typing...' : 'Online'}
              </Text>
            </View>
          </View>
        </View>
        <Pressable
          onPress={() => {
            setMessages([
              {
                id: 'welcome',
                role: 'assistant',
                content:
                  "👋 Hello! I'm your EsyGlob AI assistant. How can I help you today?",
                timestamp: Date.now(),
              },
            ]);
            setChatId(undefined);
          }}
          style={styles.newChatBtn}>
          <Icon name="plus" size={20} color={P.textSecondary} />
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
        showsVerticalScrollIndicator={false}
        ListFooterComponent={
          showSuggestions ? (
            <View style={styles.suggestionsWrap}>
              <Text style={styles.suggestionsTitle}>Try asking about</Text>
              <View style={styles.suggestionGrid}>
                {QUICK_PROMPTS.map((prompt, i) => (
                  <Pressable
                    key={i}
                    style={({ pressed }) => [
                      styles.suggestionChip,
                      pressed && styles.pressed,
                    ]}
                    onPress={() => sendMessage(prompt.text)}>
                    <View style={[styles.suggestionIcon, { backgroundColor: prompt.color + '15' }]}>
                      <Icon name={prompt.icon} size={16} color={prompt.color} />
                    </View>
                    <Text style={styles.suggestionText} numberOfLines={2}>
                      {prompt.text}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null
        }
        ListFooterComponentStyle={styles.footerComponent}
      />

      {/* Input Bar */}
      <View style={styles.inputBar}>
        <View style={styles.inputRow}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask anything..."
            placeholderTextColor={P.muted}
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
            style={({ pressed }) => [
              styles.sendBtn,
              (!input.trim() || isStreaming) && styles.sendBtnDisabled,
              pressed && styles.sendBtnPressed,
            ]}>
            {isStreaming ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Icon name="send" size={18} color="#FFF" />
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: P.bg,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: P.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: P.faint,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  aiAvatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: P.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: P.text,
    letterSpacing: -0.2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 1,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: P.online,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '500',
    color: P.textSecondary,
  },
  newChatBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: P.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: P.faint,
  },

  // Messages
  messageList: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexGrow: 1,
  },
  footerComponent: {
    paddingBottom: 8,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 8,
    gap: 6,
    maxWidth: '85%',
  },
  messageRowUser: {
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
  },
  messageRowAI: {
    alignSelf: 'flex-start',
  },

  // Avatars
  avatarCircle: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: P.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  avatarUser: {
    backgroundColor: P.primary,
  },

  // Bubbles
  bubble: {
    padding: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  bubbleAI: {
    backgroundColor: P.aiBubble,
    borderWidth: 1,
    borderColor: P.aiBubbleBorder,
    borderBottomLeftRadius: 4,
  },
  bubbleUser: {
    backgroundColor: P.userBubble,
    borderBottomRightRadius: 4,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
    color: P.text,
  },
  bubbleTextUser: {
    color: P.userBubbleText,
  },
  typingDots: {
    color: P.primary,
    fontWeight: '700',
  },
  bubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 3,
    marginTop: 4,
  },
  bubbleTime: {
    fontSize: 10,
    fontWeight: '500',
    color: P.time,
  },
  bubbleTimeUser: {
    color: 'rgba(255,255,255,0.6)',
  },

  // Suggestions
  suggestionsWrap: {
    paddingTop: 16,
  },
  suggestionsTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: P.textSecondary,
    textAlign: 'center',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  suggestionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: P.suggestionBg,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: P.suggestionBorder,
    width: '47%',
  },
  suggestionIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionText: {
    fontSize: 11,
    fontWeight: '600',
    color: P.text,
    flex: 1,
    lineHeight: 15,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.9,
  },

  // Input Bar
  inputBar: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    paddingBottom: Platform.OS === 'ios' ? 8 : 12,
    backgroundColor: P.headerBg,
    borderTopWidth: 1,
    borderTopColor: P.faint,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    backgroundColor: P.inputBg,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: P.inputBorder,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    color: P.text,
    maxHeight: 100,
    paddingVertical: 4,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: P.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: P.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  sendBtnDisabled: {
    backgroundColor: P.muted,
    shadowOpacity: 0,
    elevation: 0,
  },
  sendBtnPressed: {
    transform: [{ scale: 0.9 }],
  },
});
