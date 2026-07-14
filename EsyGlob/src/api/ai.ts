import { ApiError, apiRequest, buildApiUrl, getApiHeaders } from './client';
import { normalizeList, unwrapData } from './normalizers';
import { Category, Product, SellerSummary } from './types';

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

export type ImageSearchResult = {
  answer?: string;
  products: Product[];
  suppliers: SellerSummary[];
  categories: Category[];
  imageSearch?: { imageUrl?: string; status?: string; message?: string } | null;
};

export async function searchMarketplaceByImage(imageUrl: string, role?: string | null): Promise<ImageSearchResult> {
  const payload = await apiRequest('/ai-search', { method: 'POST', body: { imageUrl, role: role ?? 'general', includeAI: true, forceAI: true } });
  const data = unwrapData<Record<string, any>>(payload) ?? {};
  const results = data.results && typeof data.results === 'object' ? data.results : {};
  return {
    answer: String(data.answer ?? ''),
    products: data.products ?? results.products ?? [],
    suppliers: data.suppliers ?? data.sellers ?? results.suppliers ?? [],
    categories: data.categories ?? results.categories ?? [],
    imageSearch: data.imageSearch ?? null,
  };
}

export async function fetchAIChats(role?: string | null): Promise<AIChat[]> {
  const payload = await apiRequest('/ai-chat', { query: { role: role ?? undefined } });
  const data = unwrapData<{ chats?: AIChat[] } | AIChat[]>(payload);
  return Array.isArray(data) ? data : data?.chats ?? normalizeList<AIChat>(payload, ['chats']);
}

export async function fetchAIChat(chatId: string): Promise<AIChat> {
  const payload = await apiRequest('/ai-chat', { query: { chatId } });
  const data = unwrapData<{ chat?: AIChat } | AIChat>(payload);
  return (data && typeof data === 'object' && 'chat' in data ? data.chat : data) as AIChat;
}

export async function patchAIChat(input: { chatId: string; title?: string; status?: 'active' | 'archived' }) {
  const payload = await apiRequest('/ai-chat', { method: 'PATCH', body: input });
  return unwrapData(payload);
}

export async function deleteAIChat(chatId: string) {
  const payload = await apiRequest('/ai-chat', { method: 'DELETE', query: { chatId } });
  return unwrapData(payload);
}

export async function postAIChat(input: AIStreamInput) {
  const payload = await apiRequest('/ai-chat', { method: 'POST', body: input });
  return unwrapData<{ chat?: AIChat; response?: { message?: string; provider?: string; model?: string } }>(payload);
}

export async function streamAIChat(input: AIStreamInput, onEvent: (event: Record<string, unknown>) => void): Promise<void> {
  if (typeof XMLHttpRequest === 'undefined') {
    const fallback = await postAIChat(input);
    onEvent({ type: 'token', content: fallback.response?.message ?? '' });
    onEvent({ type: 'done', chatId: fallback.chat?._id ?? fallback.chat?.id, provider: fallback.response?.provider, model: fallback.response?.model });
    return;
  }

  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let processedLength = 0;
    let buffer = '';
    let settled = false;
    let receivedDone = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (error) reject(error); else resolve();
    };
    const processFrames = (flush = false) => {
      const nextText = xhr.responseText.slice(processedLength);
      processedLength = xhr.responseText.length;
      buffer += nextText.replace(/\r\n/g, '\n');
      const frames = buffer.split(/\n\n/);
      const remainder = frames.pop() ?? '';
      if (flush) {
        if (remainder) frames.push(remainder);
        buffer = '';
      } else {
        buffer = remainder;
      }
      frames.forEach(frame => frame.split('\n').forEach(line => {
        if (!line.startsWith('data:')) return;
        const raw = line.replace(/^data:\s*/, '').trim();
        if (!raw || raw === '[DONE]') return;
        try {
          const event = JSON.parse(raw) as Record<string, unknown>;
          if (event.type === 'done') receivedDone = true;
          if (event.type === 'error') {
            finish(new ApiError(String(event.message ?? 'AI service returned an error'), 503, event));
            return;
          }
          onEvent(event);
        } catch (error) {
          if (error instanceof SyntaxError) onEvent({ type: 'token', content: raw });
        }
      }));
    };

    xhr.open('POST', buildApiUrl('/ai-chat/stream'));
    const headers = getApiHeaders({ Accept: 'text/event-stream', 'Content-Type': 'application/json' });
    Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));
    xhr.timeout = 120_000;
    xhr.onprogress = () => processFrames();
    xhr.onload = () => {
      processFrames(true);
      if (xhr.status < 200 || xhr.status >= 300) {
        finish(new ApiError(`AI request failed with status ${xhr.status}`, xhr.status, xhr.responseText));
        return;
      }
      if (!receivedDone) onEvent({ type: 'done' });
      finish();
    };
    xhr.onerror = () => finish(new ApiError('Unable to reach the AI service. Check your connection and retry.', 0));
    xhr.ontimeout = () => finish(new ApiError('The AI service took too long to respond. Please retry.', 408));
    xhr.onabort = () => finish(new ApiError('AI request was cancelled.', 499));
    xhr.send(JSON.stringify(input));
  });
}

export async function fetchAIProviderStatus() {
  const payload = await apiRequest('/ai-chat/status');
  return unwrapData(payload);
}

export async function generateMarketInsight(input: MarketInsightInput): Promise<MarketInsightReport> {
  const payload = await apiRequest('/market-insights', { method: 'POST', body: input });
  const data = unwrapData<{ report?: MarketInsightReport } | MarketInsightReport>(payload);
  return (data && typeof data === 'object' && 'report' in data ? data.report : data) as MarketInsightReport;
} 
