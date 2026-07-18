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
  id?: string;
  reportType?: string;
  title?: string;
  summary?: string;
  executiveSummary?: string;
  aiAnalysis?: string;
  aiSource?: string;
  hasAI?: boolean;
  hasRealData?: boolean;
  sources?: string[];
  sections?: Array<{
    type?: string;
    title?: string;
    content?: string;
    summary?: string;
    bullets?: string[];
    points?: string[];
    confidence?: number;
    data?: Record<string, unknown>[];
  }>;
  charts?: Array<{
    title?: string;
    type?: string;
    data?: Array<{ label?: string; value?: number | string }>;
  }>;
  tables?: Array<{ title?: string; columns?: string[]; rows?: Record<string, unknown>[] }>;
  opportunities?: Array<Record<string, unknown>>;
  generatedAt?: string;
  createdAt?: string;
  dataFreshness?: string;
  dataSources?: Array<string | { name?: string; label?: string; url?: string }>;
  sourceChips?: Array<string | { name?: string; label?: string; url?: string }>;
  exportAnalysis?: Array<Record<string, any>>;
  importAnalysis?: Array<Record<string, any>>;
  fastestGrowingMarkets?: Array<Record<string, any>>;
  opportunityTable?: Array<Record<string, any>>;
  topProducts?: Array<Record<string, any>>;
  marketSummary?: Record<string, any>;
  marketplaceMetrics?: Record<string, any>;
  countryAnalysis?: Record<string, any>;
  scoring?: Record<string, any>;
  demographics?: {
    distribution?: Array<{ label?: string; value?: number; unit?: string }>;
    regionalComparison?: Array<{
      label?: string;
      value?: number;
      unit?: string;
    }>;
  };
  tariffInfo?: Record<string, any>;
  dataIntegrityNotes?: string[];
  kpis?: Array<{ label?: string; value?: string | number; trend?: string; note?: string }>;
  recommendations?: string[];
  risks?: Array<{ label?: string; level?: string; reason?: string }>;
  dataGaps?: string[];
  marketplaceSection?: {
    title?: string;
    summary?: string;
    metrics?: Record<string, unknown>;
    tables?: Array<{ title?: string; columns?: string[]; rows?: Record<string, unknown>[] }>;
  };
  [key: string]: unknown;
};

export type ImageSearchResult = {
  answer?: string;
  products: Product[];
  suppliers: SellerSummary[];
  categories: Category[];
  imageSearch?: { imageUrl?: string; status?: string; message?: string } | null;
};

export async function searchMarketplaceByImage(
  imageUrl: string,
  role?: string | null,
): Promise<ImageSearchResult> {
  const payload = await apiRequest('/ai-search', {
    method: 'POST',
    body: { imageUrl, role: role ?? 'general', includeAI: true, forceAI: true },
  });
  const data = unwrapData<Record<string, any>>(payload) ?? {};
  const results =
    data.results && typeof data.results === 'object' ? data.results : {};
  return {
    answer: String(data.answer ?? ''),
    products: data.products ?? results.products ?? [],
    suppliers: data.suppliers ?? data.sellers ?? results.suppliers ?? [],
    categories: data.categories ?? results.categories ?? [],
    imageSearch: data.imageSearch ?? null,
  };
}

export type MarketResearchEvent = {
  type?: 'research_started' | 'step' | 'section' | 'report' | 'done' | 'error';
  agent?: string;
  operation?: string;
  status?: string;
  progress?: number;
  elapsedMs?: number;
  sourceCount?: number;
  datasetsCollected?: number;
  section?: NonNullable<MarketInsightReport['sections']>[number];
  report?: MarketInsightReport;
  message?: string;
  [key: string]: unknown;
};

export async function streamMarketResearch(
  input: MarketInsightInput & { query?: string },
  onEvent: (event: MarketResearchEvent) => void,
): Promise<void> {
  const mode = input.reportType === 'country' ? 'country_rd' : input.reportType === 'opportunity' ? 'opportunity_finder' : 'product_rd';
  return streamSse('/market-insights/research/stream', { mode, query: input.query, productName: input.product?.trim(), country: input.country?.trim(), category: input.category?.trim() }, onEvent);
}

