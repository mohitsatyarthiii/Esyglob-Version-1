import { ApiError, apiRequest, buildApiUrl, normalizeList, unwrapData } from './client'

export async function fetchProfile() {
  const data = unwrapData(await apiRequest('/profile', { cache: false })) || {}
  return data.profile || data
}
export async function updateProfile(input) { return unwrapData(await apiRequest('/profile', { method: 'PATCH', body: input })) }
export async function updatePreferredCurrency(currency) { return unwrapData(await apiRequest('/profile/currency', { method: 'PATCH', body: { currency } })) }
export async function updatePreferredLanguage(language) { return unwrapData(await apiRequest('/profile/language', { method: 'PATCH', body: { language } })) }
export async function changePassword(input) { return unwrapData(await apiRequest('/profile/password', { method: 'PATCH', body: input })) }

export async function fetchAddresses() { return normalizeList(await apiRequest('/addresses', { cache: false }), ['addresses', 'items']) }
export async function createAddress(input) { return unwrapData(await apiRequest('/addresses', { method: 'POST', body: input })) }
export async function updateAddress(id, input) { return unwrapData(await apiRequest(`/addresses/${id}`, { method: 'PUT', body: input })) }
export async function setDefaultAddress(id) { return unwrapData(await apiRequest(`/addresses/${id}`, { method: 'PATCH', body: { isDefault: true } })) }
export async function deleteAddress(id) { return unwrapData(await apiRequest(`/addresses/${id}`, { method: 'DELETE' })) }
export async function updateCurrentAddress(input) { return unwrapData(await apiRequest('/addresses/current', { method: 'PUT', body: input })) }

export async function searchAddressSuggestions(input, sessionToken, countryCodes = '') {
  return unwrapData(await apiRequest('/location/autocomplete/search', { query: { input, sessionToken, countryCodes }, cache: false })) || {}
}
export async function resolveAddressSuggestion(placeId, sessionToken) {
  return unwrapData(await apiRequest('/location/autocomplete/resolve', { query: { placeId, sessionToken }, cache: false })) || {}
}
export async function reverseAddressCoordinates(latitude, longitude, refresh = false) {
  return unwrapData(await apiRequest('/location/autocomplete/reverse', { query: { latitude, longitude, refresh: refresh ? '1' : undefined }, cache: false })) || {}
}

export async function fetchWallet(role) { return unwrapData(await apiRequest('/wallet', { query: { role }, cache: false })) || {} }
export async function addPaymentMethod(input) { return unwrapData(await apiRequest('/wallet/payment-methods', { method: 'POST', body: input })) }
export async function managePaymentMethod(id, input) { return unwrapData(await apiRequest(`/wallet/payment-methods/${id}`, { method: 'PATCH', body: input })) }
export async function removePaymentMethod(id, role) { return unwrapData(await apiRequest(`/wallet/payment-methods/${id}`, { method: 'DELETE', query: { role } })) }
export async function requestWithdrawal(input) { return unwrapData(await apiRequest('/wallet/withdrawals', { method: 'POST', body: input })) }
export async function fetchInvoices() { return normalizeList(await apiRequest('/invoices', { cache: false }), ['invoices', 'items']) }
export async function fetchDocuments() { return normalizeList(await apiRequest('/documents', { cache: false }), ['documents', 'items']) }
export async function createDocument(input) { return unwrapData(await apiRequest('/documents', { method: 'POST', body: input })) }
export async function archiveDocument(id) { return unwrapData(await apiRequest(`/documents/${id}`, { method: 'DELETE' })) }
export async function completeBuyerOnboarding(input) { return unwrapData(await apiRequest('/profile/buyer-onboarding', { method: 'POST', body: input })) }

