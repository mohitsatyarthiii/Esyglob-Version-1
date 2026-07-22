/* eslint-disable react-hooks/set-state-in-effect */
import { Bot, Camera, Check, ChevronDown, FileText, History, Image, Menu, Mic, Paperclip, Pencil, Plus, RefreshCw, Search, Send, Sparkles, Store, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteAIChat, fetchAIChat, fetchAIChats, streamAIMessage, updateAIChat } from '../api/account'
import { uploadFiles } from '../api/trade'
import { useAuth } from '../auth/auth-context'
import AppShell from '../components/AppShell'
import { Money } from '../components/TradeUI'
import { resolveId } from '../utils/trade'

const buyerPrompts = ['Find verified suppliers with low MOQ', 'Draft an RFQ for 500 units', 'Compare suppliers by trust, price and lead time', 'Explain shipping documents for my order']
const sellerPrompts = ['Find RFQ opportunities for my products', 'How can I improve my product listings?', 'Prepare a professional quotation', 'Analyze demand for my category']

export default function AIChatPage() {
  const { user } = useAuth()
  const role = user?.primaryRole || 'buyer'
  const [chats, setChats] = useState([])
  const [chatId, setChatId] = useState('')
  const [messages, setMessages] = useState([]) 
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState([])
  const [busy, setBusy] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [conversationLoading, setConversationLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [failed, setFailed] = useState('')
  const [historySearch, setHistorySearch] = useState('')
  const [historySort, setHistorySort] = useState('recent')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [editingTitle, setEditingTitle] = useState('')
  const [listening, setListening] = useState(false)
  const endRef = useRef(null)
  const imageRef = useRef(null)
  const cameraRef = useRef(null)
  const documentRef = useRef(null)
  const streamRef = useRef(null)
  const recognitionRef = useRef(null)
  const streamSequence = useRef(0)

  const loadChats = useCallback(async () => {
    try { setChats(await fetchAIChats(role)) }
    finally { setHistoryLoading(false) }
  }, [role])

  useEffect(() => { loadChats().catch((next) => setError(next.message)) }, [loadChats])
  useEffect(() => () => {
    streamRef.current?.abort()
    recognitionRef.current?.stop()
  }, [])
  useEffect(() => {
    if (!chatId) { setMessages([]); return }
    let live = true
    setConversationLoading(true)
    fetchAIChat(chatId)
      .then((chat) => { if (live) setMessages(chat.messages || []) })
      .catch((next) => { if (live) setError(next.message) })
      .finally(() => { if (live) setConversationLoading(false) })
    return () => { live = false }
  }, [chatId])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, busy])

  const active = useMemo(() => chats.find((item) => resolveId(item) === chatId), [chatId, chats])
  const visibleChats = useMemo(() => {
    const query = historySearch.trim().toLowerCase()
    const filtered = query ? chats.filter((item) => String(item.title || 'Marketplace assistant').toLowerCase().includes(query)) : chats
    return [...filtered].sort((left, right) => {
      const leftTime = new Date(left.lastMessageAt || left.updatedAt || left.createdAt || 0).getTime()
      const rightTime = new Date(right.lastMessageAt || right.updatedAt || right.createdAt || 0).getTime()
      return historySort === 'oldest' ? leftTime - rightTime : rightTime - leftTime
    })
  }, [chats, historySearch, historySort])
  const prompts = role === 'seller' ? sellerPrompts : buyerPrompts

  async function attach(event) {
    const files = Array.from(event.target.files || [])
    if (!files.length) return
    setUploading(true); setError('')
    try {
      const uploaded = await uploadFiles(files, 'ai-chat')
      setAttachments((current) => [...current, ...uploaded.map((item, index) => ({ url: item.secure_url || item.url || item.location, name: item.name || item.originalName || files[index]?.name, mimeType: item.mimeType || files[index]?.type }))])
    } catch (next) { setError(next.message) }
    finally { setUploading(false); event.target.value = '' }
  }

  async function send(text = draft) {
    const content = text.trim() || (attachments.length ? 'Please analyze the attached files for my marketplace request.' : '')
    if (!content || busy) return
    const sentAttachments = attachments
    const streamMessageId = `stream-${++streamSequence.current}`
    setDraft(''); setAttachments([]); setError(''); setFailed(''); setBusy(true)
    setMessages((current) => [...current, { role: 'user', content, createdAt: new Date().toISOString(), metadata: { attachmentUrls: sentAttachments } }, { _id: streamMessageId, role: 'assistant', content: '', streaming: true, createdAt: new Date().toISOString() }])
    const controller = new AbortController()
    streamRef.current = controller
    let streamError = ''
    let nextChatId = chatId
    try {
      const attachmentUrls = sentAttachments.map((item) => item.url)
      await streamAIMessage({ message: content, displayMessage: content, chatId: chatId || undefined, role, conversationType: 'marketplace_assistant', forceAI: true, context: { feature: 'AI Chatbot', sourcePath: '/ai-chat', attachments: attachmentUrls }, pluginPayload: attachmentUrls.length ? { pluginId: 'file-analysis', attachmentUrls } : null }, (event) => {
        if (event.type === 'start') { nextChatId = event.chatId || nextChatId; return }
        if (event.type === 'token') { setMessages((current) => current.map((item) => item._id === streamMessageId ? { ...item, content: `${item.content || ''}${event.content || ''}` } : item)); return }
        if (event.type === 'done') {
          const metadata = { ...event, marketplace: event.marketplace || {}, suggestedFollowUps: event.suggestedFollowUps || [] }
          setMessages((current) => current.map((item) => item._id === streamMessageId ? { ...item, streaming: false, metadata } : item))
          nextChatId = event.chatId || nextChatId
        }
        if (event.type === 'error') streamError = event.message || 'The AI response could not be completed.'
      }, controller.signal)
      if (streamError) throw new Error(streamError)
      if (nextChatId && nextChatId !== chatId) setChatId(nextChatId)
      await loadChats()
    } catch (next) {
      if (next.name !== 'AbortError') {
        setMessages((current) => current.filter((item) => item._id !== streamMessageId))
        setError(next.message); setFailed(content)
      }
    } finally {
      if (streamRef.current === controller) streamRef.current = null
      setBusy(false)
    }
  }

  function newConversation() {
    streamRef.current?.abort(); setBusy(false); setChatId(''); setMessages([]); setError(''); setFailed(''); setSidebarOpen(false)
  }

  async function renameConversation(id) {
    const title = editingTitle.trim()
    if (!title) return
    const previous = chats
    setChats((current) => current.map((item) => resolveId(item) === id ? { ...item, title } : item))
    setEditingId('')
    try { await updateAIChat({ chatId: id, title }) }
    catch (next) { setChats(previous); setError(next.message) }
  }

  async function removeConversation(id) {
    const conversation = chats.find((item) => resolveId(item) === id)
    if (!window.confirm(`Delete "${conversation?.title || 'this conversation'}"? This cannot be undone.`)) return
    const previous = chats
    setChats((current) => current.filter((item) => resolveId(item) !== id))
    if (id === chatId) newConversation()
    try { await deleteAIChat(id) }
    catch (next) { setChats(previous); setError(next.message) }
  }

  function toggleVoice() {
    if (listening) { recognitionRef.current?.stop(); return }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) { setError('Voice input is not supported in this browser.'); return }
    const recognition = new SpeechRecognition()
    recognition.lang = navigator.language || 'en-IN'
    recognition.interimResults = false
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || ''
      setDraft((current) => `${current}${current ? ' ' : ''}${transcript}`)
    }
    recognition.onerror = () => setError('Voice input could not be captured. Please try again.')
    recognition.onend = () => setListening(false)
    recognitionRef.current = recognition
    setListening(true); setError(''); recognition.start()
  }

  return <AppShell><div className="ai-workspace">
    {sidebarOpen && <button className="ai-sidebar-backdrop" aria-label="Close conversation history" onClick={() => setSidebarOpen(false)} />}
    <aside className={sidebarOpen ? 'open' : ''}>
      <div className="ai-sidebar-brand"><span><Sparkles /></span><div><b>EsyGlob AI</b><small>Marketplace copilot</small></div><button className="ai-sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar"><X /></button></div>
      <button className="ai-new-chat" onClick={newConversation}><Plus /> New conversation</button>
      <div className="ai-history-tools"><label><Search /><input value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder="Search conversations" /></label><label className="ai-history-sort"><span>Sort</span><select value={historySort} onChange={(event) => setHistorySort(event.target.value)}><option value="recent">Most recent</option><option value="oldest">Oldest first</option></select><ChevronDown /></label></div>
      <div className="ai-sidebar-head"><b><History /> Saved chats</b><small>{visibleChats.length}</small></div>
      <div className="ai-history-list">{historyLoading ? <div className="ai-history-empty"><div className="typing-dots"><span /><span /><span /></div><p>Loading chats...</p></div> : visibleChats.length ? visibleChats.map((item) => {
        const id = resolveId(item)
        const timestamp = item.lastMessageAt || item.updatedAt || item.createdAt
        return <div className={`ai-history-row ${id === chatId ? 'active' : ''}`} key={id}>
          {editingId === id ? <form onSubmit={(event) => { event.preventDefault(); renameConversation(id) }}><input autoFocus maxLength={90} value={editingTitle} onChange={(event) => setEditingTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setEditingId('') }} /><button title="Save name"><Check /></button></form> : <button className="ai-history-main" onClick={() => { if (!busy) { setChatId(id); setSidebarOpen(false); setError('') } }}><span><b>{item.title || 'Marketplace assistant'}</b><small>{timestamp ? new Date(timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : `${item.totalMessages || 0} messages`}</small></span></button>}
          {editingId !== id && <div className="ai-history-actions"><button title="Rename conversation" onClick={() => { setEditingId(id); setEditingTitle(item.title || 'Marketplace assistant') }}><Pencil /></button><button title="Delete conversation" onClick={() => removeConversation(id)}><Trash2 /></button></div>}
        </div>
      }) : <div className="ai-history-empty"><History /><b>{historySearch ? 'No chats found' : 'No saved chats yet'}</b><p>{historySearch ? 'Try a different search.' : 'Your conversations will appear here.'}</p></div>}</div>
    </aside>
    <section className="ai-chat">
      <header><div><button className="ai-mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open conversation history"><Menu /></button><i><Sparkles /></i><span><h1>{active?.title || 'EsyGlob AI'}</h1><p><em /> AI marketplace assistant <span>· {role}</span></p></span></div><button className="ai-header-new" onClick={newConversation}><Plus /> <span>New chat</span></button></header>
      <div className="ai-messages">{conversationLoading ? <div className="ai-loading"><div className="ai-loading-orb"><Sparkles /></div><div className="typing-dots"><span /><span /><span /></div><p>Opening your conversation...</p></div> : !messages.length ? <div className="ai-welcome"><i><Sparkles /></i><span className="eyebrow">Your intelligent trade partner</span><h2>What can I help you discover today?</h2><p>Find products, evaluate suppliers, prepare RFQs and explore global market opportunities with live EsyGlob context.</p><div>{prompts.map((text) => <button key={text} onClick={() => send(text)}><Sparkles /><span>{text}</span></button>)}</div></div> : messages.map((item, index) => <AIMessage key={item._id || index} item={item} user={user} onPrompt={send} onRegenerate={item.role === 'assistant' && !item.streaming ? () => { const last = messages.slice(0, index).filter((message) => message.role === 'user').at(-1)?.content; if (last) send(last) } : null} />)}<div ref={endRef} /></div>
      <div className="ai-composer-dock">{attachments.length > 0 && <div className="ai-attachments">{attachments.map((item, index) => <span key={`${item.url}-${index}`}>{item.mimeType?.startsWith('image/') ? <Image /> : <FileText />}<b>{item.name}</b><button type="button" aria-label={`Remove ${item.name}`} onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X /></button></span>)}</div>}{error && <div className="ai-error"><span>{error}</span>{failed && <button onClick={() => send(failed)}><RefreshCw /> Retry</button>}</div>}<form className="ai-composer" onSubmit={(event) => { event.preventDefault(); send() }}><textarea rows="1" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={uploading ? 'Uploading securely...' : busy ? 'EsyGlob AI is responding...' : 'Message EsyGlob AI'} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send() } }} /><div className="ai-composer-actions"><div className="ai-attach-menu"><button type="button" disabled={uploading || busy} title="Attach image" onClick={() => imageRef.current?.click()}><Paperclip /></button><button type="button" disabled={uploading || busy} title="Use camera" onClick={() => cameraRef.current?.click()}><Camera /></button><input ref={imageRef} hidden type="file" accept="image/*" multiple onChange={attach} /><input ref={cameraRef} hidden type="file" accept="image/*" capture="environment" onChange={attach} /><input ref={documentRef} hidden type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt" multiple onChange={attach} /><button type="button" disabled={uploading || busy} title="Attach document" onClick={() => documentRef.current?.click()}><FileText /></button><button type="button" className={listening ? 'listening' : ''} disabled={busy} title={listening ? 'Stop listening' : 'Voice input'} onClick={toggleVoice}><Mic /></button></div><button className="ai-send-button" aria-label="Send message" disabled={busy || uploading || (!draft.trim() && !attachments.length)}>{busy ? <span className="ai-send-loader" /> : <Send />}</button></div></form><small className="ai-disclaimer">AI can make mistakes. Verify important commercial and compliance details.</small></div>
    </section>
  </div></AppShell>
}

