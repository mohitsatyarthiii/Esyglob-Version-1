import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bookmark,
  CheckCircle2,
  Clock3,
  Database,
  Download,
  ExternalLink,
  FileText,
  Globe2,
  Lightbulb,
  LoaderCircle,
  PackageSearch,
  Search,
  Share2,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  deleteMarketReport,
  fetchMarketReport,
  fetchMarketInsights,
  fetchMarketReports,
  marketReportPdfUrl,
  shareMarketReport,
  streamMarketResearch,
} from '../api/account'
import AppShell from '../components/AppShell'
import { PageHead } from '../components/PageHead'
import useAsyncData from '../hooks/useAsyncData'
import { TradeSkeleton } from './RfqsPage'

const researchTypes = [
  { mode: 'product_rd', icon: PackageSearch, title: 'Product intelligence', text: 'Demand, supply, pricing, trade, competition and product opportunity.' },
  { mode: 'country_rd', icon: Globe2, title: 'Country intelligence', text: 'Market readiness, regional trade context, regulation and market entry.' },
  { mode: 'opportunity_finder', icon: Target, title: 'Opportunity finder', text: 'Evidence-backed product and market combinations worth validating.' },
]
const suggestedQueries = [
  { productName: 'Steel pipes', country: 'United Arab Emirates' },
  { productName: 'Cotton shopping bags', country: 'United Kingdom' },
  { productName: 'Solar panels', country: 'India' },
  { productName: 'Food packaging machinery', country: 'Vietnam' },
]
const emptyList = []

