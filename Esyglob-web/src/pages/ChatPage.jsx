import { ArrowLeft, Camera, Check, CheckCheck, FileText, Image, MessageSquare, MoreVertical, Paperclip, Plus, Send, Store, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { chatAction, fetchChat, sendMessage, uploadFiles } from '../api/trade'
import { useAuth } from '../auth/auth-context'
import AppShell from '../components/AppShell'
import { Money, StatusBadge } from '../components/TradeUI'
import { displayName, resolveId } from '../utils/trade'
import { getRealtimeClient } from '../realtime/socket'

function avatarUrl(value) { return value?.avatarUrl || value?.profileImage || value?.avatar || value?.image || '' }

export default function ChatPage() {
  const { chatId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [state, setState] = useState({ loading: true, data: null, error: '' })
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [liveOnline, setLiveOnline] = useState(null)
  const [typing, setTyping] = useState(false)
  const endRef = useRef(null)
  const imageRef = useRef(null)
  const cameraRef = useRef(null)
  const documentRef = useRef(null)
  const socketRef = useRef(null)
  const typingTimerRef = useRef(null)
  const currentId = String(user?.id || user?._id || '')

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setState((current) => ({ ...current, loading: true, error: '' }))
    try { const data = await fetchChat(chatId, { markRead: true }); setState((current) => ({ loading: false, data: quiet && !data.chat ? { ...current.data, messages: data.messages || current.data?.messages || [] } : data, error: '' })) }
    catch (error) { if (!quiet) setState({ loading: false, data: null, error: error.message }) }
  }, [chatId])
  useEffect(() => { Promise.resolve().then(() => load()); const timer = setInterval(() => load(true), 3500); return () => { clearInterval(timer) } }, [load])
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: state.loading ? 'auto' : 'smooth' })
  }, [state.data?.messages?.length, state.loading])

  const chat = state.data?.chat || {}
  const isBuyer = resolveId(chat.buyerId) === currentId
  const other = isBuyer ? chat.sellerId : chat.buyerId
  const participant = chat.chatType === 'group' ? chat.groupName : displayName(other, 'Conversation')
  const participantAvatar = avatarUrl(other)
  const messages = useMemo(() => state.data?.messages || [], [state.data?.messages])
  const blocked = isBuyer ? chat.buyerBlockedAt : chat.sellerBlockedAt
  const sellerProfile = state.data?.sellerProfile
  const otherId = resolveId(other)
  const isOnline = liveOnline ?? Boolean(other?.isOnline || sellerProfile?.isOnline)
  const lastActive = other?.lastActiveAt || sellerProfile?.lastActiveAt
  const presence = typing ? 'Typing…' : isOnline ? 'Online' : lastActive ? `Last active ${new Date(lastActive).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}` : 'Live message updates'

  useEffect(() => {
    if (!chatId || !otherId) return
    let live = true
    let socket
    const onMessage = () => { if (live) load(true); socket?.emit('mark_read', { chatId }) }
    const onTyping = (event) => { if (live && event.chatId === chatId && event.userId === otherId) setTyping(Boolean(event.typing)) }
    const onPresence = (event) => { if (live && event.userId === otherId) setLiveOnline(Boolean(event.online)) }
    const onRead = (event) => { if (live && event.userId === otherId) setState((current) => ({ ...current, data: { ...current.data, messages: (current.data?.messages || []).map((message) => resolveId(message.senderId) === currentId ? { ...message, isRead: true, deliveryStatus: 'seen', readAt: event.readAt || new Date().toISOString() } : message) } })) }
    const onDelivered = (event) => { if (live && event.userId === otherId) setState((current) => ({ ...current, data: { ...current.data, messages: (current.data?.messages || []).map((message) => resolveId(message.senderId) === currentId && !message.isRead ? { ...message, deliveryStatus: 'delivered' } : message) } })) }
    getRealtimeClient().then((client) => {
      if (!live) return
      socket = client; socketRef.current = client
      client.emit('join_chat', { chatId })
      client.emit('get_presence', { userId: otherId }, (result) => { if (live) setLiveOnline(Boolean(result?.online)) })
      client.on('new_message', onMessage)
      client.on('typing_updated', onTyping)
      client.on('presence_updated', onPresence)
      client.on('messages_read', onRead)
      client.on('messages_delivered', onDelivered)
    }).catch(() => {})
    return () => {
      live = false; setTyping(false); clearTimeout(typingTimerRef.current)
      if (socket) {
        socket.emit('leave_chat', { chatId })
        socket.off('new_message', onMessage); socket.off('typing_updated', onTyping); socket.off('presence_updated', onPresence); socket.off('messages_read', onRead); socket.off('messages_delivered', onDelivered)
      }
      if (socketRef.current === socket) socketRef.current = null
    }
  }, [chatId, currentId, load, otherId])

  function updateDraft(value) {
    setDraft(value)
    socketRef.current?.emit('typing', { chatId, typing: Boolean(value.trim()) })
    clearTimeout(typingTimerRef.current)
    typingTimerRef.current = setTimeout(() => socketRef.current?.emit('typing', { chatId, typing: false }), 1200)
  }

  function goBack() { if (location.key !== 'default' && window.history.length > 1) navigate(-1); else navigate('/messages') }
  async function submit(event) {
    event?.preventDefault()
    const content = draft.trim()
    if (!content || sending || blocked) return
    setDraft(''); setSending(true)
    try { await sendMessage(chatId, content); await load(true) }
    catch (error) { setState((current) => ({ ...current, error: error.message })); setDraft(content) }
    finally { setSending(false) }
  }
  async function attach(event) {
    const files = event.target.files
    if (!files?.length) return
    setActionsOpen(false); setUploading(true)
    try {
      const attachments = await uploadFiles(files, 'chat')
      await sendMessage(chatId, { content: attachments.length === 1 ? attachments[0].name || files[0].name : `${attachments.length} attachments`, messageType: attachments[0]?.mimeType?.startsWith('image/') ? 'image' : 'file', attachments: attachments.map((file, index) => ({ url: file.secure_url || file.url || file.location, name: file.name || files[index]?.name, type: file.mimeType || file.type || files[index]?.type, mimeType: file.mimeType || file.type || files[index]?.type, size: file.size || files[index]?.size })) })
      await load(true)
    } catch (error) { setState((current) => ({ ...current, error: error.message })) }
    finally { setUploading(false); event.target.value = '' }
  }
  async function contactAction(action, value = true) {
    try { await chatAction(chatId, action, value); setProfileOpen(false); await load() }
    catch (error) { setState((current) => ({ ...current, error: error.message })) }
  }

  if (state.loading) return <AppShell><div className="chat-screen container"><div className="chat-loading"><div className="conversation-avatar" /><span>Loading conversation…</span></div></div></AppShell>
  if (!state.data) return <AppShell><div className="chat-screen container"><button className="back-link" onClick={goBack}><ArrowLeft /> Back to messages</button><div className="inline-error">{state.error || 'Conversation not found.'}</div></div></AppShell>
  return <AppShell><div className="chat-screen container"><header className="chat-header"><button onClick={goBack} aria-label="Back"><ArrowLeft /></button><div className="conversation-avatar">{participantAvatar ? <img src={participantAvatar} alt="" /> : chat.chatType === 'group' ? <Store /> : String(participant).slice(0, 1).toUpperCase()}<span className={isOnline ? 'presence-dot online' : 'presence-dot'} /></div><div><h1>{participant}</h1><p>{presence} · {chat.chatType?.replaceAll('_', ' ') || 'marketplace conversation'}</p></div>{sellerProfile?._id && <Link className="chat-supplier-link" to={`/sellers/${sellerProfile._id}`}><Store /> Supplier</Link>}<button className="chat-more" onClick={() => setProfileOpen(true)} aria-label="Conversation actions"><MoreVertical /></button></header><ChatContext chat={chat} /><div className="chat-history">{messages.length ? messages.map((item, index) => { const prior = messages[index - 1]; const showDate = !prior || new Date(prior.createdAt).toDateString() !== new Date(item.createdAt).toDateString(); return <div key={item._id || item.id || index}>{showDate && <div className="chat-date-separator"><span>{new Date(item.createdAt).toLocaleDateString([], { dateStyle: 'medium' })}</span></div>}<Message item={item} own={resolveId(item.senderId) === currentId} /></div> }) : <div className="chat-empty"><MessageSquare /><h2>Start the conversation</h2><p>Messages and shared trade context will appear here.</p></div>}{typing && <div className="chat-typing"><div className="typing-dots"><span /><span /><span /></div></div>}<div ref={endRef} /></div>{state.error && <p className="chat-error">{state.error}</p>}{blocked ? <div className="chat-blocked"><span>You blocked this contact.</span><button onClick={() => contactAction('block', false)}>Unblock</button></div> : <form className="chat-composer" onSubmit={submit}><button type="button" className="chat-plus" onClick={() => setActionsOpen(true)} aria-label="Attach or share"><Plus /></button><textarea value={draft} onChange={(event) => updateDraft(event.target.value)} onBlur={() => socketRef.current?.emit('typing', { chatId, typing: false })} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit() } }} placeholder={uploading ? 'Uploading attachment…' : 'Message'} maxLength="5000" /><button disabled={sending || uploading || !draft.trim()}><Send /></button><input ref={imageRef} hidden type="file" multiple accept="image/*" onChange={attach} /><input ref={cameraRef} hidden type="file" accept="image/*" capture="environment" onChange={attach} /><input ref={documentRef} hidden type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={attach} /></form>}{actionsOpen && <div className="modal-backdrop chat-sheet-backdrop" onMouseDown={() => setActionsOpen(false)}><div className="chat-action-sheet" onMouseDown={(event) => event.stopPropagation()}><div className="dialog-handle" /><header><h2>{isBuyer ? 'Actions' : 'Seller actions'}</h2><button onClick={() => setActionsOpen(false)}><X /></button></header><div><button onClick={() => cameraRef.current?.click()}><i><Camera /></i><span>Camera</span></button><button onClick={() => documentRef.current?.click()}><i><FileText /></i><span>Documents & Files</span></button>{isBuyer && <button onClick={() => navigate('/rfqs/new', { state: { sellerId: resolveId(chat.sellerId), productId: resolveId(chat.productId), chatId } })}><i><Paperclip /></i><span>RFQ</span></button>}</div></div></div>}{profileOpen && <div className="modal-backdrop chat-sheet-backdrop" onMouseDown={() => setProfileOpen(false)}><div className="chat-profile-sheet" onMouseDown={(event) => event.stopPropagation()}><div className="dialog-handle" /><header><h2>{participant}</h2><button onClick={() => setProfileOpen(false)}><X /></button></header>{sellerProfile?._id && <Link to={`/sellers/${sellerProfile._id}`}><Store /> View supplier profile</Link>}{chat.productId && <Link to={`/products/${resolveId(chat.productId)}`}><Image /> View product</Link>}{isBuyer && <Link to="/rfqs/new" state={{ sellerId: resolveId(chat.sellerId), productId: resolveId(chat.productId), chatId }}><FileText /> Create RFQ</Link>}<button onClick={() => contactAction('favorite', !chat.isFavorite)}><Check /> {chat.isFavorite ? 'Remove favorite' : 'Favorite chat'}</button><button className="danger" onClick={() => contactAction('block', !blocked)}><X /> Block contact</button></div></div>}</div></AppShell>
}

