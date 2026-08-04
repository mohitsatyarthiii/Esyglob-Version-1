/* eslint-disable react-hooks/set-state-in-effect */
import { ArrowLeft, Bot, Camera, Check, ChevronDown, Copy, File, FileText, History, Image, Menu, Mic, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Paperclip, Pencil, Plus, RefreshCw, Send, Share2, Sparkles, Store, Trash2, Upload, X } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { deleteAIChat, fetchAIChat, fetchAIChats, streamAIMessage, updateAIChat } from '../api/account'
import { resolveApiResourceUrl } from '../api/client'
import { uploadFiles } from '../api/trade'
import { useAuth } from '../auth/auth-context'
import AppShell from '../components/AppShell'
import { Money } from '../components/TradeUI'
import { resolveId } from '../utils/trade'
import UnifiedSearchInput from '../components/UnifiedSearchInput'
import { useConfirm } from '../components/EnterpriseUX'
import { AICreditDialog, AICreditMeter, useAICredits } from '../components/AICredits'

const buyerPrompts = ['Find verified suppliers with low MOQ', 'Draft an RFQ for 500 units', 'Compare suppliers by trust, price and lead time', 'Explain shipping documents for my order']
const sellerPrompts = ['Find RFQ opportunities for my products', 'How can I improve my product listings?', 'Prepare a professional quotation', 'Analyze demand for my category']

