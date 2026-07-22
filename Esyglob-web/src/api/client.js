const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || '/api').trim().replace(/\/$/, '')
const cache = new Map()
const inflight = new Map()

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
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
          const message = payload?.error || payload?.message || `Request failed with status ${response.status}`
          const error = new ApiError(message, response.status, payload)
          if (attempt + 1 < attempts && [502, 503, 504].includes(response.status)) {
            await new Promise((resolve) => window.setTimeout(resolve, 250))
            continue
          }
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
        if (error?.name === 'AbortError') throw new ApiError('The request timed out. Please retry.', 0)
        if (error instanceof TypeError) throw new ApiError('Unable to reach EsyGlob. Check your connection and retry.', 0)
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
