import { config } from '../config/env';
import { appStorage } from '../storage/appStorage';

const SESSION_KEY = 'session.cookie';
const ACCESS_TOKEN_KEY = 'auth.accessToken';

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
};

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
  const text = await response.text();

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
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = getApiHeaders(options.headers);

  if (!isFormData && options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(buildApiUrl(path, options.query), {
    method: options.method ?? 'GET',
    headers,
    credentials: 'include',
    body:
      options.body === undefined
        ? undefined
        : isFormData
          ? (options.body as BodyInit_)
          : JSON.stringify(options.body),
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

  return payload as T;
}

export function getApiHeaders(extra?: Record<string, string>) {
  const sessionCookie = appStorage.getString(SESSION_KEY);
  const accessToken = appStorage.getString(ACCESS_TOKEN_KEY);
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...extra,
  };

  if (sessionCookie) {
    headers.Cookie = sessionCookie;
  }

  if (accessToken && !headers.Authorization) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return headers;
}

export function clearSessionCookie() {
  appStorage.remove(SESSION_KEY);
}

export function setAuthTokens(accessToken?: string) {
  if (accessToken) {
    appStorage.set(ACCESS_TOKEN_KEY, accessToken);
  }
}

export function clearAuthTokens() {
  appStorage.remove(ACCESS_TOKEN_KEY);
}

export function hasAuthCredentials() {
  return Boolean(appStorage.getString(ACCESS_TOKEN_KEY) || appStorage.getString(SESSION_KEY));
}