function AIMessage({ item, user, onPrompt, onRegenerate }) {
  const metadata = item.metadata || {}
  const marketplace = metadata.marketplace || {}
  const products = Array.isArray(metadata.topProducts || marketplace.topProducts) ? metadata.topProducts || marketplace.topProducts : []
  const suppliers = Array.isArray(metadata.topSuppliers || marketplace.topSuppliers) ? metadata.topSuppliers || marketplace.topSuppliers : []
  const rawSuggestions = metadata.suggestions || metadata.suggestedFollowUps || marketplace.suggestedFollowUps || []
  const suggestions = (Array.isArray(rawSuggestions) ? rawSuggestions : []).map((value) => typeof value === 'string' ? value : value?.prompt || value?.label || value?.title).filter(Boolean)
  const attachmentUrls = metadata.attachmentUrls || metadata.pluginPayload?.attachmentUrls || []
  const content = String(item.content || item.message || (item.streaming ? 'Thinking...' : ''))
  return <article className={item.role === 'user' ? 'user' : 'assistant'}><i>{item.role === 'user' ? String(user?.name || user?.fullName || 'U').slice(0, 1) : <Bot />}</i><div><RichMessage content={content} streaming={item.streaming} />{attachmentUrls.length > 0 && <div className="ai-message-files">{attachmentUrls.map((value, index) => <a href={typeof value === 'string' ? value : value.url} target="_blank" rel="noreferrer" key={index}><Paperclip /> Attachment {index + 1}</a>)}</div>}{products.length > 0 && <div className="ai-result-cards">{products.map((product, index) => { const id = resolveId(product); const image = product.image || product.images?.[0]; return <Link to={product.link || (id ? `/products/${id}` : '/products')} key={id || index}>{image && <img src={image} alt="" />}<span><b>{product.name || product.title || 'Marketplace product'}</b><small><Money value={product.price} currency={product.currency} /> · MOQ {product.moq || product.minimumOrderQuantity || 1}</small></span></Link> })}</div>}{suppliers.length > 0 && <div className="ai-supplier-links">{suppliers.map((supplier, index) => { const id = resolveId(supplier); return <Link to={id ? `/sellers/${id}` : '/sellers'} key={id || index}><Store /><span><b>{supplier.companyName || supplier.name || 'Marketplace supplier'}</b><small>{supplier.verified || supplier.isVerified ? 'Verified · ' : ''}{supplier.country || 'Global supplier'}</small></span></Link> })}</div>}{suggestions.length > 0 && <div className="ai-suggestions">{suggestions.map((value) => <button key={value} onClick={() => onPrompt(value)}>{value}</button>)}</div>}<footer><small>{item.createdAt || item.timestamp ? new Date(item.createdAt || item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</small>{onRegenerate && <button onClick={onRegenerate}><RefreshCw /> Regenerate</button>}</footer></div></article>
}

function RichMessage({ content, streaming }) {
  const lines = content.split('\n')
  const nodes = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    if (line.trim().startsWith('```')) {
      const language = line.trim().slice(3).trim(); const code = []; index += 1
      while (index < lines.length && !lines[index].trim().startsWith('```')) { code.push(lines[index]); index += 1 }
      nodes.push(<pre key={`code-${index}`}><small>{language}</small><code>{code.join('\n')}</code></pre>); index += 1; continue
    }
    if (line.includes('|') && index + 1 < lines.length && /^\s*\|?\s*:?-+/.test(lines[index + 1])) {
      const rows = [line]; index += 2
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) { rows.push(lines[index]); index += 1 }
      const cells = rows.map((row) => row.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()))
      nodes.push(<div className="ai-markdown-table" key={`table-${index}`}><table><thead><tr>{cells[0].map((cell, cellIndex) => <th key={cellIndex}>{inlineMarkdown(cell)}</th>)}</tr></thead><tbody>{cells.slice(1).map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{inlineMarkdown(cell)}</td>)}</tr>)}</tbody></table></div>); continue
    }
    if (/^\s*[-*]\s+/.test(line)) { const items = []; while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) { items.push(lines[index].replace(/^\s*[-*]\s+/, '')); index += 1 } nodes.push(<ul key={`list-${index}`}>{items.map((value, itemIndex) => <li key={itemIndex}>{inlineMarkdown(value)}</li>)}</ul>); continue }
    if (/^\s*\d+\.\s+/.test(line)) { const items = []; while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) { items.push(lines[index].replace(/^\s*\d+\.\s+/, '')); index += 1 } nodes.push(<ol key={`ordered-${index}`}>{items.map((value, itemIndex) => <li key={itemIndex}>{inlineMarkdown(value)}</li>)}</ol>); continue }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    if (heading) { const Tag = `h${heading[1].length + 2}`; nodes.push(<Tag key={`heading-${index}`}>{inlineMarkdown(heading[2])}</Tag>); index += 1; continue }
    if (line.trim()) nodes.push(<p key={`paragraph-${index}`}>{inlineMarkdown(line)}</p>)
    index += 1
  }
  return <div className={streaming && !content ? 'ai-rich-message ai-stream-placeholder' : 'ai-rich-message'}>{nodes.length ? nodes : <p>Thinking...</p>}{streaming && content !== 'Thinking...' && <span className="ai-stream-cursor" />}</div>
}

function inlineMarkdown(value) {
  return String(value).split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)]+\))/g).filter(Boolean).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>
    const link = /^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/.exec(part)
    if (link) return <a href={link[2]} target="_blank" rel="noreferrer" key={index}>{link[1]}</a>
    return part
  })
}