export default function MarketInsightsPage() {
  const query = useAsyncData(useCallback(async () => {
    const [dashboard, reports] = await Promise.all([fetchMarketInsights(), fetchMarketReports()])
    return { dashboard, reports }
  }, []))
  const abortRef = useRef(null)
  const [form, setForm] = useState({ mode: 'product_rd', productName: '', country: '', category: '' })
  const [selectedReport, setSelectedReport] = useState(null)
  const [libraryView, setLibraryView] = useState('recent')
  const [busy, setBusy] = useState(false)
  const [openingId, setOpeningId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [progress, setProgress] = useState({ value: 0, label: '', steps: [] })
  useEffect(() => () => abortRef.current?.abort(), [])

  const dashboard = query.data?.dashboard || {}
  const products = dashboard.products || emptyList
  const countries = dashboard.countries || emptyList
  const allReports = query.data?.reports || emptyList
  const reports = libraryView === 'saved' ? allReports.filter((item) => item.isBookmarked || item.isFavorite) : allReports
  const trends = useMemo(() => products.slice(0, 7).map((item, index) => ({ ...item, value: Number(item.totalOrders || item.viewCount || products.length - index) * 10 })), [products])

  async function generate(event) {
    event.preventDefault()
    if (busy || !form.productName.trim()) return
    setBusy(true)
    setError('')
    setNotice('')
    setProgress({ value: 2, label: 'Preparing research plan', steps: [] })
    const controller = new AbortController()
    abortRef.current = controller
    let completed = null
    let streamError = ''
    try {
      await streamMarketResearch({ ...form, query: [form.productName, form.category, form.country].filter(Boolean).join(' ') }, (eventData) => {
        if (eventData.type === 'step') {
          setProgress((current) => ({
            value: Math.max(current.value, Math.min(99, Number(eventData.progress || 0))),
            label: eventData.operation || eventData.agent || 'Preparing report',
            steps: [...current.steps.filter((item) => item.agent !== eventData.agent), {
              agent: eventData.agent,
              operation: eventData.operation,
              status: eventData.status,
            }].slice(-7),
          }))
        }
        if (eventData.type === 'research_started') {
          setProgress((current) => ({ ...current, value: Math.max(current.value, Number(eventData.progress || 3)), label: eventData.cached ? 'Opening a current matching report' : 'Research agents started' }))
        }
        if (eventData.type === 'report') completed = eventData.report
        if (eventData.type === 'error') streamError = eventData.message || 'Report generation failed'
      }, controller.signal)
      if (streamError) throw new Error(streamError)
      if (!completed) throw new Error('The report stream ended before the report was ready. Please retry.')
      setProgress((current) => ({ ...current, value: 100, label: 'Report and PDF ready' }))
      setSelectedReport(completed)
      setNotice('Your report and PDF were generated and saved automatically.')
      query.reload()
    } catch (next) {
      if (next.name !== 'AbortError') setError(next.message)
    } finally {
      abortRef.current = null
      setBusy(false)
    }
  }

  async function openReport(item) {
    const id = item.savedReportId || item._id
    if (!id) return setSelectedReport(item)
    setOpeningId(id)
    setError('')
    try {
      setSelectedReport(await fetchMarketReport(id))
    } catch (next) {
      setError(next.message)
    } finally {
      setOpeningId('')
    }
  }

  async function removeReport(item) {
    const id = item.savedReportId || item._id
    if (!id || !window.confirm(`Delete "${item.title || 'this report'}" from your research library?`)) return
    try {
      await deleteMarketReport(id)
      if ((selectedReport?.savedReportId || selectedReport?._id) === id) setSelectedReport(null)
      setNotice('Report removed from your library.')
      query.reload()
    } catch (next) {
      setError(next.message)
    }
  }

  async function shareReport(item) {
    const id = item.savedReportId || item._id
    if (!id) return
    try {
      const result = await shareMarketReport(id)
      if (!result.shareUrl) throw new Error('A share link was not returned.')
      if (navigator.share) await navigator.share({ title: item.title || 'EsyGlob Market Intelligence Report', text: 'Market intelligence report prepared with EsyGlob.', url: result.shareUrl })
      else {
        await navigator.clipboard.writeText(result.shareUrl)
        setNotice('Secure PDF share link copied.')
      }
    } catch (next) {
      if (next.name !== 'AbortError') setError(next.message)
    }
  }

  function chooseSuggestion(item) {
    setForm((current) => ({ ...current, ...item }))
    document.getElementById('insight-builder')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  if (selectedReport) {
    return <AppShell><div className="container module-page insight-page">
      <ReportWorkspace report={selectedReport} notice={notice} onBack={() => { setSelectedReport(null); setNotice('') }} onShare={() => shareReport(selectedReport)} onDelete={() => removeReport(selectedReport)} />
      {error && <p className="action-error">{error}</p>}
    </div></AppShell>
  }

  return <AppShell><div className="container module-page insight-page insight-enterprise">
    <PageHead eyebrow="AI market intelligence" title="Research markets with evidence, not guesswork" description="Generate comprehensive market intelligence with official trade context, marketplace signals, structured analysis and an automatically saved professional PDF." />
    {query.loading ? <TradeSkeleton /> : query.error ? <InsightState error={query.error.message} retry={query.reload} /> : <>
      <section className="insight-command-hero">
        <div>
          <span className="insight-live"><i /> Evidence-first AI research</span>
          <h2>From a market question to an analyst-grade report.</h2>
          <p>Research demand, supply, pricing, import-export context, competition, risks and opportunities. Every completed analysis includes a branded, downloadable PDF.</p>
          <div className="insight-trust-row"><span><ShieldCheck /> Source-aware analysis</span><span><FileText /> Automatic PDF</span><span><Bookmark /> Saved to your library</span></div>
        </div>
        <div className="insight-command-visual">
          <span><BarChart3 /></span>
          <div><small>Research system</small><b>{allReports.length} saved reports</b><em>{dashboard.dataFreshness || 'Connected marketplace signals'}</em></div>
          <div className="insight-mini-bars">{[40, 63, 52, 77, 68, 92].map((value, index) => <i key={index} style={{ height: `${value}%` }} />)}</div>
        </div>
      </section>

      <section className="insight-type-grid">{researchTypes.map(({ mode, icon: Icon, title, text }) => <button type="button" key={mode} className={form.mode === mode ? 'active' : ''} onClick={() => setForm((current) => ({ ...current, mode }))}><i><Icon /></i><span><b>{title}</b><small>{text}</small></span><ArrowRight /></button>)}</section>

      <section className="insight-builder insight-builder--enterprise" id="insight-builder">
        <div className="insight-builder-copy"><span><Sparkles /></span><div><small>AI research studio</small><h2>Generate a complete market report</h2><p>Describe the product or category and optionally focus the analysis on a destination market.</p></div></div>
        <form onSubmit={generate}>
          <label>Research type<select value={form.mode} onChange={(event) => setForm({ ...form, mode: event.target.value })}>{researchTypes.map((item) => <option value={item.mode} key={item.mode}>{item.title}</option>)}</select></label>
          <label>Product or category<input list="insight-products" value={form.productName} onChange={(event) => setForm({ ...form, productName: event.target.value })} placeholder="e.g. Stainless steel pipes" required disabled={busy} /><datalist id="insight-products">{products.map((item) => <option key={item.id || item.name} value={item.name} />)}</datalist></label>
          <label>Target market <span>Optional</span><input list="insight-countries" value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })} placeholder="e.g. United Arab Emirates" disabled={busy} /><datalist id="insight-countries">{countries.map((item) => <option key={item.name} value={item.name} />)}</datalist></label>
          <button disabled={busy || !form.productName.trim()}>{busy ? <LoaderCircle className="spin" /> : <Search />} {busy ? 'Preparing professional report' : 'Generate report & PDF'}</button>
        </form>
        <div className="insight-suggested"><span>Suggested research</span>{suggestedQueries.map((item) => <button type="button" key={`${item.productName}-${item.country}`} disabled={busy} onClick={() => chooseSuggestion(item)}>{item.productName} in {item.country}</button>)}</div>
      </section>

      {busy && <ResearchProgress progress={progress} onCancel={() => abortRef.current?.abort()} />}
      {error && <p className="action-error">{error}</p>}
      {notice && <p className="action-success">{notice}</p>}

      <div className="insight-kpi-strip"><Metric label="Tracked products" value={products.length} icon={PackageSearch} /><Metric label="Connected markets" value={countries.length} icon={Globe2} /><Metric label="Saved reports" value={allReports.length} icon={FileText} /><Metric label="Research status" value="Ready" icon={CheckCircle2} /></div>

      <div className="insight-dashboard">
        <section className="module-panel insight-trends"><div className="compact-heading"><h2><TrendingUp /> Marketplace demand signals</h2><span>Current context</span></div><div className="trend-bars">{trends.length ? trends.map((item, index) => <div key={item.id || item.name}><span>{index + 1}</span><b>{item.name}</b><i><em style={{ width: `${Math.max(15, Math.min(100, item.value))}%` }} /></i><small>{item.category || 'Marketplace'}</small></div>) : <EmptyPanel icon={TrendingUp} title="No trend data yet" text="Signals will appear as marketplace activity grows." />}</div></section>
        <section className="module-panel"><div className="compact-heading"><h2><Database /> Research coverage</h2><span>{countries.length} markets</span></div><div className="insight-coverage-list"><p><CheckCircle2 /><span><b>Official macro indicators</b><small>Country-level trade and economic context</small></span></p><p><CheckCircle2 /><span><b>EsyGlob marketplace</b><small>Products, suppliers, RFQs and quotations</small></span></p><p><CheckCircle2 /><span><b>Evidence controls</b><small>Missing product-level data is disclosed</small></span></p><p><CheckCircle2 /><span><b>Professional PDF</b><small>Automatically designed and retained</small></span></p></div></section>
      </div>

      <section className="insight-history-section">
        <div className="insight-section-heading"><div><span className="eyebrow">Research library</span><h2>Reports</h2></div><div className="insight-library-tabs"><button className={libraryView === 'recent' ? 'active' : ''} onClick={() => setLibraryView('recent')}>Recent</button><button className={libraryView === 'saved' ? 'active' : ''} onClick={() => setLibraryView('saved')}>Saved</button></div></div>
        {reports.length ? <div className="report-history report-history--enterprise">{reports.map((item, index) => {
          const id = item.savedReportId || item._id || index
          return <article key={id}>
            <button className="report-history__open" onClick={() => openReport(item)} disabled={openingId === id}>
              <span className="report-history-icon">{openingId === id ? <LoaderCircle className="spin" /> : <BarChart3 />}</span>
              <span><small>{labelForMode(item.reportType || item.mode)}</small><b>{item.title || item.productName || 'Market intelligence'}</b><em>{previewText(item)}</em></span>
              <footer><time><Clock3 /> {formatDate(item.generatedAt || item.createdAt)}</time><span className={`report-status ${item.pdfStatus === 'ready' ? 'ready' : ''}`}>{item.pdfStatus === 'ready' ? 'PDF ready' : item.pdfStatus || 'Saved'}</span></footer>
            </button>
            <div className="report-history__actions"><a href={marketReportPdfUrl(id, true)} title="Download PDF"><Download /></a><button onClick={() => shareReport(item)} title="Share report"><Share2 /></button><button className="danger" onClick={() => removeReport(item)} title="Delete report"><Trash2 /></button></div>
          </article>
        })}</div> : <div className="insight-empty-library"><Lightbulb /><h3>{libraryView === 'saved' ? 'No bookmarked reports' : 'Your research library is ready'}</h3><p>{libraryView === 'saved' ? 'Bookmarked reports will appear in this view.' : 'Generate your first report to save findings and its PDF automatically.'}</p><a href="#insight-builder">Create a report</a></div>}
      </section>
    </>}
  </div></AppShell>
}

