const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
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
  const request = fetch(url, {
    method,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(options.body === undefined || isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
    body: options.body === undefined ? undefined : isFormData ? options.body : JSON.stringify(options.body),
    signal: options.signal,
  }).then(async (response) => {
    const payload = await readPayload(response)
    if (!response.ok) {
      const message = payload?.error || payload?.message || `Request failed with status ${response.status}`
      throw new ApiError(message, response.status, payload)
    }
    if (canCache) {
      cache.set(cacheKey, { value: payload, expiresAt: Date.now() + (options.cacheTtlMs || 30_000) })
    }
    return payload
  }).finally(() => inflight.delete(cacheKey))

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
