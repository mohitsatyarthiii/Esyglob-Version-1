import { ApiError, apiRequest, buildApiUrl, getApiHeaders } from './client';
import { normalizeList, unwrapData } from './normalizers';

declare const TextDecoder:
  | {
      new (): { decode(input?: Uint8Array, options?: { stream?: boolean }): string };
    }
  | undefined;

export type AIMessage = {
  _id?: string;
  id?: string;
  role?: 'user' | 'assistant' | 'system';
  content?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
};

export type AIChat = {
  _id?: string;
  id?: string;
  title?: string;
  roleContext?: string;
  conversationType?: string;
  provider?: string;
  model?: string;
  messages?: AIMessage[];
  totalMessages?: number;
  lastMessageAt?: string;
  status?: string;
};

export type AIStreamInput = {
  message: string;
  displayMessage?: string;
  chatId?: string;
  role?: string | null;
  conversationType?: string;
  context?: Record<string, unknown>;
  pluginPayload?: Record<string, unknown> | null;
  responseCard?: Record<string, unknown> | null;
  forceAI?: boolean;
};

export type MarketInsightInput = {
  reportType: 'product' | 'country' | 'opportunity';
  product?: string;
  country?: string;
  category?: string;
  timeframe?: string;
  filters?: Record<string, unknown>;
};

export type MarketInsightReport = {
  title?: string;
  summary?: string;
  sources?: string[];
  sections?: Array<{ title?: string; content?: string; bullets?: string[]; data?: Record<string, unknown>[] }>;
  charts?: Array<{ title?: string; type?: string; data?: Array<{ label?: string; value?: number | string }> }>;
  tables?: Array<{ title?: string; rows?: Record<string, unknown>[] }>;
  opportunities?: Array<Record<string, unknown>>;
  generatedAt?: string;
  [key: string]: unknown;
};

export async function fetchAIChats(role?: string | null): Promise<AIChat[]> {
  const payload = await apiRequest('/api/ai/chat', { query: { role: role ?? undefined } });
  const data = unwrapData<{ chats?: AIChat[] } | AIChat[]>(payload);
  return Array.isArray(data) ? data : data?.chats ?? normalizeList<AIChat>(payload, ['chats']);
}

export async function fetchAIChat(chatId: string): Promise<AIChat> {
  const payload = await apiRequest('/api/ai/chat', { query: { chatId } });
  const data = unwrapData<{ chat?: AIChat } | AIChat>(payload);
  return (data && typeof data === 'object' && 'chat' in data ? data.chat : data) as AIChat;
}

export async function patchAIChat(input: { chatId: string; title?: string; status?: 'active' | 'archived' }) {
  const payload = await apiRequest('/api/ai/chat', { method: 'PATCH', body: input });
  return unwrapData(payload);
}

export async function deleteAIChat(chatId: string) {
  const payload = await apiRequest('/api/ai/chat', { method: 'DELETE', query: { chatId } });
  return unwrapData(payload);
}

export async function postAIChat(input: AIStreamInput) {
  const payload = await apiRequest('/api/ai/chat', { method: 'POST', body: input });
  return unwrapData<{ chat?: AIChat; response?: { message?: string; provider?: string; model?: string } }>(payload);
}

export async function streamAIChat(input: AIStreamInput, onEvent: (event: Record<string, unknown>) => void) {
  const response = await fetch(buildApiUrl('/api/ai/chat/stream'), {
    method: 'POST',
    headers: getApiHeaders({ Accept: 'text/event-stream', 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new ApiError(`AI stream failed with status ${response.status}`, response.status);
  }

  const body = (response as Response & { body?: { getReader?: () => unknown } }).body;
  const reader = body?.getReader?.() as { read: () => Promise<{ done?: boolean; value?: Uint8Array }> } | undefined;

  if (!reader || typeof TextDecoder === 'undefined') {
    const fallback = await postAIChat(input);
    onEvent({ type: 'token', content: fallback.response?.message ?? '' });
    onEvent({ type: 'done', chatId: fallback.chat?._id ?? fallback.chat?.id, provider: fallback.response?.provider, model: fallback.response?.model });
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const next = await reader.read();
    if (next.done) {
      break;
    }

    buffer += decoder.decode(next.value, { stream: true });
    const frames = buffer.split(/\n\n/);
    buffer = frames.pop() ?? '';
    frames.forEach(frame => {
      frame.split(/\n/).forEach(line => {
        if (!line.startsWith('data:')) {
          return;
        }
        const raw = line.replace(/^data:\s*/, '');
        if (!raw || raw === '[DONE]') {
          return;
        }
        try {
          onEvent(JSON.parse(raw));
        } catch {
          onEvent({ type: 'token', content: raw });
        }
      });
    });
  }
}

export async function fetchAIProviderStatus() {
  const payload = await apiRequest('/api/ai/chat/stream', { query: { status: true } });
  return unwrapData(payload);
}

export async function generateMarketInsight(input: MarketInsightInput): Promise<MarketInsightReport> {
  const payload = await apiRequest('/api/ai/market-insights', { method: 'POST', body: input });
  const data = unwrapData<{ report?: MarketInsightReport } | MarketInsightReport>(payload);
  return (data && typeof data === 'object' && 'report' in data ? data.report : data) as MarketInsightReport;
}
