import {
  Building2,
  Camera,
  Clock3,
  Grid2X2,
  LoaderCircle,
  Mic,
  PackageSearch,
  Search,
  ScanSearch,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { fetchSearchSuggestions } from '../api/marketplace'
import { resolveApiResourceUrl } from '../api/client'
import { useAuth } from '../auth/auth-context'

const popularSearches = ['Steel pipe', 'Packaging machinery', 'Cotton fabric', 'Freight forwarding']

const typeIcons = {
  product: PackageSearch,
  manufacturer: Building2,
  supplier: Building2,
  category: Grid2X2,
  subcategory: Grid2X2,
  service: Wrench,
}

export default function UnifiedSearchInput({
  value = '',
  onChange,
  onSubmit,
  placeholder = 'Search products, manufacturers, services and categories',
  ariaLabel = 'Search',
  className = '',
  autoFocus = false,
  suggestions = true,
  showSubmit = false,
  submitLabel = 'Search',
  compact = false,
  imageSearchPath = '/explore/image-search',
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const { status } = useAuth()
  const rootRef = useRef(null)
  const fileRef = useRef(null)
  const recognitionRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [listening, setListening] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])

  useEffect(() => () => recognitionRef.current?.abort?.(), [])

  useEffect(() => {
    if (!suggestions || !open || value.trim().length < 2) return undefined

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setLoading(true)
      fetchSearchSuggestions(value.trim(), { signal: controller.signal })
        .then((items) => setResults(items))
        .catch((error) => {
          if (error?.name !== 'AbortError') setResults([])
        })
        .finally(() => setLoading(false))
    }, 180)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [open, suggestions, value])

  function update(next) {
    onChange?.(next)
    setMessage('')
    setOpen(true)
  }

  function commit(next = value) {
    const query = String(next || '').trim()
    setOpen(false)
    onSubmit?.(query)
  }

  function startVoiceSearch() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setMessage('Voice search is not supported by this browser.')
      return
    }

    recognitionRef.current?.abort?.()
    const recognition = new SpeechRecognition()
    recognition.lang = navigator.language || 'en-IN'
    recognition.interimResults = true
    recognition.continuous = false
    let finalTranscript = ''

    recognition.onstart = () => {
      setListening(true)
      setMessage('Listening…')
      setOpen(false)
    }
    recognition.onresult = (event) => {
      let transcript = ''
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        transcript += event.results[index][0]?.transcript || ''
        if (event.results[index].isFinal) finalTranscript += event.results[index][0]?.transcript || ''
      }
      update((finalTranscript || transcript).trim())
    }
    recognition.onerror = (event) => {
      setListening(false)
      setMessage(event.error === 'not-allowed' ? 'Allow microphone access to use voice search.' : 'Voice search could not hear you. Please retry.')
    }
    recognition.onend = () => {
      setListening(false)
      if (finalTranscript.trim()) {
        setMessage('')
        onSubmit?.(finalTranscript.trim())
      } else {
        setMessage((current) => current === 'Listening…' ? 'No speech detected. Please retry.' : current)
      }
    }
    recognitionRef.current = recognition
    recognition.start()
  }

  function openImagePicker() {
    if (status !== 'authenticated') {
      navigate('/login', { state: { from: imageSearchPath } })
      return
    }
    fileRef.current?.click()
  }

  function selectImage(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setMessage('Choose a JPG, PNG or WebP image.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage('Image must be smaller than 5MB.')
      return
    }
    navigate(imageSearchPath, {
      state: { imageFile: file, autoSearch: true, from: `${location.pathname}${location.search}` },
    })
  }

  function chooseSuggestion(item) {
    const safeHref = suggestionHref(item)
    if (safeHref) {
      setOpen(false)
      navigate(safeHref)
      return
    }
    update(item.label)
    commit(item.label)
  }

  const showPanel = open && suggestions
  const popular = !value.trim()
  const visibleResults = value.trim().length >= 2 ? results : []

  return <div className={`unified-search ${compact ? 'unified-search--compact' : ''} ${listening ? 'is-listening' : ''} ${className}`.trim()} ref={rootRef}>
    <div className="unified-search__control">
      <Search className="unified-search__leading" />
      <input
        className="unified-search__input"
        autoFocus={autoFocus}
        type="search"
        value={value}
        onChange={(event) => update(event.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
          }
          if (event.key === 'Escape') setOpen(false)
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-expanded={showPanel}
        aria-autocomplete={suggestions ? 'list' : 'none'}
      />
      {!!value && <button type="button" className="unified-search__clear" onClick={() => update('')} aria-label="Clear search"><X /></button>}
      <button type="button" className="unified-search__tool unified-search__voice" onClick={startVoiceSearch} aria-label={listening ? 'Listening for voice search' : 'Search by voice'} title="Search by voice">
        <Mic />
      </button>
      <button type="button" className="unified-search__tool" onClick={openImagePicker} aria-label="Search by image" title="Search by image"><ScanSearch /></button>
      <input ref={fileRef} hidden type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={selectImage} />
      {showSubmit && <button type="button" className="unified-search__submit" onClick={() => commit()}><Search /><span>{submitLabel}</span></button>}
    </div>

    {!!message && <div className="unified-search__status" role="status">{listening ? <Mic /> : <Sparkles />}{message}</div>}

    {showPanel && <div className="unified-search__panel" role="listbox">
      <header className="unified-search__panel-head"><span>{popular ? <><Clock3 /> Popular searches</> : <><Sparkles /> Live marketplace matches</>}</span>{loading && <LoaderCircle className="spin" />}</header>
      {popular ? <div className="unified-search__popular">{popularSearches.map((item) => <button type="button" onClick={() => { update(item); commit(item) }} key={item}>{item}</button>)}</div>
        : visibleResults.length ? <div className="unified-search__results">{visibleResults.map((item) => {
          const Icon = typeIcons[item.type] || Search
          return <button type="button" className="unified-search__suggestion" role="option" onClick={() => chooseSuggestion(item)} key={`${item.type}-${item.id || item.label}`}>
            <i className="unified-search__suggestion-icon">{item.image ? <img src={resolveApiResourceUrl(item.image)} alt="" loading="lazy" /> : <Icon />}</i>
            <span className="unified-search__suggestion-copy"><strong>{item.label}</strong><small>{item.meta || item.type}</small></span>
            <em className="unified-search__suggestion-type">{item.type}</em>
          </button>
        })}</div>
          : !loading && <div className="unified-search__empty"><Search /><span><b>No close suggestions yet</b><small>Press Enter to search the full marketplace.</small></span></div>}
      {!popular && <button type="button" className="unified-search__all" onClick={() => commit()}><Search /> See all results for “{value.trim()}”</button>}
      <footer><Camera /> Upload a product photo for visual matching</footer>
    </div>}
  </div>
}

function suggestionHref(item) {
  const href = String(item?.href || '')
  if (!href.startsWith('/') || href.startsWith('//')) return ''
  if (item.type === 'subcategory') return `/products?category=${encodeURIComponent(item.label || '')}`
  const supported = /^\/(?:products(?:\/[^/?#]+)?|sellers(?:\/[^/?#]+)?|categories(?:\/[^/?#]+)?|services(?:\/[^/?#]+)?|rfqs(?:\/[^/?#]+)?)(?:[?#].*)?$/
  return supported.test(href) ? href : ''
}
