const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || '/api').trim().replace(/\/$/, '')
const cache = new Map()
const inflight = new Map()

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
    this.code = details?.code || 'REQUEST_FAILED'
    this.fieldErrors = details?.fieldErrors || {}
    this.requestId = details?.requestId || ''
    this.retryable = status === 0 || [408, 429, 502, 503, 504].includes(status)
  }
}

export function buildApiUrl(path, query) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const url = new URL(`${API_BASE_URL}${normalizedPath}`, window.location.origin)
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
  })
  return url.toString()
}

export function resolveApiResourceUrl(value) {
  if (!value || typeof value !== 'string') return value
  const source = value.trim()
  if (!source || /^(?:data:|blob:|mailto:|tel:)/i.test(source)) return source
  try {
    const absolute = new URL(source)
    return absolute.toString()
  } catch {
    const apiUrl = new URL(API_BASE_URL, window.location.origin)
    if (source === '/api' || source.startsWith('/api/')) {
      const suffix = source.slice(4)
      return new URL(`${apiUrl.pathname.replace(/\/$/, '')}${suffix}`, apiUrl.origin).toString()
    }
    if (source.startsWith('/')) return new URL(source, apiUrl.origin).toString()
    return new URL(source, `${apiUrl.origin}/`).toString()
  }
}

async function readPayload(response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export async function apiRequest(path, options = {}) {
  const method = options.method || 'GET'
  const url = buildApiUrl(path, options.query)
  const cacheKey = `${method}:${url}`
  const canCache = method === 'GET' && options.cache !== false
  const cached = canCache ? cache.get(cacheKey) : null

  if (cached?.expiresAt > Date.now()) return cached.value
  if (canCache && inflight.has(cacheKey)) return inflight.get(cacheKey)
  if (!canCache) cache.clear()

  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
  const request = (async () => {
    const attempts = method === 'GET' && options.retry !== false ? 2 : 1
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const controller = new AbortController()
      const abort = () => controller.abort(options.signal?.reason)
      if (options.signal?.aborted) abort()
      else options.signal?.addEventListener('abort', abort, { once: true })
      const timeout = window.setTimeout(() => controller.abort('timeout'), options.timeoutMs || (isFormData ? 120_000 : 30_000))
      try {
        const response = await fetch(url, {
          method,
          credentials: 'include',
          headers: {
            Accept: 'application/json',
            ...(options.body === undefined || isFormData ? {} : { 'Content-Type': 'application/json' }),
            ...options.headers,
          },
          body: options.body === undefined ? undefined : isFormData ? options.body : JSON.stringify(options.body),
          signal: controller.signal,
        })
        const payload = await readPayload(response)
        if (!response.ok) {
          const message = readableApiError(response.status, payload)
          const error = new ApiError(message, response.status, payload)
          if (attempt + 1 < attempts && [502, 503, 504].includes(response.status)) {
            await new Promise((resolve) => window.setTimeout(resolve, 250))
            continue
          }
          announceRequestError(error, method, options)
          throw error
        }
        if (canCache) cache.set(cacheKey, { value: payload, expiresAt: Date.now() + (options.cacheTtlMs || 30_000) })
        return payload
      } catch (error) {
        if (options.signal?.aborted) throw error
        if (attempt + 1 < attempts && (error instanceof TypeError || error?.name === 'AbortError')) {
          await new Promise((resolve) => window.setTimeout(resolve, 250))
          continue
        }
        if (error?.name === 'AbortError') {
          const timeoutError = new ApiError('The request timed out. Please retry.', 0, { code: 'REQUEST_TIMEOUT' })
          announceRequestError(timeoutError, method, options)
          throw timeoutError
        }
        if (error instanceof TypeError) {
          const networkError = new ApiError('Unable to reach EsyGlob. Check your connection and retry.', 0, { code: 'NETWORK_ERROR' })
          announceRequestError(networkError, method, options)
          throw networkError
        }
        throw error
      } finally {
        window.clearTimeout(timeout)
        options.signal?.removeEventListener('abort', abort)
      }
    }
    throw new ApiError('Unable to complete the request. Please retry.', 0)
  })().finally(() => inflight.delete(cacheKey))

  if (canCache) inflight.set(cacheKey, request)
  return request
}

function readableApiError(status, payload) {
  if (status >= 500) return 'EsyGlob is temporarily unable to complete this request. Please retry.'
  const serverMessage = String(payload?.error || payload?.message || '').trim()
  const technical = /(?:\b(?:ECONN|ETIMEDOUT|Mongo(?:DB)?|Mongoose|Ollama|stack|trace|SQL|BSON|TypeError|ReferenceError|SyntaxError|AxiosError|502|503|500)\b|route\s+not\s+found|cannot\s+(?:read|access)|\bundefined\b|\bnull\b)/i
  if (serverMessage && !technical.test(serverMessage)) return serverMessage
  if (status === 401) return 'Your session has expired. Please sign in again.'
  if (status === 403) return 'You do not have permission to complete this action.'
  if (status === 404) return 'The requested information could not be found.'
  if (status === 409) return 'This information already exists or was updated elsewhere.'
  if (status === 422) return 'Please review the highlighted information and try again.'
  if (status === 429) return 'Too many requests. Please wait a moment and retry.'
  return 'Unable to complete this request. Please try again.'
}

function announceRequestError(error, method, options) {
  if (options.toastErrors === false || typeof window === 'undefined') return
  const shouldAnnounce = error.status === 0 || error.status === 401 || error.status === 403 || error.status === 429 || error.status >= 500
  if (!shouldAnnounce) return
  window.dispatchEvent(new CustomEvent('esyglob:toast', {
    detail: {
      type: 'error',
      message: error.message,
      action: error.retryable && typeof options.onRetry === 'function'
        ? { label: 'Retry', onClick: options.onRetry }
        : undefined,
      duration: method === 'GET' ? 5200 : 6500,
    },
  }))
}

export function clearApiCache() {
  cache.clear()
  inflight.clear()
}

export function unwrapData(payload) {
  if (payload?.data !== undefined) return payload.data
  return payload
}

export function normalizeList(payload, keys) {
  const data = unwrapData(payload)
  if (Array.isArray(data)) return data
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key]
  }
  return []
}