function ResearchProgress({ progress, onCancel }) {
  return <section className="insight-progress" aria-live="polite">
    <header><span><LoaderCircle className="spin" /></span><div><small>AI MARKET RESEARCH IN PROGRESS</small><h3>{progress.label || 'Preparing your report'}</h3></div><b>{Math.round(progress.value)}%</b></header>
    <i><em style={{ width: `${progress.value}%` }} /></i>
    <div>{progress.steps.map((step) => <p key={step.agent}><CheckCircle2 /><span><b>{step.agent}</b><small>{step.operation}</small></span></p>)}</div>
    <footer><span>The UI remains available while research agents prepare the report and PDF.</span><button onClick={onCancel}>Cancel</button></footer>
  </section>
}

function ReportWorkspace({ report, notice, onBack, onShare, onDelete }) {
  const id = report.savedReportId || report._id
  const sections = report.sections || []
  const charts = report.charts || []
  const tables = report.tables || []
  const sources = report.sources || []
  const summary = report.executiveSummary || report.summary || report.aiAnalysis || 'Your generated market intelligence report.'
  return <div className="insight-report-workspace insight-report-workspace--enterprise">
    <nav className="insight-report-toolbar"><button className="insight-back" onClick={onBack}><ArrowLeft /> Research library</button><div><a className="button button--primary" href={marketReportPdfUrl(id, true)}><Download /> Download PDF</a><button className="button button--secondary" onClick={onShare}><Share2 /> Share</button><button className="insight-delete-report" onClick={onDelete} aria-label="Delete report"><Trash2 /></button></div></nav>
    {notice && <p className="action-success">{notice}</p>}
    <header className="insight-report-cover">
      <div><span className="eyebrow">EsyGlob Market Intelligence</span><h1>{report.title || `${report.productName || 'Product'} market report`}</h1><p>{summary}</p><div className="insight-report-meta"><span><b>Report ID</b>{report.reportId || report.id || id}</span><span><b>Generated</b>{formatDate(report.generatedAt || report.createdAt)}</span><span><b>Version</b>{report.reportVersion || '2.0'}</span><span><b>Status</b>PDF ready</span></div></div><span className="insight-report-badge"><Sparkles /> AI-assisted • Evidence controlled</span>
    </header>
    {report.kpis?.length > 0 && <div className="report-kpis">{report.kpis.map((item) => <Metric key={item.label} label={item.label} value={item.value} icon={TrendingUp} />)}</div>}
    {sections.length >= 5 && <aside className="insight-contents"><h2>Report contents</h2><div>{sections.map((section, index) => <a href={`#report-section-${index}`} key={section.title}><span>{String(index + 1).padStart(2, '0')}</span>{section.title}</a>)}</div></aside>}
    <div className="report-sections">{sections.length ? sections.map((item, index) => <article id={`report-section-${index}`} key={item.title || index}><span>{String(index + 1).padStart(2, '0')}</span><div><header><h3>{item.title}</h3>{item.confidence && <em>{item.confidence}% confidence</em>}</header><p>{item.content || item.summary}</p>{(item.bullets || item.points)?.length > 0 && <ul>{(item.bullets || item.points).map((value) => <li key={value}>{value}</li>)}</ul>}<small>{item.evidenceType ? `Evidence: ${labelForMode(item.evidenceType)}` : ''}</small></div></article>) : <article><span>01</span><div><h3>Executive overview</h3><p>{summary}</p></div></article>}</div>
    {charts.length > 0 && <section className="insight-report-block"><div className="compact-heading"><h2><TrendingUp /> Visual analysis</h2><span>{charts.length} charts</span></div><div className="insight-chart-grid">{charts.map((chart, index) => <ReportChart chart={chart} key={chart.title || index} />)}</div></section>}
    {tables.map((table, index) => <ReportTable table={table} key={table.title || index} />)}
    {report.marketplaceSection && <section className="insight-report-block"><div className="compact-heading"><h2><PackageSearch /> {report.marketplaceSection.title}</h2><span>Live marketplace context</span></div><p>{report.marketplaceSection.summary}</p>{(report.marketplaceSection.tables || []).map((table, index) => <ReportTable table={table} key={table.title || index} nested />)}</section>}
    {(report.recommendations?.length > 0 || report.risks?.length > 0) && <div className="insight-decision-grid"><section><h2><Target /> AI recommendations</h2><ol>{report.recommendations?.map((item) => <li key={item}>{item}</li>)}</ol></section><section><h2><ShieldCheck /> Risk controls</h2><ol>{report.risks?.map((item) => <li key={item.reason || item.label}>{item.reason || item.label || item}</li>)}</ol></section></div>}
    {sources.length > 0 && <section className="insight-sources"><div className="compact-heading"><h2><Database /> Sources & methodology</h2><span>{sources.length} references</span></div><div>{sources.map((source, index) => <a href={source.url || '#'} target={source.url ? '_blank' : undefined} rel="noreferrer" key={`${source.name}-${index}`}><span>{index + 1}</span><div><b>{source.name || source.title || 'Research source'}</b><small>{[source.type, source.status].filter(Boolean).join(' • ')}</small></div>{source.url && <ExternalLink />}</a>)}</div></section>}
  </div>
}

