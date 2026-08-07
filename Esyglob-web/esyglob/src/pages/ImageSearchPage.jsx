import { Camera, ImagePlus, RefreshCw, Search, Sparkles, Upload, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { searchByImage } from '../api/marketplace'
import { useAuth } from '../auth/auth-context'
import AppShell from '../components/AppShell'
import { ProductCard } from '../components/MarketplaceCards'
import { PageHead } from '../components/PageHead'
import SellerListingCard from '../components/SellerListingCard'

const EMPTY_STATE = { loading: false, error: '', data: null }

export default function ImageSearchPage() {
  const location = useLocation()
  const { user } = useAuth()
  const role = user?.primaryRole || 'buyer'
  const cameraRef = useRef(null)
  const uploadRef = useRef(null)
  const initialImageHandled = useRef(false)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [query, setQuery] = useState('')
  const [state, setState] = useState(EMPTY_STATE)
  const [dragging, setDragging] = useState(false)

  useEffect(() => () => {
    if (preview.startsWith('blob:')) URL.revokeObjectURL(preview)
  }, [preview])

  function acceptFile(next) {
    if (!next) return
    if (!next.type.startsWith('image/')) {
      setState({ loading: false, error: 'Choose a JPG, PNG or WebP image.', data: null })
      return
    }
    if (next.size > 5 * 1024 * 1024) {
      setState({ loading: false, error: 'Image must be smaller than 5MB.', data: null })
      return
    }
    console.info('[ImageSearch]', {
      event: 'image_selected',
      mimeType: next.type,
      sizeBytes: next.size,
      source: next === location.state?.imageFile ? 'navigation' : 'picker_or_drop',
    })
    setFile(next)
    setPreview(URL.createObjectURL(next))
    setState(EMPTY_STATE)
  }

  function clear() {
    setFile(null)
    setPreview('')
    setState(EMPTY_STATE)
    if (cameraRef.current) cameraRef.current.value = ''
    if (uploadRef.current) uploadRef.current.value = ''
  }

  async function searchFile(nextFile, description = query) {
    const data = await searchByImage(nextFile, description, role)
    if (data.imageSearch?.imageUrl) setPreview(data.imageSearch.imageUrl)
    setState({ loading: false, error: '', data })
  }

  async function submit(event) {
    event.preventDefault()
    if (!file) {
      setState({ loading: false, error: 'Upload or capture a product image first.', data: null })
      return
    }
    setState({ loading: true, error: '', data: null })
    try {
      await searchFile(file)
    } catch (error) {
      console.error('[ImageSearch]', {
        event: 'search_failed',
        message: error.message,
        code: error.code,
        status: error.status,
        requestId: error.requestId,
      })
      setState({ loading: false, error: error.message, data: null })
    }
  }

  useEffect(() => {
    const pending = location.state?.imageFile
    if (!pending || initialImageHandled.current) return
    initialImageHandled.current = true
    const timer = window.setTimeout(() => {
      acceptFile(pending)
      if (!location.state?.autoSearch) return
      setState({ loading: true, error: '', data: null })
      searchFile(pending, '').catch((error) => {
        console.error('[ImageSearch]', {
          event: 'automatic_search_failed',
          message: error.message,
          code: error.code,
          status: error.status,
          requestId: error.requestId,
        })
        setState({ loading: false, error: error.message, data: null })
      })
    }, 0)
    return () => window.clearTimeout(timer)
    // The navigation state is intentionally consumed only once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, role])

  const data = state.data
  const suggestions = (Array.isArray(data?.suggestions) ? data.suggestions : [])
    .map((item) => typeof item === 'string' ? item : item?.prompt || item?.label || item?.title)
    .filter(Boolean)

  return <AppShell>
    <div className="container visual-search-page">
      <PageHead
        eyebrow="AI visual sourcing"
        title="Search the marketplace by image"
        description="Upload or capture a product photo. EsyGlob identifies visible attributes and ranks matching products, categories and suppliers."
      />
      <form className="visual-search-workspace" onSubmit={submit}>
        <div
          className={`visual-dropzone ${preview ? 'has-image' : ''} ${dragging ? 'is-dragging' : ''}`}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false) }}
          onDrop={(event) => { event.preventDefault(); setDragging(false); acceptFile(event.dataTransfer.files?.[0]) }}
        >
          {preview ? <>
            <img src={preview} alt="Product selected for visual search" />
            <button type="button" onClick={clear} aria-label="Remove image"><X /></button>
          </> : <>
            <i><ImagePlus /></i>
            <h2>{dragging ? 'Release to use this image' : 'Drop in a clear product image'}</h2>
            <p>JPG, PNG or WebP · Maximum 5MB</p>
            <div>
              <button type="button" className="button button--primary" onClick={() => uploadRef.current?.click()}><Upload /> Upload image</button>
              <button type="button" className="button button--secondary" onClick={() => cameraRef.current?.click()}><Camera /> Use camera</button>
            </div>
          </>}
          <input ref={uploadRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => acceptFile(event.target.files?.[0])} />
          <input ref={cameraRef} hidden type="file" accept="image/*" capture="environment" onChange={(event) => acceptFile(event.target.files?.[0])} />
        </div>
        <aside>
          <label>
            Optional product description
            <textarea value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. recycled cotton tote bag, bulk order" />
          </label>
          <button className="button button--primary button--full" disabled={state.loading || !file}>
            <Search /> {state.loading ? 'Analyzing and searching…' : 'Find visual matches'}
          </button>
          <small><Sparkles /> Clear, centered product photos produce the strongest matches.</small>
        </aside>
      </form>

      {state.error && <div className="inline-error">{state.error}</div>}
      {data && <div className="visual-results">
        <section className="visual-analysis">
          <div><Sparkles /></div>
          <span>
            <small>{data.imageSearch?.status === 'analyzed' ? 'IMAGE SEARCH COMPLETE' : 'MARKETPLACE SEARCH COMPLETE'}</small>
            <h2>Products and suppliers matched to your image</h2>
            <p>{data.answer}</p>
          </span>
          <button className="button button--secondary" onClick={clear}><RefreshCw /> New image</button>
        </section>
        {data.categories?.length > 0 && <ResultSection title="Similar categories">
          <div className="visual-categories">{data.categories.map((item) =>
            <Link key={item._id || item.id || item.slug} to={`/categories/${item._id || item.id || item.slug}`}>{item.name || item.title}</Link>
          )}</div>
        </ResultSection>}
        {data.products?.length > 0 && <ResultSection title="Visually similar products" count={`${data.products.length} ranked matches`}>
          <div className="product-grid">{data.products.map((item) => <ProductCard key={item._id || item.id} product={item} />)}</div>
        </ResultSection>}
        {data.sellers?.length > 0 && <ResultSection title="Matching suppliers" count={`${data.sellers.length} matches`}>
          <div className="visual-seller-list">{data.sellers.map((item) => <SellerListingCard key={item._id || item.id} seller={item} />)}</div>
        </ResultSection>}
        {!data.products?.length && !data.sellers?.length && <div className="empty-results">
          <Camera /><h2>No strong marketplace matches</h2><p>Retake the photo in good light with one product centered, or add a short description.</p>
        </div>}
        {suggestions.length > 0 && <section className="visual-recommendations">
          <h2>Refine your next search</h2>
          {suggestions.map((item) => <button key={item} type="button" onClick={() => setQuery(item)}>{item}</button>)}
        </section>}
      </div>}
    </div>
  </AppShell>
}

function ResultSection({ title, count, children }) {
  return <section className="result-section">
    <div className="compact-heading"><h2>{title}</h2>{count && <span>{count}</span>}</div>
    {children}
  </section>
}
