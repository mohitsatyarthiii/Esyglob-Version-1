import { Archive, BellOff, Check, Heart, MessageSquare, MoreVertical, Pin, Plus, Search, Trash2, Users, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { chatAction, createGroupChat, fetchChats } from '../api/trade'
import { useAuth } from '../auth/auth-context'
import AppShell from '../components/AppShell'
import { displayName, resolveId } from '../utils/trade'
import useAsyncData from '../hooks/useAsyncData'
import { PageHead } from '../components/PageHead'
import { TradeSkeleton } from './RfqsPage'
import { getRealtimeClient } from '../realtime/socket'

function avatarUrl(value) { return value?.avatarUrl || value?.profileImage || value?.avatar || value?.image || '' }

export default function MessagesPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const roles = user?.roles || [user?.primaryRole || 'buyer']
  const role = roles.includes('seller') && params.get('role') === 'seller' ? 'seller' : 'buyer'
  const view = params.get('view') || 'all'
  const unreadOnly = params.get('unread') === 'true'
  const [search, setSearch] = useState('')
  const [menuId, setMenuId] = useState('')
  const [groupOpen, setGroupOpen] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [members, setMembers] = useState([])
  const [groupError, setGroupError] = useState('')
  const [creating, setCreating] = useState(false)
  const [presence, setPresence] = useState({})
  const query = useAsyncData(useCallback(() => fetchChats({ role, view: view === 'groups' ? 'all' : view, unreadOnly }), [role, unreadOnly, view]))
  const reloadChats = query.reload
  const currentId = String(user?.id || user?._id || '')
  const set = (key, value) => { const next = new URLSearchParams(params); next.set(key, value); setParams(next) }
  const roleUnread = useCallback((chat) => role === 'seller' ? chat.sellerUnreadCount || 0 : chat.buyerUnreadCount || 0, [role])
  const rows = useMemo(() => (query.data || []).filter((chat) => view !== 'groups' || chat.chatType === 'group').filter((chat) => !search || [chat.groupName, chat.lastMessage, displayName(chat.buyerId), displayName(chat.sellerId), chat.productId?.name].some((value) => String(value || '').toLowerCase().includes(search.toLowerCase()))), [query.data, search, view])
  const unreadTotal = useMemo(() => (query.data || []).reduce((sum, chat) => sum + roleUnread(chat), 0), [query.data, roleUnread])
  const contacts = useMemo(() => {
    const found = new Map()
    ;(query.data || []).forEach((chat) => {
      if (chat.chatType === 'group') return
      const buyer = chat.buyerId
      const seller = chat.sellerId
      const other = resolveId(buyer) === currentId ? seller : buyer
      const id = resolveId(other)
      if (id && id !== currentId) found.set(id, { id, name: displayName(other, 'Marketplace contact'), avatar: avatarUrl(other) })
    })
    return [...found.values()]
  }, [currentId, query.data])
  const menuChat = rows.find((item) => resolveId(item) === menuId)

  useEffect(() => {
    let live = true
    let socket
    const onNotification = () => reloadChats()
    const onPresence = (event) => { if (live && event.userId) setPresence((current) => ({ ...current, [event.userId]: Boolean(event.online) })) }
    getRealtimeClient().then((client) => {
      if (!live) return
      socket = client
      client.on('new_notification', onNotification)
      client.on('presence_updated', onPresence)
      contacts.forEach((contact) => client.emit('get_presence', { userId: contact.id }, (result) => { if (live) setPresence((current) => ({ ...current, [contact.id]: Boolean(result?.online) })) }))
    }).catch(() => {})
    return () => { live = false; socket?.off('new_notification', onNotification); socket?.off('presence_updated', onPresence) }
  }, [contacts, reloadChats])

  async function action(id, name, value) {
    try { await chatAction(id, name, value); setMenuId(''); query.reload() }
    catch (error) { setGroupError(error.message) }
  }
  async function createGroup(event) {
    event.preventDefault()
    if (groupName.trim().length < 2 || !members.length) return
    setCreating(true); setGroupError('')
    try {
      const result = await createGroupChat({ groupName: groupName.trim(), memberIds: members, role })
      const id = resolveId(result.chat || result)
      setGroupOpen(false); setGroupName(''); setMembers([]); await query.reload()
      if (id) navigate(`/messages/${id}`)
    } catch (error) { setGroupError(error.message) }
    finally { setCreating(false) }
  }

  return <AppShell><div className="listing-page container trade-page messages-page"><div className="messages-title-row"><PageHead eyebrow="Buyer-seller messaging" title={unreadTotal ? `Messages (${unreadTotal})` : 'Messages'} description="Product, RFQ and quotation conversations stay connected to their marketplace context." /><button className="message-new-group" onClick={() => { setGroupError(''); setGroupOpen(true) }}><Plus /> <span>New group</span></button></div><div className="trade-page-actions">{roles.includes('seller') && <div className="role-switch"><button className={role === 'buyer' ? 'active' : ''} onClick={() => set('role', 'buyer')}>Buyer</button><button className={role === 'seller' ? 'active' : ''} onClick={() => set('role', 'seller')}>Seller</button></div>}<label className="unread-toggle"><input type="checkbox" checked={unreadOnly} onChange={(event) => set('unread', String(event.target.checked))} /> Unread only</label></div><div className="messenger-tabs">{['all', 'groups', 'favorites', 'archived'].map((item) => <button className={view === item ? 'active' : ''} key={item} onClick={() => set('view', item)}>{item === 'all' ? 'Chats' : item}</button>)}</div><label className="message-search"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search chats…" />{search && <button onClick={() => setSearch('')} aria-label="Clear search"><X /></button>}</label>{query.loading ? <TradeSkeleton /> : query.error ? <div className="inline-error">{query.error.message}</div> : rows.length ? <div className="conversation-list">{rows.map((chat) => { const id = resolveId(chat); const isBuyer = resolveId(chat.buyerId) === currentId; const other = isBuyer ? chat.sellerId : chat.buyerId; const participant = chat.chatType === 'group' ? chat.groupName : displayName(other, chat.productId?.name || 'Conversation'); const unread = roleUnread(chat); const image = chat.chatType === 'group' ? '' : avatarUrl(other); const online = chat.chatType !== 'group' && presence[resolveId(other)]; return <Link to={`/messages/${id}`} key={id} className={unread ? 'unread' : ''}><div className="conversation-avatar">{image ? <img src={image} alt="" /> : chat.chatType === 'group' ? <Users /> : String(participant).slice(0, 1).toUpperCase()}<span className={online ? 'presence-dot online' : 'presence-dot'} /></div><div className="conversation-copy"><div><h2>{participant}</h2><time>{chat.lastMessageAt ? new Date(chat.lastMessageAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : ''}</time></div><p>{chat.lastMessage || 'Start the conversation'}</p><span>{chat.rfqId ? 'RFQ negotiation' : chat.quotationId ? 'Quotation' : chat.productId ? 'Product inquiry' : chat.chatType === 'group' ? `${chat.groupMembers?.length || 0} members` : online ? 'Online' : 'Marketplace conversation'}</span></div>{unread > 0 && <b className="unread-count">{unread}</b>}<button className="conversation-menu-button" aria-label={`Actions for ${participant}`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); setMenuId(id) }}><MoreVertical /></button></Link>})}</div> : <div className="empty-results"><MessageSquare /><h2>{view === 'groups' ? 'No groups yet' : view === 'archived' ? 'No archived chats' : view === 'favorites' ? 'No favorite chats' : 'No conversations found'}</h2><p>{view === 'groups' ? 'Create a group with people you already chat with.' : 'Start a contextual chat from a product, supplier, RFQ or quotation.'}</p>{view === 'groups' && <button className="button button--primary" onClick={() => setGroupOpen(true)}><Users /> Create group</button>}</div>}{menuChat && <ChatMenu chat={menuChat} unread={roleUnread(menuChat)} close={() => setMenuId('')} action={action} />}{groupOpen && <GroupDialog contacts={contacts} groupName={groupName} setGroupName={setGroupName} members={members} setMembers={setMembers} creating={creating} error={groupError} close={() => { if (!creating) setGroupOpen(false) }} submit={createGroup} />}</div></AppShell>
}

