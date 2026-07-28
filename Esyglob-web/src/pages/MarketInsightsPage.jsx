import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileChartColumnIncreasing,
  FileText,
  LoaderCircle,
  Printer,
  RefreshCw,
  Share2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  deleteMarketReport,
  fetchMarketReportPdf,
  fetchMarketReports,
  regenerateMarketReport,
  shareMarketReport,
  streamMarketResearch,
} from '../api/account'
import AppShell from '../components/AppShell'
import { PageHead } from '../components/PageHead'
import { useConfirm } from '../components/EnterpriseUX'

const PAGE_SIZE = 12

export default function MarketInsightsPage() {
  const confirm = useConfirm()
  const abortRef = useRef(null)
  const previewAbortRef = useRef(null)
  const previewUrlRef = useRef('')
  const [query, setQuery] = useState('')
  const [reports, setReports] = useState([])
  const [pagination, setPagination] = useState({ page: 1, total: 0, hasMore: false })
  const [selected, setSelected] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [busyReportId, setBusyReportId] = useState('')
  const [progress, setProgress] = useState({ value: 0, label: '' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // ==================== REPORT ID HELPER ====================
  function reportId(report) {
    if (!report) return ''
    return String(report?.savedReportId || report?._id || report?.reportId || '')
  }

  function isValidObjectId(id) {
    return typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id)
  }

  // ==================== LOAD REPORTS ====================
  const loadReports = useCallback(async (page = 1, append = false) => {
    append ? setLoadingMore(true) : setLoading(true)
    setError('')
    try {
      const result = await fetchMarketReports(page, PAGE_SIZE)
      const validReports = (result.reports || []).filter(r => {
        const id = reportId(r)
        const valid = isValidObjectId(id)
        if (!valid) console.warn('Report with invalid ID filtered out:', { id, title: r.title })
        return valid
      })
      setReports(current => append ? dedupeReports([...current, ...validReports]) : validReports)
      setPagination(result.pagination || { page, total: validReports.length, hasMore: false })
    } catch (next) {
      setError(next.message || 'Failed to load reports')
      if (!append) setReports([])
    } finally {
      append ? setLoadingMore(false) : setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => loadReports(), 0)
    return () => window.clearTimeout(timer)
  }, [loadReports])
  useEffect(() => () => { abortRef.current?.abort() }, [])

  // ==================== PREVIEW PDF ====================
  useEffect(() => {
    previewAbortRef.current?.abort()
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = ''
    queueMicrotask(() => setPreviewUrl(''))

    const id = reportId(selected)
    if (!id || !isValidObjectId(id)) {
      queueMicrotask(() => setPreviewLoading(false))
      return undefined
    }

    const controller = new AbortController()
    previewAbortRef.current = controller
    queueMicrotask(() => {
      setPreviewLoading(true)
      setError('')
    })

    fetchMarketReportPdf(id, false, controller.signal)
      .then(({ blob }) => {
        if (!controller.signal.aborted) {
          const nextUrl = URL.createObjectURL(blob)
          previewUrlRef.current = nextUrl
          setPreviewUrl(nextUrl)
        }
      })
      .catch(next => {
        if (next.name !== 'AbortError') {
          console.warn('PDF preview failed:', { id, error: next.message })
          setError(next.message || 'Failed to load PDF preview')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setPreviewLoading(false)
      })

    return () => controller.abort()
  }, [selected])

  useEffect(() => () => {
    previewAbortRef.current?.abort()
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
  }, [])

  // ==================== ESCAPE KEY ====================
  useEffect(() => {
    if (!selected) return undefined
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = event => { if (event.key === 'Escape') setSelected(null) }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [selected])

  // ==================== GENERATE REPORT ====================
  async function generate(event) {
    event.preventDefault()
    const researchQuery = query.trim()
    if (!researchQuery || busy) return

    setBusy(true)
    setError('')
    setNotice('')
    setProgress({ value: 2, label: 'Preparing research plan' })

    const controller = new AbortController()
    abortRef.current = controller
    let completed = null
    let streamError = ''

    try {
      await streamMarketResearch(
        { query: researchQuery, mode: 'product_rd' },
        (eventData) => {
          if (['research_started', 'step', 'section_ready'].includes(eventData.type)) {
            setProgress(current => ({
              value: Math.max(current.value, Math.min(99, Number(eventData.progress || 0))),
              label: eventData.operation || eventData.agent || 'Building professional PDF',
            }))
          }
          if (eventData.type === 'report') {
            completed = eventData.report
            console.log('Report stream completed:', {
              savedReportId: completed?.savedReportId,
              pdfStatus: completed?.pdfStatus,
              title: completed?.title,
            })
          }
          if (eventData.type === 'error') {
            streamError = eventData.message || 'Report generation failed'
          }
        },
        controller.signal
      )

      if (streamError) throw new Error(streamError)

      // Validate completed report has valid ID
      const completedId = reportId(completed)
      if (!completed || !isValidObjectId(completedId)) {
        throw new Error('The report stream ended but no valid report ID was returned. Please retry.')
      }

      setProgress({ value: 100, label: 'PDF ready' })

      // Add to reports list
      setReports(current => dedupeReports([completed, ...current]))
      setPagination(current => ({ ...current, total: current.total + 1, hasMore: true }))

      // Auto-select the new report to show preview
      setSelected(completed)
      setQuery('')
      setNotice('Your report is ready and has been saved.')

    } catch (next) {
      if (next.name !== 'AbortError') {
        console.error('Report generation failed:', next.message)
        setError(next.message || 'Report generation failed')
      }
    } finally {
      abortRef.current = null
      setBusy(false)
    }
  }

  // ==================== DELETE REPORT ====================
  async function remove(report) {
    const id = reportId(report)
    if (!id || !isValidObjectId(id)) {
      setError('Cannot delete report: Invalid report ID')
      console.error('Delete failed - invalid ID:', { id, report: report?.title })
      return
    }

    if (!await confirm({ title: 'Delete market report?', message: `"${report.title || 'This report'}" and its stored PDF will be permanently deleted.`, confirmLabel: 'Delete report' })) return

    const previous = [...reports]
    setBusyReportId(id)
    setError('')
    setReports(current => current.filter(item => reportId(item) !== id))
    if (reportId(selected) === id) setSelected(null)

    try {
      await deleteMarketReport(id)
      setPagination(current => ({ ...current, total: Math.max(0, current.total - 1) }))
      setNotice('Report deleted permanently.')
    } catch (next) {
      setReports(previous)
      setError(next.message || 'Failed to delete report')
      console.error('Delete error:', next)
    } finally {
      setBusyReportId('')
    }
  }

  // ==================== REGENERATE REPORT ====================
  async function regenerate(report) {
    const id = reportId(report)
    if (!id || !isValidObjectId(id)) {
      setError('Cannot regenerate report: Invalid report ID')
      return
    }

    setBusyReportId(id)
    setError('')
    setNotice('')

    try {
      const regenerated = await regenerateMarketReport(id)
      if (!regenerated || !reportId(regenerated)) {
        throw new Error('Report regeneration returned empty result')
      }

      setReports(current => dedupeReports([regenerated, ...current]))
      setPagination(current => ({ ...current, total: current.total + 1, hasMore: true }))
      setSelected(regenerated)
      setNotice('A refreshed report has been generated and saved.')
    } catch (next) {
      setError(next.message || 'Failed to regenerate report')
      console.error('Regenerate error:', next)
    } finally {
      setBusyReportId('')
    }
  }

  // ==================== DOWNLOAD REPORT ====================
  async function download(report = selected) {
    if (!report) return
    const id = reportId(report)
    if (!id || !isValidObjectId(id)) {
      setError('Cannot download report: Invalid report ID')
      return
    }

    setBusyReportId(id)
    try {
      const { blob, filename } = await fetchMarketReportPdf(id, true)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename || 'market-report.pdf'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setNotice('Report downloaded successfully.')
    } catch (next) {
      setError(next.message || 'Failed to download report')
      console.error('Download error:', next)
    } finally {
      setBusyReportId('')
    }
  }

  // ==================== SHARE REPORT ====================
  async function share(report = selected, copyOnly = false) {
    if (!report) return
    const id = reportId(report)
    if (!id || !isValidObjectId(id)) {
      setError('Cannot share report: Invalid report ID')
      return
    }

    setBusyReportId(id)
    setError('')
    try {
      const { shareUrl } = await shareMarketReport(id)
      if (!shareUrl) throw new Error('Share URL not received')

      const shareData = {
        title: report.title || 'EsyGlob Market Intelligence',
        text: report.description || report.query || '',
        url: shareUrl,
      }

      if (!copyOnly && navigator.share) {
        await navigator.share(shareData)
      } else {
        await navigator.clipboard.writeText(shareUrl)
        setNotice('Secure report link copied to clipboard.')
      }
    } catch (next) {
      if (next.name !== 'AbortError') {
        setError(next.message || 'Failed to share report')
        console.error('Share error:', next)
      }
    } finally {
      setBusyReportId('')
    }
  }

  // ==================== PDF ACTIONS ====================
  function openInNewTab() {
    if (previewUrl) window.open(previewUrl, '_blank', 'noopener,noreferrer')
  }

  function printReport() {
    if (!previewUrl) return
    const printWindow = window.open(previewUrl, '_blank')
    setTimeout(() => {
      printWindow?.focus()
      printWindow?.print()
    }, 900)
  }

  // ==================== RENDER ====================
  return (
    <AppShell>
      <main className="container market-report-page">
        <PageHead
          eyebrow="AI market intelligence"
          title="Decision-ready market research"
          description="Turn a sourcing or expansion question into a professionally designed, evidence-aware PDF you can preview, share and revisit."
        />

        {/* Hero Form */}
        <section className="market-report-hero">
          <div className="market-report-hero__copy">
            <span><FileChartColumnIncreasing /> Enterprise research workspace</span>
            <h2>From market question to boardroom-ready PDF.</h2>
            <p>Reports combine trade evidence, marketplace context and structured analysis while clearly identifying data gaps.</p>
          </div>
          <form className="market-report-request" onSubmit={generate}>
            <label htmlFor="market-report-query">What market decision are you exploring?</label>
            <textarea
              id="market-report-query"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Example: Steel market in India — demand, competition, import requirements, risks and recommended entry strategy."
              disabled={busy}
              rows={4}
            />
            <footer>
              <small>Try a product, country, export opportunity or sourcing-risk question.</small>
              <button className="button button--primary" disabled={busy || !query.trim()} type="submit">
                {busy ? <LoaderCircle className="spin" /> : <Sparkles />}
                {busy ? 'Generating PDF' : 'Generate report'}
              </button>
            </footer>
            {busy && (
              <section className="market-report-progress" aria-live="polite">
                <span><LoaderCircle className="spin" /></span>
                <div><b>{progress.label}</b><i><em style={{ width: `${progress.value}%` }} /></i></div>
                <strong>{Math.round(progress.value)}%</strong>
                <button type="button" onClick={() => abortRef.current?.abort()}>Cancel</button>
              </section>
            )}
          </form>
        </section>

        {/* Messages */}
        {error && <p className="action-error" role="alert">{error}</p>}
        {notice && <p className="market-report-notice" role="status"><Check /> {notice}</p>}

        {/* Preview Drawer */}
        {selected && isValidObjectId(reportId(selected)) && (
          <div className="market-report-drawer-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null) }}>
            <aside className="market-report-preview" role="dialog" aria-modal="true" aria-label={`Preview of ${selected.title || 'market intelligence report'}`}>
              <header>
                <div>
                  <FileText />
                  <span>
                    <small>Secure document viewer</small>
                    <h2>{selected.title || 'Market intelligence report'}</h2>
                  </span>
                </div>
                <nav aria-label="Report actions">
                  <button type="button" onClick={() => share(selected, true)} title="Copy share link"><Copy /></button>
                  <button type="button" onClick={() => share(selected)} title="Share report"><Share2 /></button>
                  <button type="button" onClick={openInNewTab} disabled={!previewUrl} title="Open in new tab"><ExternalLink /></button>
                  <button type="button" onClick={printReport} disabled={!previewUrl} title="Print report"><Printer /></button>
                  <button type="button" className="button button--primary" onClick={() => download(selected)}><Download /> Download</button>
                  <button type="button" className="icon-button" onClick={() => setSelected(null)} aria-label="Close preview"><X /></button>
                </nav>
              </header>
              <div className="market-report-viewer">
                {previewLoading && (
                  <div className="market-report-viewer__loading">
                    <LoaderCircle className="spin" />
                    <b>Opening secure PDF preview</b>
                    <span>Preparing the report for your browser...</span>
                  </div>
                )}
                {previewUrl && (
                  <object data={previewUrl} type="application/pdf" aria-label={`Preview of ${selected.title || 'market intelligence report'}`}>
                    <div className="market-report-viewer__fallback">
                      <FileText />
                      <h3>Preview is unavailable in this browser</h3>
                      <p>Open the PDF in a new tab or download it to continue.</p>
                      <button className="button button--primary" type="button" onClick={openInNewTab}><ExternalLink /> Open PDF</button>
                    </div>
                  </object>
                )}
              </div>
            </aside>
          </div>
        )}

        {/* Reports Library */}
        <section className="market-report-library">
          <header>
            <div>
              <small>Persistent report library</small>
              <h2>Your market intelligence</h2>
            </div>
            <span>{pagination.total || reports.length} report{(pagination.total || reports.length) === 1 ? '' : 's'}</span>
          </header>

          {loading ? (
            <ReportSkeleton />
          ) : reports.length > 0 ? (
            <>
              <div className="market-report-grid">
                {reports.map(report => {
                  const id = reportId(report)
                  if (!id || !isValidObjectId(id)) return null
                  return (
                    <ReportCard
                      key={id}
                      report={report}
                      working={busyReportId === id}
                      onPreview={() => setSelected(report)}
                      onDownload={() => download(report)}
                      onShare={() => share(report)}
                      onRegenerate={() => regenerate(report)}
                      onDelete={() => remove(report)}
                    />
                  )
                })}
              </div>
              {pagination.hasMore && (
                <button
                  className="button button--secondary market-report-load-more"
                  disabled={loadingMore}
                  onClick={() => loadReports(pagination.page + 1, true)}
                >
                  {loadingMore ? <LoaderCircle className="spin" /> : <RefreshCw />}
                  {loadingMore ? 'Loading reports' : 'Load more reports'}
                </button>
              )}
            </>
          ) : (
            <div className="market-report-empty">
              <i><FileChartColumnIncreasing /></i>
              <h2>Your report library is ready</h2>
              <p>Generate your first market intelligence PDF. It will remain available here until you choose to delete it.</p>
              <div>
                <button type="button" onClick={() => setQuery('Steel Market in India')}>Steel Market in India</button>
                <button type="button" onClick={() => setQuery('Textile Export Opportunities in UAE')}>Textile Export Opportunities in UAE</button>
              </div>
            </div>
          )}
        </section>
      </main>
    </AppShell>
  )
}

// ==================== REPORT CARD ====================
function ReportCard({ report, working, onPreview, onDownload, onShare, onRegenerate, onDelete }) {
  return (
    <article className="market-report-card">
      <button className="market-report-card__preview" onClick={onPreview} disabled={working}>
        <i>{working ? <LoaderCircle className="spin" /> : <FileText />}</i>
        <span className={`market-report-status market-report-status--${report.pdfStatus || 'ready'}`}>
          {report.pdfStatus || 'ready'}
        </span>
      </button>
      <div className="market-report-card__content">
        <small>{typeLabel(report.reportType)} <b>•</b> {formatDate(report.generatedAt || report.createdAt)}</small>
        <h3>{report.title || report.query || 'Market intelligence report'}</h3>
        <p>{report.description || report.query || 'Professional AI-generated market intelligence report.'}</p>
        <em>{metadata(report)}</em>
      </div>
      <nav aria-label={`Actions for ${report.title || 'report'}`}>
        <button type="button" onClick={onPreview} disabled={working} title="Preview PDF"><Eye /><span>Preview</span></button>
        <button type="button" onClick={onDownload} disabled={working} title="Download PDF"><Download /><span>Download</span></button>
        <button type="button" onClick={onShare} disabled={working} title="Share report"><Share2 /><span>Share</span></button>
        <button type="button" onClick={onRegenerate} disabled={working} title="Regenerate report"><RefreshCw /><span>Regenerate</span></button>
        <button type="button" className="danger" onClick={onDelete} disabled={working} title="Delete report"><Trash2 /><span>Delete</span></button>
      </nav>
    </article>
  )
}

// ==================== HELPERS ====================
function ReportSkeleton() {
  return (
    <div className="market-report-grid" aria-label="Loading reports">
      {[0, 1, 2].map(item => (
        <article className="market-report-card market-report-card--skeleton" key={item}>
          <i /><div><b /><span /><span /></div><footer />
        </article>
      ))}
    </div>
  )
}

function dedupeReports(items) {
  const seen = new Set()
  return items.filter(item => {
    const id = String(item?.savedReportId || item?._id || item?.reportId || '')
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

function typeLabel(value) {
  return {
    product_rd: 'Product research',
    country_rd: 'Country research',
    opportunity_finder: 'Opportunity analysis',
  }[value] || 'Market research'
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Recently generated'
}

function metadata(report) {
  const parts = []
  if (report.pages) parts.push(`${report.pages} pages`)
  if (report.fileSize) parts.push(formatBytes(report.fileSize))
  if (report.generationTimeMs) parts.push(`Generated in ${Math.max(1, Math.round(report.generationTimeMs / 1000))}s`)
  return parts.join(' • ') || 'Professional PDF report'
}

function formatBytes(value) {
  const bytes = Number(value || 0)
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}
