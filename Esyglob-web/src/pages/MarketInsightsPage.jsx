import {
  Clock3,
  Download,
  Eye,
  FileText,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  deleteMarketReport,
  fetchMarketReports,
  marketReportPdfUrl,
  regenerateMarketReport,
  streamMarketResearch,
} from '../api/account'
import AppShell from '../components/AppShell'
import { PageHead } from '../components/PageHead'
import useAsyncData from '../hooks/useAsyncData'
import { TradeSkeleton } from './RfqsPage'

export default function MarketInsightsPage() {
  const reportsQuery = useAsyncData(useCallback(() => fetchMarketReports(), []))
  const abortRef = useRef(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState(false)
  const [busyReportId, setBusyReportId] = useState('')
  const [progress, setProgress] = useState({ value: 0, label: '' })
  const [error, setError] = useState('')

  useEffect(() => () => abortRef.current?.abort(), [])

  async function generate(event) {
    event.preventDefault()
    const researchQuery = query.trim()
    if (!researchQuery || busy) return
    setBusy(true)
    setError('')
    setProgress({ value: 2, label: 'Preparing research plan' })
    const controller = new AbortController()
    abortRef.current = controller
    let completed
    let streamError = ''
    try {
      await streamMarketResearch({ query: researchQuery, mode: 'product_rd' }, (eventData) => {
        if (eventData.type === 'research_started' || eventData.type === 'step' || eventData.type === 'section_ready') {
          setProgress(current => ({
            value: Math.max(current.value, Math.min(99, Number(eventData.progress || 0))),
            label: eventData.operation || eventData.agent || 'Building professional PDF',
          }))
        }
        if (eventData.type === 'report') completed = eventData.report
        if (eventData.type === 'error') streamError = eventData.message || 'Report generation failed'
      }, controller.signal)
      if (streamError) throw new Error(streamError)
      if (!completed?.savedReportId) throw new Error('The report stream ended before the PDF was ready.')
      setProgress({ value: 100, label: 'PDF ready' })
      setSelected(completed)
      setQuery('')
      reportsQuery.reload()
    } catch (next) {
      if (next.name !== 'AbortError') setError(next.message)
    } finally {
      abortRef.current = null
      setBusy(false)
    }
  }

  async function remove(report) {
    const id = reportId(report)
    if (!id || !window.confirm(`Delete "${report.title || 'this report'}"?`)) return
    setBusyReportId(id)
    setError('')
    try {
      await deleteMarketReport(id)
      if (reportId(selected) === id) setSelected(null)
      reportsQuery.reload()
    } catch (next) {
      setError(next.message)
    } finally {
      setBusyReportId('')
    }
  }

  async function regenerate(report) {
    const id = reportId(report)
    if (!id) return
    setBusyReportId(id)
    setError('')
    try {
      const regenerated = await regenerateMarketReport(id)
      setSelected(regenerated)
      reportsQuery.reload()
    } catch (next) {
      setError(next.message)
    } finally {
      setBusyReportId('')
    }
  }

  const reports = reportsQuery.data || []

  return <AppShell><main className="container market-report-page">
    <PageHead
      eyebrow="AI market intelligence"
      title="Generate a professional market report"
      description="Describe the market decision you need to make. EsyGlob combines marketplace, knowledge and trade evidence into one downloadable PDF."
    />

    <form className="market-report-request" onSubmit={generate}>
      <label htmlFor="market-report-query">Market research query</label>
      <div>
        <textarea
          id="market-report-query"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Example: Analyze the UAE market opportunity for stainless steel pipes, including demand, competition, import requirements, risks and recommended entry strategy."
          disabled={busy}
          rows={4}
        />
        <button className="button button--primary" disabled={busy || !query.trim()}>
          {busy ? <LoaderCircle className="spin" /> : <Sparkles />}
          {busy ? 'Generating PDF' : 'Generate report'}
        </button>
      </div>
      {busy && <section className="market-report-progress" aria-live="polite">
        <span><LoaderCircle className="spin" /></span>
        <div><b>{progress.label}</b><i><em style={{ width: `${progress.value}%` }} /></i></div>
        <strong>{Math.round(progress.value)}%</strong>
        <button type="button" onClick={() => abortRef.current?.abort()}>Cancel</button>
      </section>}
    </form>

    {error && <p className="action-error">{error}</p>}

    {selected && <section className="market-report-preview">
      <header>
        <div><FileText /><span><small>PDF preview</small><h2>{selected.title || 'Market intelligence report'}</h2></span></div>
        <nav>
          <a className="button button--primary" href={marketReportPdfUrl(reportId(selected), true)}>
            <Download /> Download
          </a>
          <button type="button" className="icon-button" onClick={() => setSelected(null)} aria-label="Close preview"><X /></button>
        </nav>
      </header>
      <iframe
        src={marketReportPdfUrl(reportId(selected))}
        title={`Preview of ${selected.title || 'market intelligence report'}`}
      />
    </section>}

    <section className="market-report-library">
      <header><div><small>Report history</small><h2>Generated reports</h2></div><span>{reports.length} report{reports.length === 1 ? '' : 's'}</span></header>
      {reportsQuery.loading ? <TradeSkeleton /> : reportsQuery.error ? <div className="empty-results"><FileText /><h2>Reports are unavailable</h2><p>{reportsQuery.error.message}</p><button className="button button--secondary" onClick={reportsQuery.reload}>Try again</button></div> : reports.length ? <div>
        {reports.map(report => {
          const id = reportId(report)
          const working = busyReportId === id
          return <article className="market-report-card" key={id}>
            <button className="market-report-card__preview" onClick={() => setSelected(report)} disabled={working}>
              <i>{working ? <LoaderCircle className="spin" /> : <FileText />}</i>
              <span>
                <b>{report.title || report.query || 'Market intelligence report'}</b>
                <small><Clock3 /> {formatDate(report.generatedAt || report.createdAt)}</small>
                <em>{metadata(report)}</em>
              </span>
            </button>
            <nav>
              <button type="button" onClick={() => setSelected(report)} title="Preview PDF"><Eye /></button>
              <a href={marketReportPdfUrl(id, true)} title="Download PDF"><Download /></a>
              <button type="button" onClick={() => regenerate(report)} disabled={working} title="Regenerate report"><RefreshCw /></button>
              <button type="button" className="danger" onClick={() => remove(report)} disabled={working} title="Delete report"><Trash2 /></button>
            </nav>
          </article>
        })}
      </div> : <div className="empty-results"><FileText /><h2>No reports yet</h2><p>Enter a market question above to generate your first professional PDF report.</p></div>}
    </section>
  </main></AppShell>
}

function reportId(report) {
  return report?.savedReportId || report?._id || ''
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Recently generated'
}

function metadata(report) {
  const parts = []
  if (report.pages) parts.push(`${report.pages} pages`)
  if (report.fileSize) parts.push(formatBytes(report.fileSize))
  if (report.generationTimeMs) parts.push(`Generated in ${Math.max(1, Math.round(report.generationTimeMs / 1000))}s`)
  return parts.join(' · ') || 'Professional PDF report'
}

function formatBytes(value) {
  const bytes = Number(value || 0)
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}
