import { apiRequest, normalizeList, unwrapData } from './client'

function entity(payload, key) {
  const data = unwrapData(payload)
  return data?.[key] || data
}

export async function fetchRfqs(params = {}) {
  const payload = await apiRequest('/rfqs', { query: { ...params, q: params.q || params.search, scope: params.scope === 'public' ? undefined : params.scope, limit: params.limit || 30 }, cache: false })
  const data = unwrapData(payload)
  return { rfqs: normalizeList(payload, ['rfqs', 'items', 'results']), pagination: data?.pagination }
}

export async function fetchRfq(id) { return unwrapData(await apiRequest(`/rfqs/${id}`, { cache: false })) }
export async function createRfq(input) { return entity(await apiRequest('/rfqs', { method: 'POST', body: input }), 'rfq') }
export async function updateRfq(id, input) { return entity(await apiRequest(`/rfqs/${id}`, { method: 'PATCH', body: input }), 'rfq') }
export async function archiveRfq(id) { return unwrapData(await apiRequest(`/rfqs/${id}`, { method: 'DELETE' })) }

export async function fetchQuotations(params = {}) {
  const payload = await apiRequest('/quotations', { query: { ...params, limit: params.limit || 40 }, cache: false })
  const data = unwrapData(payload)
  return { quotations: normalizeList(payload, ['quotations', 'items']), pagination: data?.pagination }
}
export async function fetchQuotation(id) { return entity(await apiRequest(`/quotations/${id}`, { cache: false }), 'quotation') }
export async function createQuotation(input) { return entity(await apiRequest('/quotations', { method: 'POST', body: input }), 'quotation') }
export async function updateQuotation(id, input) { return entity(await apiRequest(`/quotations/${id}`, { method: 'PATCH', body: input }), 'quotation') }
export async function respondToQuotation(id, action, input = {}) { return unwrapData(await apiRequest(`/quotations/${id}`, { method: 'PUT', body: { action, ...input } })) }

export async function fetchChats(params = {}) { return normalizeList(await apiRequest('/chat', { query: { ...params, view: params.view === 'all' ? undefined : params.view, limit: params.limit || 60 }, cache: false }), ['chats', 'conversations', 'items']) }
export async function fetchChat(id, params = {}) { return unwrapData(await apiRequest(`/chat/${id}`, { query: { limit: 50, ...params }, cache: false })) }
export async function sendMessage(id, input) { return entity(await apiRequest(`/chat/${id}`, { method: 'POST', body: typeof input === 'string' ? { content: input } : input }), 'message') }
export async function chatAction(id, action, value) { return unwrapData(await apiRequest(`/chat/${id}`, { method: 'PATCH', body: { action, value } })) }
export async function createChat(input) { return unwrapData(await apiRequest('/chat', { method: 'POST', body: input })) }
export async function createGroupChat(input) { return unwrapData(await apiRequest('/chat/group', { method: 'POST', body: input })) }

export async function fetchNotifications(params = {}) {
  const payload = await apiRequest('/notifications', { query: { limit: 50, ...params }, cache: false })
  const data = unwrapData(payload) || {}
  return { notifications: normalizeList(payload, ['notifications', 'items']), unreadCount: data.unreadCount || 0, pagination: data.pagination }
}
export async function fetchUnreadNotificationCount() {
  const data = unwrapData(await apiRequest('/notifications/unread-count', { cache: false })) || {}
  return Number(data.unreadCount || 0)
}
export async function markNotificationRead(id) { return unwrapData(await apiRequest(`/notifications/${id}`, { method: 'PATCH' })) }
export async function deleteNotification(id) { return unwrapData(await apiRequest(`/notifications/${id}`, { method: 'DELETE' })) }
export async function markAllNotificationsRead() { return unwrapData(await apiRequest('/notifications/bulk', { method: 'PATCH', body: { action: 'mark_all_read' } })) }
export async function clearReadNotifications() { return unwrapData(await apiRequest('/notifications/bulk', { method: 'DELETE', query: { scope: 'read' } })) }

export async function uploadFiles(files, folder) {
  const form = new FormData()
  Array.from(files).forEach((file) => form.append('files', file))
  form.append('folder', folder)
  const data = unwrapData(await apiRequest('/upload', { method: 'POST', body: form })) || {}
  return data.uploads || data.files || []
}

export async function fetchOrders(params = {}) { return normalizeList(await apiRequest('/orders', { query: { ...params, limit: 80 }, cache: false }), ['orders', 'items', 'results']) }
export async function fetchOrder(id) { return entity(await apiRequest(`/orders/${id}`, { cache: false }), 'order') }
export async function fetchSellerOrderQueue(params = {}) { return normalizeList(await apiRequest('/orders/seller-queue', { query: params, cache: false }), ['items']) }
export async function startSellerOrder(input) { return entity(await apiRequest('/orders/start', { method: 'POST', body: input }), 'order') }
export async function updateOrder(id, input) { return entity(await apiRequest(`/orders/${id}`, { method: 'PATCH', body: input }), 'order') }
export async function addProductionUpdate(id, input) { return entity(await apiRequest(`/orders/${id}/production-updates`, { method: 'POST', body: input }), 'order') }
export async function buyerOrderAction(id, input) { return entity(await apiRequest(`/orders/${id}/buyer-action`, { method: 'POST', body: input }), 'order') }
export async function fetchTradeWorkspace(entityType, id) { return unwrapData(await apiRequest(`/trade-workspace/${entityType}/${id}`, { cache: false })) }
export async function fetchUnifiedTradeWorkspace(entityType, id) { return unwrapData(await apiRequest(`/trade-workspace/trade/${entityType}/${id}`, { cache: false })) }
export async function addTradeNote(entityType, id, input) { return unwrapData(await apiRequest(`/trade-workspace/${entityType}/${id}/notes`, { method: 'POST', body: input })) }
export async function createTradeDocument(entityType, id, input) { return unwrapData(await apiRequest(`/trade-workspace/${entityType}/${id}/documents`, { method: 'POST', body: input })) }
export async function signTradeDocument(entityType, id, documentId, input) { return unwrapData(await apiRequest(`/trade-workspace/${entityType}/${id}/documents/${documentId}/sign`, { method: 'POST', body: input })) }
export async function fetchCheckoutQuote(input) { const data = unwrapData(await apiRequest('/checkout/quote', { method: 'POST', body: input })) || {}; return data.quote || data }
export async function createTradeOrder(input) { return entity(await apiRequest('/orders', { method: 'POST', body: input }), 'order') }
export async function createSampleOrder(input) { return entity(await apiRequest('/orders/sample', { method: 'POST', body: input }), 'order') }
export async function initiatePayment(orderId) { return unwrapData(await apiRequest('/payments/initiate', { method: 'POST', body: { orderId } })) }
export async function verifyPayment(input) { return unwrapData(await apiRequest('/payments/verify/order', { method: 'POST', body: input })) }
