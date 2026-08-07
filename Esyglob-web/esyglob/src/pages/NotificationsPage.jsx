import { Bell, CheckCheck, Download, MessageSquare, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { clearReadNotifications, deleteNotification, fetchNotifications, markAllNotificationsRead, markNotificationRead } from '../api/trade'
import { resolveApiResourceUrl } from '../api/client'
import AppShell from '../components/AppShell'
import { resolveId } from '../utils/trade'
import useAsyncData from '../hooks/useAsyncData'
import { getRealtimeClient } from '../realtime/socket'
import { PageHead } from '../components/PageHead'
import { TradeSkeleton } from './RfqsPage'

export default function NotificationsPage() {
  const navigate = useNavigate()
  const query = useAsyncData(useCallback(() => fetchNotifications(), []))
  const reloadNotifications = query.reload
  useEffect(() => { let socket; const refresh = () => reloadNotifications(); getRealtimeClient().then(client => { socket = client; client.on('new_notification', refresh) }).catch(() => {}); return () => socket?.off('new_notification', refresh) }, [reloadNotifications])
  const [busy, setBusy] = useState('')
  async function all() { setBusy('all'); await markAllNotificationsRead(); await query.reload(); setBusy('') }
  async function clear() { setBusy('clear'); await clearReadNotifications(); await query.reload(); setBusy('') }
  async function open(item) { if (!item.isRead) await markNotificationRead(resolveId(item)); const path = notificationPath(item); if (path) navigate(path); else query.reload() }
  async function openPath(event, item, path) { event.stopPropagation(); if (!item.isRead) await markNotificationRead(resolveId(item)); navigate(path) }
  async function openDocument(event, item) { event.stopPropagation(); if (!item.isRead) await markNotificationRead(resolveId(item)); window.open(resolveApiResourceUrl(item.data.documentUrl), '_blank', 'noopener,noreferrer') }
  async function remove(event, item) { event.stopPropagation(); await deleteNotification(resolveId(item)); query.reload() }
  const rows = query.data?.notifications || []
  return <AppShell><div className="listing-page container trade-page"><PageHead eyebrow="Account activity" title="Notifications" description="RFQ, quotation, message, order and marketplace updates from the existing EsyGlob notification service." /><div className="trade-page-actions"><button className="button button--secondary" onClick={all} disabled={Boolean(busy)}><CheckCheck /> Mark all read</button><button className="button button--secondary" onClick={clear} disabled={Boolean(busy)}><Trash2 /> Clear read</button></div>{query.loading ? <TradeSkeleton /> : query.error ? <div className="inline-error">{query.error.message}</div> : rows.length ? <div className="notification-list">{rows.map((item) => { const rfqId = sellerRfqId(item); return <button key={resolveId(item)} className={item.isRead ? '' : 'unread'} onClick={() => open(item)}><i><NotificationIcon type={item.notificationType || item.type} /></i><div><div><h2>{item.title || 'EsyGlob update'}</h2><time>{item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}</time></div><p>{item.description || item.message}</p><span>{String(item.notificationType || item.type || 'notification').replaceAll('_', ' ')}</span>{item.data?.documentUrl && <div className="notification-actions"><span role="button" tabIndex="0" onClick={(event) => openDocument(event, item)}><Download /> Signed Final Quotation PDF</span></div>}{rfqId && <div className="notification-actions"><span role="button" tabIndex="0" onClick={(event) => openPath(event, item, `/rfqs/${rfqId}?role=seller`)}>View RFQ</span><span role="button" tabIndex="0" onClick={(event) => openPath(event, item, `/rfqs/${rfqId}?role=seller&action=quote`)}>Send quotation</span><span role="button" tabIndex="0" onClick={(event) => openPath(event, item, `/rfqs/${rfqId}?role=seller&action=chat`)}>Chat now</span></div>}</div><em /><span role="button" tabIndex="0" onClick={(event) => remove(event, item)}><Trash2 /></span></button> })}</div> : <div className="empty-results"><Bell /><h2>You’re all caught up</h2><p>New RFQs, quotations, messages and orders will appear here.</p></div>}</div></AppShell>
}

function NotificationIcon({ type = '' }) { return String(type).includes('message') ? <MessageSquare /> : <Bell /> }
function sellerRfqId(item) {
  if (String(item.notificationType || item.type || '').toLowerCase() !== 'rfq_created') return ''
  const data = item.data || item.metadata || {}
  return resolveId(item.rfqId || data.rfqId || (String(data.relatedModel || '').toLowerCase() === 'rfq' ? data.relatedId : ''))
}
function notificationPath(item) {
  const data = item.data || item.metadata || {}
  const type = String(item.notificationType || item.type || '').toLowerCase()
  const relatedId = resolveId(data.relatedId)
  const model = String(data.relatedModel || '').toLowerCase()
  const chat = resolveId(item.chatId || data.chatId) || (model === 'chat' ? relatedId : '')
  const quotation = resolveId(item.quotationId || data.quotationId) || (model === 'quotation' ? relatedId : '')
  const rfq = resolveId(item.rfqId || data.rfqId) || (model === 'rfq' ? relatedId : '')
  const order = resolveId(item.orderId || data.orderId) || (model === 'order' ? relatedId : '')
  const product = resolveId(item.productId || data.productId) || (model === 'product' ? relatedId : '')
  const seller = resolveId(item.sellerId || data.sellerId) || (model === 'seller' ? relatedId : '')
  if (chat) return `/messages/${chat}`
  const sellerQuotationTypes = ['quotation_counter_offer', 'quotation_revision_requested', 'quotation_accepted', 'quotation_rejected']
  if (quotation) return `/quotations/${quotation}${sellerQuotationTypes.includes(type) ? '?role=seller' : ''}`
  if (rfq) return `/rfqs/${rfq}${type === 'rfq_created' ? '?role=seller' : ''}`
  if (order) return `/orders/${order}`
  if (product) return `/products/${product}`
  if (seller) return `/sellers/${seller}`
  return ''
}