function streamSse(path: string, body: Record<string, unknown>, onEvent: (event: MarketResearchEvent) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let consumed = 0;
    let buffer = '';
    const process = (flush = false) => {
      buffer += xhr.responseText.slice(consumed).replace(/\r\n/g, '\n');
      consumed = xhr.responseText.length;
      const frames = buffer.split('\n\n');
      const remainder = frames.pop() || '';
      if (flush && remainder) frames.push(remainder);
      buffer = flush ? '' : remainder;
      frames.forEach(frame => frame.split('\n').forEach(line => {
        if (!line.startsWith('data:')) return;
        try { const event = JSON.parse(line.replace(/^data:\s*/, '')) as MarketResearchEvent; if (event.type === 'error') reject(new ApiError(String(event.message || 'Research failed'), Number(event.status || 500), event)); else onEvent(event); } catch (error) { if (!(error instanceof SyntaxError)) throw error; }
      }));
    };
    xhr.open('POST', buildApiUrl(path));
    Object.entries(getApiHeaders({ Accept: 'text/event-stream', 'Content-Type': 'application/json' })).forEach(([key, value]) => xhr.setRequestHeader(key, value));
    xhr.timeout = 180_000;
    xhr.onprogress = () => process();
    xhr.onload = () => { process(true); if (xhr.status >= 200 && xhr.status < 300) resolve(); else reject(new ApiError(`Research failed with status ${xhr.status}`, xhr.status, xhr.responseText)); };
    xhr.onerror = () => reject(new ApiError('Unable to reach the research service.', 0));
    xhr.ontimeout = () => reject(new ApiError('Research took too long. Please retry.', 408));
    xhr.send(JSON.stringify(body));
  });
}

export async function fetchAIChats(role?: string | null): Promise<AIChat[]> {
  const payload = await apiRequest('/ai-chat', {
    query: { role: role ?? undefined },
  });
  const data = unwrapData<{ chats?: AIChat[] } | AIChat[]>(payload);
  return Array.isArray(data)
    ? data
    : data?.chats ?? normalizeList<AIChat>(payload, ['chats']);
}

export async function fetchAIChat(chatId: string): Promise<AIChat> {
  const payload = await apiRequest('/ai-chat', { query: { chatId } });
  const data = unwrapData<{ chat?: AIChat } | AIChat>(payload);
  return (
    data && typeof data === 'object' && 'chat' in data ? data.chat : data
  ) as AIChat;
}

export async function patchAIChat(input: {
  chatId: string;
  title?: string;
  status?: 'active' | 'archived';
}) {
  const payload = await apiRequest('/ai-chat', {
    method: 'PATCH',
    body: input,
  });
  return unwrapData(payload);
}

export async function deleteAIChat(chatId: string) {
  const payload = await apiRequest('/ai-chat', {
    method: 'DELETE',
    query: { chatId },
  });
  return unwrapData(payload);
}

export async function postAIChat(input: AIStreamInput) {
  const payload = await apiRequest('/ai-chat', { method: 'POST', body: input });
  return unwrapData<{
    chat?: AIChat;
    response?: { message?: string; provider?: string; model?: string };
  }>(payload);
}

