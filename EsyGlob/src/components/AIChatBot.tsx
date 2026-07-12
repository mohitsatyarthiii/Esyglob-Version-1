import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  ScrollView,
  TouchableOpacity,
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

// ─── Color Palette (Exact Match for AI Mode) ──────────────────────────────

const COLORS = {
  bgTop: '#FFF5F5',
  bgBottom: '#FFF0F5',
  text: '#1A1A1A',
  textGray: '#7A7A7A',
  orange: '#FF6B00',
  white: '#FFFFFF',
  black: '#000000',
  border: '#E8E8E8',
};

// ─── Quick Actions Data ─────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  'Verified manufacturer search',
  'Design with AI',
  'Product search',
  'Analyze bestsellers',
  'Evaluate market potential',
  'Discover trends',
];

// ─── API Config ─────────────────────────────────────────────────────────────

const API_BASE = 'https://api.esyglob.com/api';
let AUTH_TOKEN = '';

export function setAIChatToken(token: string) {
  AUTH_TOKEN = token;
}

// ─── Streaming (Your Exact Logic) ──────────────────────────────────────────

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

// ─── Main AI Component ──────────────────────────────────────────────────────

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
  const [inputText, setInputText] = useState('');
  const [chatId, setChatId] = useState<string | undefined>();
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  // ─── Chat Logic ──────────────────────────────────────────────────────────

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
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

      setInputText('');

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

  // ─── Reset Chat ──────────────────────────────────────────────────────────

  const resetChat = useCallback(() => {
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: "👋 Hello! I'm your EsyGlob AI assistant. How can I help you today?",
        timestamp: Date.now(),
      },
    ]);
    setChatId(undefined);
  }, []);

  // ─── UI Render (Chat Mode vs Dashboard Mode) ────────────────────────────

  // If user has sent a message, switch to chat view
  const isChatActive = messages.length > 1 || isStreaming;

  return (
    <View style={styles.container}>
      {/* AI Mode Top Bar (Same as Screenshot) */}
      <View style={styles.topNav}>
        <View style={styles.tabsContainer}>
          <View style={styles.activeTabWrapper}>
            <Text style={styles.activeTabText}>AI Mode</Text>
            <View style={styles.activeTabLine} />
          </View>
          <Text style={styles.inactiveTabText}>Products</Text>
          <Text style={styles.inactiveTabText}>Manufacturers</Text>
          <Text style={styles.inactiveTabText}>Worldwide</Text>
        </View>
        
        <View style={styles.topIcons}>
          <TouchableOpacity onPress={resetChat}>
            <Icon name="history" size={22} color={COLORS.black} />
          </TouchableOpacity>
          <View style={styles.creditBadge}>
            <Icon name="file-document-outline" size={14} color={COLORS.black} />
            <Text style={styles.creditText}>20</Text>
            <View style={styles.creditDivider} />
            <Icon name="star" size={14} color={COLORS.orange} />
            <Text style={[styles.creditText, { color: COLORS.orange }]}>Free</Text>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0} // Adjust this if needed based on your tab bar height
      >
        
        {/* ─── Scrollable Content ─── */}
        <ScrollView
          ref={scrollViewRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {isChatActive ? (
            // ─── Chat View ──────────────────────────────────────────────
            <View style={styles.chatContainer}>
              {messages.map((item) => {
                const isUser = item.role === 'user';
                const time = new Date(item.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <View
                    key={item.id}
                    style={[
                      styles.messageRow,
                      isUser ? styles.messageRowUser : styles.messageRowAI,
                    ]}>
                    {!isUser && (
                      <View style={styles.avatarCircle}>
                        <Icon name="robot-outline" size={18} color={COLORS.orange} />
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

                    {isUser && (
                      <View style={[styles.avatarCircle, styles.avatarUser]}>
                        <Icon name="account-outline" size={18} color="#FFF" />
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          ) : (
            // ─── Dashboard View (Screenshot Look) ──────────────────────
            <View style={styles.dashboardContainer}>
              <Text style={styles.mainHeading}>
                Smart sourcing with <Text style={styles.highlightText}>AI Mode</Text>
              </Text>

              {/* Suggestion Card 1 */}
              <TouchableOpacity style={styles.card}>
                <View style={styles.cardHeader}>
                  <Icon name="magnify" size={20} color={COLORS.orange} />
                  <View style={styles.cardIconBg}>
                    <Icon name="star-outline" size={14} color={COLORS.orange} />
                  </View>
                  <Text style={styles.cardTitle}>Your Next Best Supplier Is Here</Text>
                  <Icon name="chevron-right" size={20} color={COLORS.textGray} style={styles.arrowIcon} />
                </View>
                <Text style={styles.cardSubtitle}>
                  Looking for custom cash register paper factory
                </Text>
              </TouchableOpacity>

              {/* Suggestion Card 2 */}
              <TouchableOpacity style={styles.card}>
                <View style={styles.cardHeader}>
                  <Icon name="magnify" size={20} color={COLORS.orange} />
                  <View style={styles.cardIconBg}>
                    <Icon name="star-outline" size={14} color={COLORS.orange} />
                  </View>
                  <Text style={styles.cardTitle}>See What's Trending in Your Market</Text>
                  <Icon name="chevron-right" size={20} color={COLORS.textGray} style={styles.arrowIcon} />
                </View>
                <Text style={styles.cardSubtitle}>
                  How have the best-selling cash register paper chan...
                </Text>
              </TouchableOpacity>

              {/* Quick Action Chips */}
              <View style={styles.chipsGrid}>
                {QUICK_ACTIONS.map((item, index) => (
                  <TouchableOpacity 
                    key={index} 
                    style={styles.chip}
                    onPress={() => sendMessage(item)}
                  >
                    <Text style={styles.chipText}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </ScrollView>

        {/* ─── Bottom Input Area ──────────────────────────────────────── */}
        <View style={styles.bottomArea}>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.textInput}
              placeholder="Describe your needs..."
              placeholderTextColor="#A0A0A0"
              multiline
              value={inputText}
              onChangeText={setInputText}
              returnKeyType="send"
              onSubmitEditing={() => sendMessage(inputText)}
            />
            <View style={styles.inputIcons}>
              <TouchableOpacity style={styles.iconBtn}>
                <Icon name="camera-outline" size={24} color={COLORS.black} />
              </TouchableOpacity>
              
              {isStreaming ? (
                <ActivityIndicator size="small" color={COLORS.orange} style={styles.loaderPadding} />
              ) : (
                <TouchableOpacity 
                  style={styles.iconBtn} 
                  onPress={() => sendMessage(inputText)}
                  disabled={!inputText.trim()}
                >
                  <Icon 
                    name="microphone-outline" 
                    size={24} 
                    color={!inputText.trim() ? COLORS.textGray : COLORS.black} 
                  />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  loaderPadding: { padding: 4 },
  container: {
    flex: 1,
    backgroundColor: COLORS.bgTop,
  },
  keyboardView: {
    flex: 1,
  },

  // --- Top Nav ---
  topNav: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.bgTop,
  },
  tabsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  activeTabWrapper: {
    alignItems: 'center',
    gap: 4,
  },
  activeTabText: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.black,
  },
  activeTabLine: {
    width: 40,
    height: 3,
    backgroundColor: COLORS.orange,
    borderRadius: 2,
  },
  inactiveTabText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textGray,
  },
  topIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  creditBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  creditText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.black,
  },
  creditDivider: {
    width: 1,
    height: 14,
    backgroundColor: '#E0E0E0',
  },

  // --- Scroll Content ---
  scrollContent: {
    paddingBottom: 20,
    flexGrow: 1,
  },
  
  // --- Dashboard ---
  dashboardContainer: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  mainHeading: {
    fontSize: 26,
    fontWeight: '700',
    color: COLORS.black,
    marginBottom: 20,
    letterSpacing: -0.5,
  },
  highlightText: {
    color: COLORS.orange,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardIconBg: {
    marginRight: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.black,
  },
  arrowIcon: {
    marginLeft: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    color: COLORS.textGray,
    lineHeight: 20,
    paddingLeft: 30,
  },
  chipsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  chip: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.black,
  },

  // --- Chat View ---
  chatContainer: {
    paddingHorizontal: 16,
    paddingTop: 10,
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
  avatarCircle: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: '#FFF7ED',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  avatarUser: {
    backgroundColor: COLORS.orange,
  },
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
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    borderBottomLeftRadius: 4,
  },
  bubbleUser: {
    backgroundColor: COLORS.orange,
    borderBottomRightRadius: 4,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.black,
  },
  bubbleTextUser: {
    color: COLORS.white,
  },
  typingDots: {
    color: COLORS.orange,
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
    color: '#9CA3AF',
  },
  bubbleTimeUser: {
    color: 'rgba(255,255,255,0.6)',
  },

  // --- Bottom Input ---
  bottomArea: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 20 : 10, // Adjust for safe area
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 5,
  },
  inputContainer: {
    flexDirection: 'column',
    backgroundColor: '#F8F8F8',
    borderRadius: 20,
    padding: 16,
    minHeight: 100,
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  textInput: {
    fontSize: 16,
    color: COLORS.black,
    textAlignVertical: 'top',
    minHeight: 40,
    marginBottom: 10,
  },
  inputIcons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 10,
  },
  iconBtn: {
    padding: 4,
  },
});