function ChatMenu({ chat, unread, close, action }) {
  const id = resolveId(chat)
  const items = [
    [Pin, chat.isPinned ? 'Unpin chat' : 'Pin chat', 'pin', !chat.isPinned],
    [BellOff, chat.isMuted ? 'Unmute chat' : 'Mute chat', 'mute', !chat.isMuted],
    [Heart, chat.isFavorite ? 'Remove favorite' : 'Favorite chat', 'favorite', !chat.isFavorite],
    [Check, unread ? 'Mark as read' : 'Mark as unread', unread ? 'mark_read' : 'mark_unread', true],
    [Archive, chat.isArchived ? 'Unarchive chat' : 'Archive chat', 'archive', !chat.isArchived],
  ]
  return <div className="modal-backdrop chat-menu-backdrop" onMouseDown={close}><div className="chat-action-menu" role="menu" onMouseDown={(event) => event.stopPropagation()}>{items.map(([Icon, label, name, value]) => <button key={name} onClick={() => action(id, name, value)}><Icon />{label}</button>)}<button className="danger" onClick={() => { if (window.confirm('Delete this chat from your inbox?')) action(id, 'delete', true) }}><Trash2 />Delete chat</button></div></div>
}

function GroupDialog({ contacts, groupName, setGroupName, members, setMembers, creating, error, close, submit }) {
  return <div className="modal-backdrop" onMouseDown={close}><form className="group-chat-dialog" onMouseDown={(event) => event.stopPropagation()} onSubmit={submit}><div className="dialog-handle" /><header><div><small>Messages</small><h2>New Group Chat</h2></div><button type="button" onClick={close} aria-label="Close"><X /></button></header><label>Group name<input autoFocus value={groupName} onChange={(event) => setGroupName(event.target.value)} maxLength="80" placeholder="e.g. Packaging suppliers" /></label><div className="group-contact-list"><b>Select contacts</b>{contacts.length ? contacts.map((contact) => { const selected = members.includes(contact.id); return <button type="button" className={selected ? 'selected' : ''} key={contact.id} onClick={() => setMembers((current) => selected ? current.filter((id) => id !== contact.id) : [...current, contact.id])}><span className="conversation-avatar">{contact.avatar ? <img src={contact.avatar} alt="" /> : contact.name.slice(0, 1).toUpperCase()}</span><span>{contact.name}</span><i>{selected && <Check />}</i></button> }) : <p>Start individual chats first; those contacts will be available here.</p>}</div>{error && <p className="inline-error">{error}</p>}<button className="button button--primary" disabled={creating || groupName.trim().length < 2 || !members.length}>{creating ? 'Creating…' : `Create Group${members.length ? ` (${members.length})` : ''}`}</button></form></div>
}