export async function streamAIChat(
  input: AIStreamInput,
  onEvent: (event: Record<string, unknown>) => void,
): Promise<void> {
  if (typeof XMLHttpRequest === 'undefined') {
    const fallback = await postAIChat(input);
    onEvent({ type: 'token', content: fallback.response?.message ?? '' });
    onEvent({
      type: 'done',
      chatId: fallback.chat?._id ?? fallback.chat?.id,
      provider: fallback.response?.provider,
      model: fallback.response?.model,
    });
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
      if (error) reject(error);
      else resolve();
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
      frames.forEach(frame =>
        frame.split('\n').forEach(line => {
          if (!line.startsWith('data:')) return;
          const raw = line.replace(/^data:\s*/, '').trim();
          if (!raw || raw === '[DONE]') return;
          try {
            const event = JSON.parse(raw) as Record<string, unknown>;
            if (event.type === 'done') receivedDone = true;
            if (event.type === 'error') {
              finish(
                new ApiError(
                  String(event.message ?? 'AI service returned an error'),
                  503,
                  event,
                ),
              );
              return;
            }
            onEvent(event);
          } catch (error) {
            if (error instanceof SyntaxError)
              onEvent({ type: 'token', content: raw });
          }
        }),
      );
    };

    xhr.open('POST', buildApiUrl('/ai-chat/stream'));
    const headers = getApiHeaders({
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
    });
    Object.entries(headers).forEach(([key, value]) =>
      xhr.setRequestHeader(key, value),
    );
    xhr.timeout = 120_000;
    xhr.onprogress = () => processFrames();
    xhr.onload = () => {
      processFrames(true);
      if (xhr.status < 200 || xhr.status >= 300) {
        finish(
          new ApiError(
            `AI request failed with status ${xhr.status}`,
            xhr.status,
            xhr.responseText,
          ),
        );
        return;
      }
      if (!receivedDone) onEvent({ type: 'done' });
      finish();
    };
    xhr.onerror = () =>
      finish(
        new ApiError(
          'Unable to reach the AI service. Check your connection and retry.',
          0,
        ),
      );
    xhr.ontimeout = () =>
      finish(
        new ApiError(
          'The AI service took too long to respond. Please retry.',
          408,
        ),
      );
    xhr.onabort = () => finish(new ApiError('AI request was cancelled.', 499));
    xhr.send(JSON.stringify(input));
  });
}

export async function fetchAIProviderStatus() {
  const payload = await apiRequest('/ai-chat/status');
  return unwrapData(payload);
}

export async function generateMarketInsight(
  input: MarketInsightInput,
): Promise<MarketInsightReport> {
  const mode =
    input.reportType === 'country'
      ? 'country_rd'
      : input.reportType === 'opportunity'
      ? 'opportunity_finder'
      : 'product_rd';
  const payload = await apiRequest('/market-insights', {
    method: 'POST',
    body: {
      mode,
      productName: input.product?.trim(),
      country: input.country?.trim(),
      category: input.category?.trim(),
    },
  });
  const data = unwrapData<
    { report?: MarketInsightReport } | MarketInsightReport
  >(payload);
  const report = (
    data && typeof data === 'object' && 'report' in data ? data.report : data
  ) as MarketInsightReport;
  return {
    ...report,
    summary: report.summary ?? report.executiveSummary,
    sources:
      report.sources ??
      (report.sourceChips as string[] | undefined) ??
      (report.dataSources as string[] | undefined),
    generatedAt: report.generatedAt ?? report.createdAt,
  };
}

export type MarketInsightsDashboard = {
  products: Array<{
    id?: string;
    name: string;
    category?: string;
    subcategory?: string;
    image?: string;
  }>;
  countries: Array<{
    name: string;
    flagEmoji?: string;
    region?: string;
    capital?: string;
    gdp?: string;
    population?: string;
    currency?: string;
  }>;
  dataFreshness?: string;
};

export async function fetchMarketInsightsDashboard(): Promise<MarketInsightsDashboard> {
  const payload = await apiRequest<MarketInsightsDashboard>(
    '/market-insights',
    { cache: true, cacheTtlMs: 5 * 60_000 },
  );
  const data = unwrapData<MarketInsightsDashboard>(payload) ?? payload;
  return {
    products: Array.isArray(data?.products) ? data.products : [],
    countries: Array.isArray(data?.countries) ? data.countries : [],
    dataFreshness: data?.dataFreshness,
  };
}

export async function fetchSavedMarketResearch(): Promise<MarketInsightReport[]> {
  const payload = await apiRequest('/market-insights/reports', { cache: true, cacheTtlMs: 60_000 });
  return normalizeList<MarketInsightReport>(payload, ['reports', 'items']);
}