export async function fetchAIChats(role) { return normalizeList(await apiRequest('/ai-chat', { query: { role }, cache: false }), ['chats', 'items']) }
export async function fetchAIChat(chatId) {
  const data = unwrapData(await apiRequest('/ai-chat', { query: { chatId }, cache: false })) || {}
  return data.chat || data
}
export async function sendAIMessage(input) { return unwrapData(await apiRequest('/ai-chat', { method: 'POST', body: input, headers: { 'X-AI-Request-Id': globalThis.crypto?.randomUUID?.() || `ai-${Date.now()}` } })) || {} }
export async function streamAIMessage(input, onEvent, signal) {
  const requestId = globalThis.crypto?.randomUUID?.() || `ai-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const transportStartedAt = globalThis.performance?.now?.() ?? Date.now()
  const response = await fetch(buildApiUrl('/ai-chat/stream'), {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json', 'X-AI-Request-Id': requestId },
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
  onEvent({ type: 'transport', requestId, timing: { headersMs: (globalThis.performance?.now?.() ?? Date.now()) - transportStartedAt } })
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let completed = false
  const dispatch = (frame) => {
    const data = frame.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n')
    if (!data) return
    let event
    try { event = JSON.parse(data) }
    catch { throw new ApiError('The response stream was interrupted. Please retry.', 0) }
    if (event?.type === 'done') completed = true
    onEvent(event)
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
  if (!completed) throw new ApiError('The response connection closed before completion. Please retry.', 0)
}
export async function updateAIChat(input) { return unwrapData(await apiRequest('/ai-chat', { method: 'PATCH', body: input })) }
export async function deleteAIChat(chatId) { return unwrapData(await apiRequest('/ai-chat', { method: 'DELETE', query: { chatId } })) }

export async function fetchMarketInsights() { return unwrapData(await apiRequest('/market-insights', { cache: false })) || {} }
export async function fetchMarketReports(page = 1, limit = 12) {
  const data = unwrapData(await apiRequest('/market-insights/reports', { query: { page, limit }, cache: false })) || {}
  return {
    reports: normalizeList(data, ['reports', 'items']),
    pagination: data.pagination || { page, limit, total: 0, pages: 1, hasMore: false },
  }
}
export async function fetchMarketReport(reportId) {
  const data = unwrapData(await apiRequest(`/market-insights/reports/${reportId}`, { cache: false })) || {}
  return data.report || data
}
export async function streamMarketResearch(input, onEvent, signal) {
  const requestId = globalThis.crypto?.randomUUID?.() || `insight-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const response = await fetch(buildApiUrl('/market-insights/research/stream'), {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json', 'X-AI-Request-Id': requestId },
    body: JSON.stringify(input),
    signal,
  })
  if (!response.ok) {
    const raw = await response.text().catch(() => '')
    let payload = raw
    try { payload = JSON.parse(raw) } catch { /* Keep plain-text server errors. */ }
    throw new ApiError(payload?.error || payload?.message || `Request failed with status ${response.status}`, response.status, payload)
  }
  if (!response.body) throw new ApiError('Streaming report generation is not supported by this browser.', 0)
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
export function marketReportPdfUrl(reportId, download = false) {
  return buildApiUrl(`/market-insights/reports/${reportId}/pdf`, download ? { download: 1 } : undefined)
}
export async function fetchMarketReportPdf(reportId, download = false, signal) {
  const response = await fetch(marketReportPdfUrl(reportId, download), {
    credentials: 'include',
    headers: { Accept: 'application/pdf' },
    signal,
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new ApiError(payload?.error || 'The PDF could not be loaded.', response.status, payload)
  }
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.toLowerCase().includes('application/pdf')) throw new ApiError('The server returned an invalid PDF response.', 500)
  return {
    blob: await response.blob(),
    filename: response.headers.get('content-disposition')?.match(/filename="([^"]+)"/i)?.[1] || 'EsyGlob-Market-Insight.pdf',
  }
}
export async function shareMarketReport(reportId) {
  return unwrapData(await apiRequest(`/market-insights/reports/${reportId}/share`, { method: 'POST' })) || {}
}
export async function deleteMarketReport(reportId) {
  return unwrapData(await apiRequest(`/market-insights/reports/${reportId}`, { method: 'DELETE' })) || {}
}
export async function regenerateMarketReport(reportId) {
  return unwrapData(await apiRequest(`/market-insights/reports/${reportId}/regenerate`, { method: 'POST', headers: { 'X-AI-Request-Id': globalThis.crypto?.randomUUID?.() || `insight-${Date.now()}` } })) || {}
}
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
export async function previewBulkSellerProducts(file, status = 'draft') {
  const body = new FormData()
  body.append('file', file)
  body.append('status', status)
  return unwrapData(await apiRequest('/products/bulk/import/preview', {
    method: 'POST',
    body,
    timeoutMs: 120_000,
    cache: false,
  })) || {}
}
export async function executeBulkSellerProducts(importId) {
  return unwrapData(await apiRequest('/products/bulk/import/execute', {
    method: 'POST',
    body: { importId },
    timeoutMs: 120_000,
    cache: false,
  })) || {}
}
export async function fetchBulkSellerProductHistory(limit = 10) {
  const data = unwrapData(await apiRequest('/products/bulk/import/history', {
    query: { limit },
    cache: false,
  })) || {}
  return normalizeList(data, ['imports', 'items'])
}
export function bulkSellerProductTemplateUrl(type = 'xlsx') {
  return buildApiUrl('/products/bulk/import/template', { type })
}