export default function AIChatPage() {
  const confirm = useConfirm()
  const { user } = useAuth()
  const navigate = useNavigate()
  const role = user?.primaryRole || 'buyer'
  const creditState = useAICredits(role)
  const [creditDialogOpen, setCreditDialogOpen] = useState(false)
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return window.localStorage.getItem('esyglob.ai.sidebar-collapsed') === 'true' }
    catch { return false }
  })
  const [editingId, setEditingId] = useState('')
  const [editingTitle, setEditingTitle] = useState('')
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false)
  const [shareStatus, setShareStatus] = useState('')
  const [voiceListening, setVoiceListening] = useState(false)
  const endRef = useRef(null)
  const messagesRef = useRef(null)
  const textareaRef = useRef(null)
  const composerRef = useRef(null)
  const conversationMenuRef = useRef(null)
  const imageRef = useRef(null)
  const cameraRef = useRef(null)
  const fileRef = useRef(null)
  const documentRef = useRef(null)
  const streamRef = useRef(null)
  const streamSequence = useRef(0)
  const streamTokenBufferRef = useRef('')
  const streamTokenFrameRef = useRef(0)
  const sendingRef = useRef(false)
  const stickToBottomRef = useRef(true)
  const sendActionRef = useRef(null)
  const latestMessagesRef = useRef(messages)
  const shareTimerRef = useRef(null)
  const voiceRecognitionRef = useRef(null)

  const promptFromMessage = useCallback((text) => sendActionRef.current?.(text), [])
  const regenerateMessage = useCallback((messageIndex) => {
    const previousUserMessage = latestMessagesRef.current
      .slice(0, messageIndex)
      .filter((message) => message.role === 'user')
      .at(-1)?.content
    if (previousUserMessage) sendActionRef.current?.(previousUserMessage)
  }, [])

  const loadChats = useCallback(async () => {
    try { setChats(await fetchAIChats(role)) }
    finally { setHistoryLoading(false) }
  }, [role])

  useEffect(() => { loadChats().catch((next) => setError(next.message)) }, [loadChats])
  useEffect(() => {
    sendActionRef.current = send
    latestMessagesRef.current = messages
  })
  useEffect(() => {
    try { window.localStorage.setItem('esyglob.ai.sidebar-collapsed', String(sidebarCollapsed)) }
    catch { /* Storage may be unavailable in privacy mode. */ }
  }, [sidebarCollapsed])
  useEffect(() => () => {
    streamRef.current?.abort()
    window.cancelAnimationFrame(streamTokenFrameRef.current)
    voiceRecognitionRef.current?.abort?.()
    window.clearTimeout(shareTimerRef.current)
  }, [])
  useEffect(() => {
    const viewport = window.visualViewport
    const updateViewport = () => document.documentElement.style.setProperty('--ai-viewport-height', `${viewport?.height || window.innerHeight}px`)
    updateViewport()
    viewport?.addEventListener('resize', updateViewport)
    window.addEventListener('resize', updateViewport)
    return () => {
      viewport?.removeEventListener('resize', updateViewport)
      window.removeEventListener('resize', updateViewport)
      document.documentElement.style.removeProperty('--ai-viewport-height')
    }
  }, [])
  useEffect(() => {
    const closeMenu = (event) => {
      if (event.type === 'keydown') {
        if (event.key !== 'Escape') return
        conversationMenuRef.current?.removeAttribute('open')
      }
      if (event.type === 'pointerdown') {
        if (!conversationMenuRef.current?.contains(event.target)) conversationMenuRef.current?.removeAttribute('open')
        if (composerRef.current?.contains(event.target)) return
      }
      setAttachmentMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeMenu)
    document.addEventListener('keydown', closeMenu)
    return () => {
      document.removeEventListener('pointerdown', closeMenu)
      document.removeEventListener('keydown', closeMenu)
    }
  }, [])
  useEffect(() => {
    if (!chatId) { setMessages([]); return }
    let live = true
    stickToBottomRef.current = true
    setConversationLoading(true)
    fetchAIChat(chatId)
      .then((chat) => { if (live) setMessages(chat.messages || []) })
      .catch((next) => { if (live) setError(next.message) })
      .finally(() => { if (live) setConversationLoading(false) })
    return () => { live = false }
  }, [chatId])
  useEffect(() => {
    if (!stickToBottomRef.current) return undefined
    const frame = window.requestAnimationFrame(() => {
      const element = messagesRef.current
      element?.scrollTo({ top: element.scrollHeight, behavior: busy ? 'auto' : 'smooth' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [messages, busy])
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 28), 160)}px`
  }, [draft])

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
    if (!content || busy || conversationLoading || sendingRef.current) return
    if (creditState.exhausted) { setCreditDialogOpen(true); return }
    stickToBottomRef.current = true
    sendingRef.current = true
    const sentAttachments = attachments
    const streamMessageId = `stream-${++streamSequence.current}`
    const clientTiming = {}
    let firstRenderScheduled = false
    globalThis.performance?.mark?.(`${streamMessageId}:request`)
    window.cancelAnimationFrame(streamTokenFrameRef.current)
    streamTokenFrameRef.current = 0
    streamTokenBufferRef.current = ''
    setDraft(''); setAttachments([]); setError(''); setFailed(''); setBusy(true)
    setMessages((current) => [...current, { role: 'user', content, createdAt: new Date().toISOString(), metadata: { attachmentUrls: sentAttachments } }, { _id: streamMessageId, role: 'assistant', content: '', statusText: 'Preparing your answer...', streaming: true, createdAt: new Date().toISOString() }])
    window.requestAnimationFrame(() => {
      globalThis.performance?.mark?.(`${streamMessageId}:optimistic-visible`)
      clientTiming.optimisticRenderMs = globalThis.performance?.measure?.(`${streamMessageId}:optimistic-latency`, `${streamMessageId}:request`, `${streamMessageId}:optimistic-visible`)?.duration
    })
    const controller = new AbortController()
    streamRef.current = controller
    let streamError = ''
    let nextChatId = chatId
    let hasVisibleToken = false
    const flushStreamTokens = () => {
      const chunk = streamTokenBufferRef.current
      streamTokenBufferRef.current = ''
      streamTokenFrameRef.current = 0
      if (!chunk) return
      setMessages((current) => current.map((item) => item._id === streamMessageId ? { ...item, statusText: '', content: `${item.content || ''}${chunk}` } : item))
    }
    try {
      const attachmentUrls = sentAttachments.map((item) => item.url)
      let streamCompleted = false
      await streamAIMessage({ message: content, displayMessage: content, chatId: chatId || undefined, role, conversationType: 'assistant', forceAI: true, context: { feature: 'AI Chatbot', sourcePath: '/ai-chat', attachments: attachmentUrls }, pluginPayload: attachmentUrls.length ? { pluginId: 'file-analysis', attachmentUrls } : null }, (event) => {
        if (event.type === 'transport') { clientTiming.responseHeadersMs = event.timing?.headersMs; return }
        if (event.type === 'start') { nextChatId = event.chatId || nextChatId; return }
        if (event.type === 'status') { setMessages((current) => current.map((item) => item._id === streamMessageId ? { ...item, statusText: event.message || 'Preparing your answer...' } : item)); return }
        if (event.type === 'token') {
          const chunk = String(event.content || '')
          if (!hasVisibleToken) {
            hasVisibleToken = true
            globalThis.performance?.mark?.(`${streamMessageId}:first-token`)
            clientTiming.firstTokenReceivedMs = globalThis.performance?.measure?.(`${streamMessageId}:first-token-latency`, `${streamMessageId}:request`, `${streamMessageId}:first-token`)?.duration
            setMessages((current) => current.map((item) => item._id === streamMessageId ? { ...item, statusText: '', content: `${item.content || ''}${chunk}` } : item))
            if (!firstRenderScheduled) {
              firstRenderScheduled = true
              window.requestAnimationFrame(() => {
                globalThis.performance?.mark?.(`${streamMessageId}:first-visible`)
                clientTiming.firstVisibleRenderMs = globalThis.performance?.measure?.(`${streamMessageId}:first-visible-latency`, `${streamMessageId}:request`, `${streamMessageId}:first-visible`)?.duration
              })
            }
          } else {
            streamTokenBufferRef.current += chunk
            if (!streamTokenFrameRef.current) streamTokenFrameRef.current = window.requestAnimationFrame(flushStreamTokens)
          }
          return
        }
        if (event.type === 'replace') {
          window.cancelAnimationFrame(streamTokenFrameRef.current)
          streamTokenFrameRef.current = 0
          streamTokenBufferRef.current = ''
          setMessages((current) => current.map((item) => item._id === streamMessageId ? { ...item, statusText: '', content: String(event.content || '') } : item)); return
        }
        if (event.type === 'generation_complete') {
          window.cancelAnimationFrame(streamTokenFrameRef.current)
          streamTokenFrameRef.current = 0
          const finalChunk = streamTokenBufferRef.current
          streamTokenBufferRef.current = ''
          globalThis.performance?.mark?.(`${streamMessageId}:generation-complete`)
          clientTiming.generationCompleteMs = globalThis.performance?.measure?.(`${streamMessageId}:generation-latency`, `${streamMessageId}:request`, `${streamMessageId}:generation-complete`)?.duration
          setMessages((current) => current.map((item) => item._id === streamMessageId ? { ...item, statusText: '', content: `${item.content || ''}${finalChunk}`, streaming: false } : item))
          return
        }
        if (event.type === 'done') {
          window.cancelAnimationFrame(streamTokenFrameRef.current)
          streamTokenFrameRef.current = 0
          const finalChunk = streamTokenBufferRef.current
          streamTokenBufferRef.current = ''
          streamCompleted = true
          globalThis.performance?.mark?.(`${streamMessageId}:complete`)
          try { clientTiming.completedMs = globalThis.performance?.measure?.(`${streamMessageId}:total`, `${streamMessageId}:request`, `${streamMessageId}:complete`)?.duration } catch { /* Performance marks are diagnostic only. */ }
          const metadata = { ...event, timing: { ...(event.timing || {}), client: { ...clientTiming } }, marketplace: event.marketplace || {}, suggestedFollowUps: event.suggestedFollowUps || [] }
          setMessages((current) => current.map((item) => item._id === streamMessageId ? { ...item, content: `${item.content || ''}${finalChunk}`, streaming: false, metadata } : item))
          nextChatId = event.chatId || nextChatId
          creditState.apply(event.credits)
        }
        if (event.type === 'error') streamError = event.message || 'The AI response could not be completed.'
      }, controller.signal)
      if (streamError) throw new Error(streamError)
      if (!streamCompleted) throw new Error('The response connection closed before completion. Please retry.')
      if (nextChatId && nextChatId !== chatId) setChatId(nextChatId)
      loadChats().catch(() => undefined)
    } catch (next) {
      if (next.name === 'AbortError') {
        const finalChunk = streamTokenBufferRef.current
        streamTokenBufferRef.current = ''
        setMessages((current) => current.map((item) => item._id === streamMessageId ? { ...item, content: `${item.content || ''}${finalChunk}` || 'Response stopped.', statusText: '', streaming: false, metadata: { ...(item.metadata || {}), stopped: true } } : item))
      } else {
        setMessages((current) => current.filter((item) => item._id !== streamMessageId))
        if (next.code === 'AI_CREDITS_EXHAUSTED' || next.status === 402) setCreditDialogOpen(true)
        else { setError(next.message); setFailed(content) }
      }
    } finally {
      window.cancelAnimationFrame(streamTokenFrameRef.current)
      streamTokenFrameRef.current = 0
      streamTokenBufferRef.current = ''
      if (streamRef.current === controller) streamRef.current = null
      sendingRef.current = false
      setBusy(false)
      window.setTimeout(() => clearChatPerformanceEntries(streamMessageId), 1_000)
    }
  }

  function startVoiceMessage() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setError('Voice input is not supported by this browser.')
      return
    }
    voiceRecognitionRef.current?.abort?.()
    const recognition = new SpeechRecognition()
    recognition.lang = navigator.language || 'en-IN'
    recognition.interimResults = true
    recognition.continuous = false
    let finalText = ''
    recognition.onstart = () => { setVoiceListening(true); setError('') }
    recognition.onresult = (event) => {
      let interim = ''
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const text = event.results[index][0]?.transcript || ''
        if (event.results[index].isFinal) finalText += text
        else interim += text
      }
      setDraft(`${finalText}${interim}`.trim())
    }
    recognition.onerror = (event) => {
      setVoiceListening(false)
      setError(event.error === 'not-allowed' ? 'Allow microphone access to dictate an EsyGlob AI message.' : 'Voice input could not hear you. Please retry.')
    }
    recognition.onend = () => {
      setVoiceListening(false)
      if (finalText.trim()) window.requestAnimationFrame(() => textareaRef.current?.focus())
    }
    voiceRecognitionRef.current = recognition
    recognition.start()
  }

  function newConversation() {
    streamRef.current?.abort(); sendingRef.current = false; stickToBottomRef.current = true; setBusy(false); setChatId(''); setMessages([]); setError(''); setFailed(''); setSidebarOpen(false); window.requestAnimationFrame(() => textareaRef.current?.focus())
  }

  async function shareConversation() {
    const title = active?.title || 'EsyGlob AI conversation'
    try {
      if (navigator.share) await navigator.share({ title, text: 'EsyGlob AI marketplace conversation', url: window.location.href })
      else {
        await navigator.clipboard.writeText(window.location.href)
        setShareStatus('Link copied')
        window.clearTimeout(shareTimerRef.current)
        shareTimerRef.current = window.setTimeout(() => setShareStatus(''), 1800)
      }
    } catch (next) {
      if (next?.name !== 'AbortError') {
        setShareStatus('Unable to share')
        window.clearTimeout(shareTimerRef.current)
        shareTimerRef.current = window.setTimeout(() => setShareStatus(''), 1800)
      }
    }
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
    if (!await confirm({ title: 'Delete conversation?', message: `"${conversation?.title || 'This conversation'}" and its message history will be permanently removed.`, confirmLabel: 'Delete conversation' })) return
    const previous = chats
    setChats((current) => current.filter((item) => resolveId(item) !== id))
    if (id === chatId) newConversation()
    try { await deleteAIChat(id) }
    catch (next) { setChats(previous); setError(next.message) }
  }

  return <AppShell><div className={`ai-workspace ${sidebarCollapsed ? 'ai-workspace--sidebar-collapsed' : ''}`}>
    {sidebarOpen && <button className="ai-sidebar-backdrop" aria-label="Close conversation history" onClick={() => setSidebarOpen(false)} />}
    <aside className={sidebarOpen ? 'open' : ''} aria-label="Recent AI chats" aria-modal={sidebarOpen ? 'true' : undefined}>
      <div className="ai-sidebar-brand"><span><Sparkles /></span><div><b>EsyGlob AI</b><small>Marketplace copilot</small></div><button className="ai-sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar"><X /></button></div>
      <button className="ai-new-chat" onClick={newConversation}><Plus /> New conversation</button>
      <div className="ai-history-tools"><UnifiedSearchInput compact suggestions={false} value={historySearch} onChange={setHistorySearch} onSubmit={setHistorySearch} placeholder="Search conversations" /><label className="ai-history-sort"><span>Sort</span><select value={historySort} onChange={(event) => setHistorySort(event.target.value)}><option value="recent">Most recent</option><option value="oldest">Oldest first</option></select><ChevronDown /></label></div>
      <div className="ai-sidebar-head"><b><History /> Recent chats</b><small>{visibleChats.length}</small></div>
      <div className="ai-history-list">{historyLoading ? <div className="ai-history-empty"><div className="typing-dots"><span /><span /><span /></div><p>Loading chats...</p></div> : visibleChats.length ? visibleChats.map((item) => {
        const id = resolveId(item)
        const timestamp = item.lastMessageAt || item.updatedAt || item.createdAt
        return <div className={`ai-history-row ${id === chatId ? 'active' : ''}`} key={id}>
          {editingId === id ? <form onSubmit={(event) => { event.preventDefault(); renameConversation(id) }}><input autoFocus maxLength={90} value={editingTitle} onChange={(event) => setEditingTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setEditingId('') }} /><button title="Save name"><Check /></button></form> : <button className="ai-history-main" title={item.title || 'Marketplace assistant'} onClick={() => { if (!busy) { setChatId(id); setSidebarOpen(false); setError('') } }}><span><b>{item.title || 'Marketplace assistant'}</b><small>{timestamp ? new Date(timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : `${item.totalMessages || 0} messages`}</small></span></button>}
          {editingId !== id && <div className="ai-history-actions"><button title="Rename conversation" onClick={() => { setEditingId(id); setEditingTitle(item.title || 'Marketplace assistant') }}><Pencil /></button><button title="Delete conversation" onClick={() => removeConversation(id)}><Trash2 /></button></div>}
        </div>
      }) : <div className="ai-history-empty"><History /><b>{historySearch ? 'No chats found' : 'No saved chats yet'}</b><p>{historySearch ? 'Try a different search.' : 'Your conversations will appear here.'}</p></div>}</div>
    </aside>
    <section className={`ai-chat ${!messages.length && !conversationLoading ? 'ai-chat--empty' : ''}`}>
      <header>
        <div className="ai-chat-identity">
          <button className="ai-desktop-sidebar-toggle" type="button" onClick={() => setSidebarCollapsed((value) => !value)} aria-label={sidebarCollapsed ? 'Expand conversation sidebar' : 'Collapse conversation sidebar'} aria-expanded={!sidebarCollapsed}>{sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</button>
          <button className="ai-mobile-back" onClick={() => navigate(-1)} aria-label="Go back"><ArrowLeft /></button>
          <button className="ai-mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open recent chats"><Menu /><span>Chats</span></button>
          <i><Sparkles /></i>
          <span><small>EsyGlob AI</small><h1>{active?.title || 'New conversation'}</h1><p><em /> Ready to help <span>· {role}</span></p></span>
        </div>
        <div className="ai-header-actions">
          <AICreditMeter state={creditState} role={role} compact />
          <span className="ai-share-status" role="status">{shareStatus}</span>
          <button className="ai-header-tool ai-share-button" type="button" onClick={shareConversation} aria-label="Share conversation"><Share2 /><span>Share</span></button>
          <details className="ai-conversation-menu" ref={conversationMenuRef}>
            <summary aria-label="Conversation options"><MoreHorizontal /></summary>
            <div>
              <button type="button" disabled={!chatId} onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); setEditingId(chatId); setEditingTitle(active?.title || 'Marketplace assistant'); setSidebarOpen(true) }}><Pencil /> Rename conversation</button>
              <button type="button" className="danger" disabled={!chatId} onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); removeConversation(chatId) }}><Trash2 /> Delete conversation</button>
            </div>
          </details>
          <button className="ai-header-new" onClick={newConversation}><Plus /> <span>New chat</span></button>
        </div>
      </header>
      <div
        className="ai-messages"
        ref={messagesRef}
        role="log"
        aria-live="polite"
        aria-busy={busy || conversationLoading}
        onScroll={(event) => {
          const element = event.currentTarget
          stickToBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120
        }}
      >{conversationLoading ? <div className="ai-loading"><div className="ai-loading-orb"><Sparkles /></div><div className="typing-dots"><span /><span /><span /></div><p>Opening your conversation...</p></div> : !messages.length ? <div className="ai-welcome"><i><Sparkles /></i><span className="eyebrow">EsyGlob AI sourcing workspace</span><h2>All your sourcing tasks, one conversation.</h2><p>Discover products, evaluate verified suppliers, prepare RFQs and understand global markets with live EsyGlob context.</p><div className="ai-welcome-prompts">{prompts.map((text) => <button key={text} onClick={() => promptFromMessage(text)}><Sparkles /><span>{text}</span></button>)}</div><div className="ai-welcome-capabilities" aria-label="EsyGlob AI capabilities"><span><Check /> Marketplace-aware</span><span><Check /> Procurement focused</span><span><Check /> Available 24/7</span></div></div> : messages.map((item, index) => <AIMessage key={item._id || index} item={item} user={user} onPrompt={promptFromMessage} onRegenerate={regenerateMessage} regenerateIndex={item.role === 'assistant' && !item.streaming ? index : null} />)}<div ref={endRef} /></div>
      <div className="ai-composer-dock">
        {attachments.length > 0 && <div className="ai-attachments">{attachments.map((item, index) => <span key={`${item.url}-${index}`}>{item.mimeType?.startsWith('image/') ? <Image /> : <FileText />}<b>{item.name}</b><button type="button" aria-label={`Remove ${item.name}`} onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X /></button></span>)}</div>}
        {error && <div className="ai-error"><span>{error}</span>{failed && <button onClick={() => send(failed)}><RefreshCw /> Retry</button>}</div>}
        <form className="ai-composer" ref={composerRef} onSubmit={(event) => { event.preventDefault(); send() }}>
          <div className="ai-plus-wrap">
            <button type="button" className="ai-plus-button" disabled={uploading || busy} aria-label="Add attachment" aria-expanded={attachmentMenuOpen} onClick={() => setAttachmentMenuOpen((value) => !value)}><Plus /></button>
            {attachmentMenuOpen && <div className="ai-attachment-popover" role="menu" aria-label="Attachment options">
              <button type="button" onClick={() => { setAttachmentMenuOpen(false); cameraRef.current?.click() }}><Camera /><span><b>Camera</b><small>Take a photo</small></span></button>
              <button type="button" onClick={() => { setAttachmentMenuOpen(false); imageRef.current?.click() }}><Image /><span><b>Upload image</b><small>PNG, JPG or WebP</small></span></button>
              <button type="button" onClick={() => { setAttachmentMenuOpen(false); fileRef.current?.click() }}><File /><span><b>Upload file</b><small>Choose any supported file</small></span></button>
              <button type="button" onClick={() => { setAttachmentMenuOpen(false); documentRef.current?.click() }}><Upload /><span><b>Upload document</b><small>PDF, Word, Excel or text</small></span></button>
            </div>}
          </div>
          <input ref={imageRef} hidden type="file" accept="image/*" multiple onChange={attach} />
          <input ref={cameraRef} hidden type="file" accept="image/*" capture="environment" onChange={attach} />
          <input ref={fileRef} hidden type="file" multiple onChange={attach} />
          <input ref={documentRef} hidden type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt" multiple onChange={attach} />
          <textarea ref={textareaRef} rows="1" value={draft} disabled={conversationLoading} maxLength={12000} aria-label="Message EsyGlob AI" onFocus={() => { stickToBottomRef.current = true; requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: 'end' })) }} onChange={(event) => setDraft(event.target.value)} placeholder={uploading ? 'Uploading securely...' : busy ? 'EsyGlob AI is responding...' : 'Message EsyGlob AI'} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send() } }} />
          <div className="ai-composer-actions"><button type="button" className="ai-composer-tool" aria-label="Attach an image for visual search" title="Search with an image" disabled={uploading || busy} onClick={() => imageRef.current?.click()}><Image /></button><button type="button" className={`ai-composer-tool ${voiceListening ? 'is-listening' : ''}`} aria-label={voiceListening ? 'Listening' : 'Dictate message'} title="Voice input" disabled={busy} onClick={startVoiceMessage}>{voiceListening ? <span className="ai-send-loader" /> : <Mic />}</button>{busy ? <button type="button" className="ai-send-button" aria-label="Stop generation" title="Stop generation" onClick={() => streamRef.current?.abort()}><X /></button> : <button className="ai-send-button" aria-label="Send message" disabled={uploading || (!draft.trim() && !attachments.length)}><Send /></button>}</div>
        </form>
        <small className="ai-disclaimer">AI can make mistakes. Verify important commercial and compliance details.</small>
      </div>
    </section>
    <AICreditDialog open={creditDialogOpen} onClose={() => setCreditDialogOpen(false)} role={role} credits={creditState.credits} />
  </div></AppShell>
}

const AIMessage = memo(function AIMessage({ item, user, onPrompt, onRegenerate, regenerateIndex }) {
  const metadata = item.metadata || {}
  const marketplace = metadata.marketplace || {}
  const products = Array.isArray(metadata.topProducts || marketplace.topProducts) ? metadata.topProducts || marketplace.topProducts : []
  const suppliers = Array.isArray(metadata.topSuppliers || marketplace.topSuppliers) ? metadata.topSuppliers || marketplace.topSuppliers : []
  const rawSuggestions = metadata.suggestions || metadata.suggestedFollowUps || marketplace.suggestedFollowUps || []
  const suggestions = (Array.isArray(rawSuggestions) ? rawSuggestions : []).map((value) => typeof value === 'string' ? value : value?.prompt || value?.label || value?.title).filter(Boolean)
  const sources = (Array.isArray(metadata.sources) ? metadata.sources : []).filter((source) => source?.url && source?.title).slice(0, 3)
  const attachmentUrls = metadata.attachmentUrls || metadata.pluginPayload?.attachmentUrls || []
  const content = String(item.content || item.message || (item.streaming ? item.statusText || 'Preparing your answer...' : ''))
  return <article className={item.role === 'user' ? 'user' : 'assistant'}><i>{item.role === 'user' ? String(user?.name || user?.fullName || 'U').slice(0, 1) : <Bot />}</i><div><RichMessage content={content} streaming={item.streaming} />{attachmentUrls.length > 0 && <div className="ai-message-files">{attachmentUrls.map((value, index) => <a href={resolveApiResourceUrl(typeof value === 'string' ? value : value.url)} target="_blank" rel="noreferrer" key={index}><Paperclip /> Attachment {index + 1}</a>)}</div>}{products.length > 0 && <div className="ai-result-cards">{products.map((product, index) => { const id = resolveId(product); const image = product.image || product.images?.[0]; return <Link to={product.link || (id ? `/products/${id}` : '/products')} key={id || index}>{image && <img src={resolveApiResourceUrl(image)} alt="" loading="lazy" decoding="async" />}<span><b>{product.name || product.title || 'Marketplace product'}</b><small><Money value={product.price} currency={product.currency} /> · MOQ {product.moq || product.minimumOrderQuantity || 1}</small></span></Link> })}</div>}{suppliers.length > 0 && <div className="ai-supplier-links">{suppliers.map((supplier, index) => { const id = resolveId(supplier); return <Link to={id ? `/sellers/${id}` : '/sellers'} key={id || index}><Store /><span><b>{supplier.companyName || supplier.name || 'Marketplace supplier'}</b><small>{supplier.verified || supplier.isVerified ? 'Verified · ' : ''}{supplier.country || 'Global supplier'}</small></span></Link> })}</div>}{sources.length > 0 && <div className="ai-message-files" aria-label="Sources">{sources.map((source, index) => <a href={source.url} target="_blank" rel="noreferrer" key={source.url}><FileText /> Source {index + 1}: {source.title}</a>)}</div>}{suggestions.length > 0 && <div className="ai-suggestions">{suggestions.map((value) => <button key={value} onClick={() => onPrompt(value)}>{value}</button>)}</div>}<footer><small>{item.createdAt || item.timestamp ? new Date(item.createdAt || item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</small>{content && !item.streaming && <button type="button" onClick={() => navigator.clipboard?.writeText(content)}><Copy /> Copy</button>}{regenerateIndex !== null && <button onClick={() => onRegenerate(regenerateIndex)}><RefreshCw /> Regenerate</button>}</footer></div></article>
})

function clearChatPerformanceEntries(streamMessageId) {
  const marks = ['request', 'optimistic-visible', 'first-token', 'first-visible', 'generation-complete', 'complete']
  const measures = ['optimistic-latency', 'first-token-latency', 'first-visible-latency', 'generation-latency', 'total']
  marks.forEach((name) => globalThis.performance?.clearMarks?.(`${streamMessageId}:${name}`))
  measures.forEach((name) => globalThis.performance?.clearMeasures?.(`${streamMessageId}:${name}`))
}

const RichMessage = memo(function RichMessage({ content, streaming }) {
  if (streaming) return <div className="ai-rich-message ai-rich-message--streaming">{content || 'Preparing your answer...'}<span className="ai-stream-cursor" /></div>
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
    if (/^\s*>\s?/.test(line)) { const quote = []; while (index < lines.length && /^\s*>\s?/.test(lines[index])) { quote.push(lines[index].replace(/^\s*>\s?/, '')); index += 1 } nodes.push(<blockquote key={`quote-${index}`}>{quote.map((value, quoteIndex) => <p key={quoteIndex}>{inlineMarkdown(value)}</p>)}</blockquote>); continue }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    if (heading) { const Tag = `h${heading[1].length + 2}`; nodes.push(<Tag key={`heading-${index}`}>{inlineMarkdown(heading[2])}</Tag>); index += 1; continue }
    if (line.trim()) nodes.push(<p key={`paragraph-${index}`}>{inlineMarkdown(line)}</p>)
    index += 1
  }
  return <div className="ai-rich-message">{nodes.length ? nodes : <p>Preparing your answer...</p>}</div>
})

function inlineMarkdown(value) {
  return String(value).split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)]+\))/g).filter(Boolean).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>
    const link = /^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/.exec(part)
    if (link) return <a href={link[2]} target="_blank" rel="noreferrer" key={index}>{link[1]}</a>
    return part
  })
}
