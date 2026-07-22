import { ApiError, apiRequest, buildApiUrl, normalizeList, unwrapData } from './client'

export async function fetchProfile() {
  const data = unwrapData(await apiRequest('/profile', { cache: false })) || {}
  return data.profile || data
}
export async function updateProfile(input) { return unwrapData(await apiRequest('/profile', { method: 'PATCH', body: input })) }
export async function updatePreferredCurrency(currency) { return unwrapData(await apiRequest('/profile/currency', { method: 'PATCH', body: { currency } })) }
export async function changePassword(input) { return unwrapData(await apiRequest('/profile/password', { method: 'PATCH', body: input })) }

export async function fetchAddresses() { return normalizeList(await apiRequest('/addresses', { cache: false }), ['addresses', 'items']) }
export async function createAddress(input) { return unwrapData(await apiRequest('/addresses', { method: 'POST', body: input })) }
export async function updateAddress(id, input) { return unwrapData(await apiRequest(`/addresses/${id}`, { method: 'PUT', body: input })) }
export async function setDefaultAddress(id) { return unwrapData(await apiRequest(`/addresses/${id}`, { method: 'PATCH', body: { isDefault: true } })) }
export async function deleteAddress(id) { return unwrapData(await apiRequest(`/addresses/${id}`, { method: 'DELETE' })) }

export async function fetchLocation() { return unwrapData(await apiRequest('/location', { cache: false })) }
export async function updateLocation(input) { return unwrapData(await apiRequest('/location', { method: 'PUT', body: input })) }
export async function updateLocationAddress(input) { return unwrapData(await apiRequest('/location/address', { method: 'PATCH', body: input })) }
export async function toggleLocationTracking(isActive) { return unwrapData(await apiRequest('/location/toggle', { method: 'PUT', body: { isActive } })) }

export async function fetchWallet(role) { return unwrapData(await apiRequest('/wallet', { query: { role }, cache: false })) || {} }
export async function addPaymentMethod(input) { return unwrapData(await apiRequest('/wallet/payment-methods', { method: 'POST', body: input })) }
export async function requestWithdrawal(input) { return unwrapData(await apiRequest('/wallet/withdrawals', { method: 'POST', body: input })) }

export async function fetchAIChats(role) { return normalizeList(await apiRequest('/ai-chat', { query: { role }, cache: false }), ['chats', 'items']) }
export async function fetchAIChat(chatId) {
  const data = unwrapData(await apiRequest('/ai-chat', { query: { chatId }, cache: false })) || {}
  return data.chat || data
}
export async function sendAIMessage(input) { return unwrapData(await apiRequest('/ai-chat', { method: 'POST', body: input })) || {} }
export async function streamAIMessage(input, onEvent, signal) {
  const response = await fetch(buildApiUrl('/ai-chat/stream'), {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  })
  if (!response.ok) {
    const raw = await response.text().catch(() => '')
    let payload = raw
    try { payload = JSON.parse(raw) } catch { /* Preserve the plain-text error response. */ }
    throw new ApiError(payload?.error || payload?.message || `Request failed with status ${response.status}`, response.status, payload)
  }
  if (!response.body) throw new ApiError('Streaming is not supported by this browser.', 0)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const dispatch = (frame) => {
    const data = frame.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n')
    if (!data) return
    try { onEvent(JSON.parse(data)) } catch { /* Ignore malformed heartbeat frames. */ }
  }
  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
    const frames = buffer.split(/\r?\n\r?\n/)
    buffer = frames.pop() || ''
    frames.forEach(dispatch)
    if (done) break
  }
  if (buffer.trim()) dispatch(buffer)
}
export async function updateAIChat(input) { return unwrapData(await apiRequest('/ai-chat', { method: 'PATCH', body: input })) }
export async function deleteAIChat(chatId) { return unwrapData(await apiRequest('/ai-chat', { method: 'DELETE', query: { chatId } })) }

export async function fetchMarketInsights() { return unwrapData(await apiRequest('/market-insights', { cache: false })) || {} }
export async function fetchMarketReports() { return normalizeList(await apiRequest('/market-insights/reports', { cache: false }), ['reports', 'items']) }
export async function generateMarketInsight(input) {
  const data = unwrapData(await apiRequest('/market-insights', { method: 'POST', body: input })) || {}
  return data.report || data
}

export async function fetchSellerProducts(params = {}) {
  const payload = await apiRequest('/products', { query: { type: 'seller', limit: 30, ...params }, cache: false })
  const data = unwrapData(payload) || {}
  return { products: normalizeList(payload, ['products', 'items']), pagination: data.pagination }
}
export async function createSellerProduct(input) {
  const data = unwrapData(await apiRequest('/products', { method: 'POST', body: input })) || {}
  return data.product || data
}
export async function updateSellerProduct(id, input) {
  const data = unwrapData(await apiRequest(`/products/${id}`, { method: 'PATCH', body: input })) || {}
  return data.product || data
}
export async function deleteSellerProduct(id) { return unwrapData(await apiRequest(`/products/${id}`, { method: 'DELETE' })) }