function ReportChart({ chart }) {
  const rows = (chart.data || []).filter((item) => Number.isFinite(Number(item.value))).slice(0, 7)
  const max = Math.max(...rows.map((item) => Math.abs(Number(item.value))), 1)
  return <article><h3>{chart.title}</h3><div>{rows.map((item) => <p key={item.label}><span>{item.label}</span><i><em style={{ width: `${Math.max(2, Math.abs(Number(item.value)) / max * 100)}%` }} /></i><b>{formatValue(item.value)}</b></p>)}</div></article>
}

function ReportTable({ table, nested = false }) {
  const columns = (table.columns || Object.keys(table.rows?.[0] || {})).slice(0, 6)
  const rows = (table.rows || []).slice(0, 12)
  if (!columns.length || !rows.length) return null
  return <section className={`insight-table ${nested ? 'nested' : ''}`}><div><h2><BarChart3 /> {table.title}</h2><small>{rows.length} records</small></div><div className="insight-table-scroll"><table><thead><tr>{columns.map((key) => <th key={key}>{labelForMode(key)}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{columns.map((key) => <td key={key}>{renderCell(row[key])}</td>)}</tr>)}</tbody></table></div></section>
}

function InsightState({ error, retry }) { return <div className="insight-state"><BarChart3 /><h2>Insights are temporarily unavailable</h2><p>{error}</p><button onClick={retry}><Sparkles /> Try again</button></div> }
function Metric({ label, value, icon: Icon }) { return <span>{Icon && <i><Icon /></i>}<span><b>{value ?? '—'}</b><small>{label}</small></span></span> }
function EmptyPanel({ icon: Icon, title, text }) { return <div className="insight-panel-empty"><Icon /><b>{title}</b><p>{text}</p></div> }
function labelForMode(value) { return String(value || 'Market analysis').replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase()) }
function previewText(item) { return String(item.executiveSummary || item.summary || item.aiAnalysis || 'Open this report to review its findings, charts and recommendations.').slice(0, 145) }
function formatDate(value) { return value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Saved report' }
function formatValue(value) { const number = Number(value); if (!Number.isFinite(number)) return String(value ?? '—'); if (Math.abs(number) >= 1e12) return `${(number / 1e12).toFixed(1)}T`; if (Math.abs(number) >= 1e9) return `${(number / 1e9).toFixed(1)}B`; if (Math.abs(number) >= 1e6) return `${(number / 1e6).toFixed(1)}M`; return number.toLocaleString() }
function renderCell(value) { if (value && typeof value === 'object') return value.label || value.change || value.value || '—'; return String(value ?? '—') }
