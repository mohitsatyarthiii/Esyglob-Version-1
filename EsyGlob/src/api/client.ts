import { config } from '../config/env';
import { appStorage } from '../storage/appStorage';
import { logPerf, perfNow } from '../utils/performance';

const SESSION_KEY = 'session.cookie';

export class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined | null>;
  cache?: boolean;
  cacheTtlMs?: number;
};

const DEFAULT_GET_CACHE_TTL_MS = 20_000;
const responseCache = new Map<string, { expiresAt: number; value: unknown }>();
const inflightRequests = new Map<string, Promise<unknown>>();
let cacheGeneration = 0;

export function buildApiUrl(path: string, query?: RequestOptions['query']) {
  const url = new URL(path.startsWith('http') ? path : `${config.apiBaseUrl}${path}`);

  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
}

function extractSessionCookie(headers: Headers) {
  const rawCookie = headers.get('set-cookie');

  if (!rawCookie) {
    return;
  }

  const session = rawCookie
    .split(',')
    .map(part => part.trim())
    .find(part => part.startsWith(`${config.sessionCookieName}=`));

  if (!session) {
    return;
  }

  const cookiePair = session.split(';')[0];

  if (cookiePair.endsWith('=')) {
    appStorage.remove(SESSION_KEY);
  } else {
    appStorage.set(SESSION_KEY, cookiePair);
  }
}

async function parseResponse(response: Response) {
  const parseStart = perfNow();
  const text = await response.text();
  logPerf('api:parse', {
    url: response.url,
    status: response.status,
    bytes: text.length,
    ms: Math.round(perfNow() - parseStart),
  });

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const requestGeneration = cacheGeneration;
  const requestStart = perfNow();
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = getApiHeaders(options.headers);
  const method = options.method ?? 'GET';

  if (!isFormData && options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const url = buildApiUrl(path, options.query);
  const canCache = method === 'GET' && options.cache !== false;
  const cacheKey = canCache ? buildRequestCacheKey(method, url, headers) : '';

  if (canCache) {
    const cached = responseCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      logPerf('api:cache-hit', {
        method,
        path,
        url,
        ms: Math.round(perfNow() - requestStart),
      });
      return cached.value as T;
    }

    const inflight = inflightRequests.get(cacheKey);

    if (inflight) {
      logPerf('api:dedupe-hit', {
        method,
        path,
        url,
        ms: Math.round(perfNow() - requestStart),
      });
      return inflight as Promise<T>;
    }
  } else if (method !== 'GET') {
    responseCache.clear();
  }

  logPerf('api:start', { method, path, url });

  const request = fetch(url, {
    method,
    headers,
    credentials: 'include',
    body:
      options.body === undefined
        ? undefined
        : isFormData
          ? (options.body as BodyInit_)
          : JSON.stringify(options.body),
  })
    .then(async response => {
      logPerf('api:response', {
        method,
        path,
        url,
        status: response.status,
        ms: Math.round(perfNow() - requestStart),
      });
      extractSessionCookie(response.headers);
      const payload = await parseResponse(response);

      if (!response.ok) {
        const message =
          typeof payload === 'object' && payload && 'message' in payload
            ? String((payload as { message?: unknown }).message)
            : `Request failed with status ${response.status}`;

        throw new ApiError(message, response.status, payload);
      }

      if (canCache && requestGeneration === cacheGeneration) {
        responseCache.set(cacheKey, {
          expiresAt: Date.now() + (options.cacheTtlMs ?? DEFAULT_GET_CACHE_TTL_MS),
          value: payload,
        });
      }

      return payload;
    })
    .finally(() => {
      logPerf('api:done', {
        method,
        path,
        url,
        ms: Math.round(perfNow() - requestStart),
      });
      if (canCache) {
        inflightRequests.delete(cacheKey);
      }
    });

  if (canCache) {
    inflightRequests.set(cacheKey, request);
  }

  return request as Promise<T>;
}

export function getApiHeaders(extra?: Record<string, string>) {
  const sessionCookie = appStorage.getString(SESSION_KEY);
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...extra,
  };

  if (sessionCookie) {
    headers.Cookie = sessionCookie;
  }

  return headers;
}

export function clearSessionCookie() {
  appStorage.remove(SESSION_KEY);
  responseCache.clear();
}

export function clearApiSessionCache() {
  cacheGeneration += 1;
  responseCache.clear();
  inflightRequests.clear();
}

export function clearAuthTokens() {
  clearApiSessionCache();
}

export function hasAuthCredentials() {
  return Boolean(appStorage.getString(SESSION_KEY));
}

export function getSessionToken() {
  const cookie = appStorage.getString(SESSION_KEY) ?? '';
  const separator = cookie.indexOf('=');
  return separator >= 0 ? cookie.slice(separator + 1) : cookie;
}

function buildRequestCacheKey(method: string, url: string, headers: Record<string, string>) {
  return [
    method,
    url,
    headers.Cookie ?? '',
  ].join('|');
}