function ChatContext({ chat }) {
  const rfq = typeof chat.rfqId === 'object' ? chat.rfqId : null
  const quotation = typeof chat.quotationId === 'object' ? chat.quotationId : null
  const product = typeof chat.productId === 'object' ? chat.productId : null
  if (!rfq && !quotation && !product) return null
  return <div className="chat-context">{product && <Link to={`/products/${resolveId(product)}`}><Image /><span><small>Product</small><b>{product.name}</b></span></Link>}{rfq && <Link to={`/rfqs/${resolveId(rfq)}`}><FileText /><span><small>RFQ</small><b>{rfq.title}</b></span></Link>}{quotation && <Link to={`/quotations/${resolveId(quotation)}`}><Money value={quotation.unitPrice} currency={quotation.currency} /><span><small>Quotation</small><StatusBadge status={quotation.status} /></span></Link>}</div>
}

function Message({ item, own }) {
  const attachments = item.attachments || []
  const status = item.isRead || item.deliveryStatus === 'seen' ? 'seen' : item.deliveredAt || item.deliveryStatus === 'delivered' ? 'delivered' : 'sent'
  return <article className={`chat-message ${own ? 'own' : ''}`}><div>{item.content || item.text ? <p>{item.content || item.text}</p> : null}{attachments.length > 0 && <div className="message-attachments">{attachments.map((file, index) => (file.type || file.mimeType)?.startsWith('image/') ? <a href={file.url || file} target="_blank" rel="noreferrer" key={index}><img src={file.url || file} alt={file.name || 'Attachment'} /></a> : <a href={file.url || file} target="_blank" rel="noreferrer" key={index}><FileText /> {file.name || `File ${index + 1}`}</a>)}</div>}<MessageContext item={item} /><small>{item.createdAt ? new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}{own && (status === 'sent' ? <Check aria-label="Sent" /> : <CheckCheck className={status === 'seen' ? 'seen' : ''} aria-label={status} />)}</small></div></article>
}

function MessageContext({ item }) {
  if (item.rfqDetails) return <Link className="message-context-card" to={`/rfqs/${resolveId(item.rfqDetails.rfqId || item.rfqDetails)}`}><FileText /><span><b>{item.rfqDetails.title || 'RFQ'}</b><small>Qty {item.rfqDetails.quantity || '—'}</small></span></Link>
  if (item.quotationDetails) return <Link className="message-context-card" to={`/quotations/${resolveId(item.quotationDetails.quotationId || item.quotationDetails)}`}><MessageSquare /><span><b>Quotation</b><small><Money value={item.quotationDetails.unitPrice} currency={item.quotationDetails.currency} /></small></span></Link>
  if (item.productDetails) return <Link className="message-context-card" to={`/products/${resolveId(item.productDetails.productId || item.productDetails)}`}><Image /><span><b>{item.productDetails.productName || item.productDetails.name}</b><small>View product</small></span></Link>
  if (item.orderDetails) return <Link className="message-context-card" to={`/orders/${resolveId(item.orderDetails.orderId || item.orderDetails)}`}><Store /><span><b>{item.orderDetails.orderNumber || 'Order'}</b><small>{item.orderDetails.orderStatus || 'View order'}</small></span></Link>
  return null
}
