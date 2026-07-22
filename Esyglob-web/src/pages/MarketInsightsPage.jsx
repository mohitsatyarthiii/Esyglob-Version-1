import { ArrowLeft, ArrowRight, BarChart3, Clock3, Globe2, Lightbulb, PackageSearch, Search, Sparkles, Target, TrendingUp } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { fetchMarketInsights, fetchMarketReports, generateMarketInsight } from '../api/account'
import AppShell from '../components/AppShell'
import { PageHead } from '../components/PageHead'
import useAsyncData from '../hooks/useAsyncData'
import { TradeSkeleton } from './RfqsPage'

const researchTypes = [
  { mode: 'product_rd', icon: PackageSearch, title: 'Product research', text: 'Evaluate demand, competition, pricing and supply signals for a product.' },
  { mode: 'country_rd', icon: Globe2, title: 'Country analysis', text: 'Understand regional demand, market readiness and trade opportunities.' },
  { mode: 'opportunity_finder', icon: Target, title: 'Opportunity finder', text: 'Discover promising product and market combinations from live signals.' },
]
const emptyList = []

export default function MarketInsightsPage() {
  const query = useAsyncData(useCallback(async () => {
    const [dashboard, reports] = await Promise.all([fetchMarketInsights(), fetchMarketReports()])
    return { dashboard, reports }
  }, []))
  const [form, setForm] = useState({ mode: 'product_rd', productName: '', country: '', category: '' })
  const [selectedReport, setSelectedReport] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dashboard = query.data?.dashboard || {}
  const products = dashboard.products || emptyList
  const countries = dashboard.countries || emptyList
  const reports = query.data?.reports || emptyList
  const trends = useMemo(() => products.slice(0, 8).map((item, index) => ({ ...item, value: Number(item.totalOrders || item.viewCount || products.length - index) * 10 })), [products])

  async function generate(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const response = await generateMarketInsight(form)
      setSelectedReport(response?.report || response)
      query.reload()
    } catch (next) { setError(next.message) }
    finally { setBusy(false) }
  }

  function chooseResearch(mode) {
    setForm((current) => ({ ...current, mode }))
    document.getElementById('insight-builder')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return <AppShell><div className="container module-page insight-page">
    {selectedReport ? <ReportWorkspace report={selectedReport} onBack={() => setSelectedReport(null)} /> : <>
      <PageHead eyebrow="Trade intelligence" title="Market insights" description="Explore marketplace demand, supply signals and evidence-backed global trade opportunities." />
      {query.loading ? <TradeSkeleton /> : query.error ? <div className="insight-state"><BarChart3 /><h2>Insights are temporarily unavailable</h2><p>{query.error.message}</p><button onClick={query.reload}><RefreshLabel /> Try again</button></div> : <>
        <section className="insight-landing-hero"><div><span className="insight-live"><i /> Live marketplace intelligence</span><h2>Turn marketplace signals into confident decisions.</h2><p>Research products, compare regions and identify trade opportunities using current EsyGlob activity.</p><a href="#insight-builder">Start new research <ArrowRight /></a></div><div className="insight-hero-visual"><span><TrendingUp /></span><article><small>Market signal</small><b>{products[0]?.name || 'Emerging demand'}</b><em>Based on current marketplace activity</em></article><div className="insight-mini-bars">{[42, 66, 54, 82, 72, 94].map((value, index) => <i key={index} style={{ height: `${value}%` }} />)}</div></div></section>

        <section className="insight-type-grid">{researchTypes.map(({ mode, icon: Icon, title, text }) => <button key={mode} className={form.mode === mode ? 'active' : ''} onClick={() => chooseResearch(mode)}><i><Icon /></i><span><b>{title}</b><small>{text}</small></span><ArrowRight /></button>)}</section>

        <section className="insight-builder" id="insight-builder"><div className="insight-builder-copy"><span><Sparkles /></span><div><small>AI research studio</small><h2>Build a focused market report</h2><p>Choose a research type and add the market context that matters to your decision.</p></div></div><form onSubmit={generate}><label>Research type<select value={form.mode} onChange={(event) => setForm({ ...form, mode: event.target.value })}>{researchTypes.map((item) => <option value={item.mode} key={item.mode}>{item.title}</option>)}</select></label><label>Product or category<input list="insight-products" value={form.productName} onChange={(event) => setForm({ ...form, productName: event.target.value })} placeholder="e.g. Cotton bags" required /><datalist id="insight-products">{products.map((item) => <option key={item.id || item.name} value={item.name} />)}</datalist></label><label>Target market <span>Optional</span><input list="insight-countries" value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })} placeholder="e.g. United Kingdom" /><datalist id="insight-countries">{countries.map((item) => <option key={item.name} value={item.name} />)}</datalist></label><button disabled={busy}><Search /> {busy ? 'Analyzing market...' : 'Generate insight report'}</button></form></section>
        {error && <p className="action-error">{error}</p>}

        <div className="insight-section-heading"><div><span className="eyebrow">Market pulse</span><h2>Live marketplace overview</h2></div><small>{dashboard.dataFreshness || 'Current marketplace data'}</small></div>
        <div className="insight-kpi-strip"><Metric label="Tracked products" value={products.length} icon={PackageSearch} /><Metric label="Active markets" value={countries.length} icon={Globe2} /><Metric label="Saved reports" value={reports.length} icon={BarChart3} /><Metric label="Signal status" value="Live" icon={TrendingUp} /></div>

        <div className="insight-dashboard"><section className="module-panel insight-trends"><div className="compact-heading"><h2><TrendingUp /> Trending products</h2><span>Demand signals</span></div><div className="trend-bars">{trends.length ? trends.map((item, index) => <div key={item.id || item.name}><span>{index + 1}</span><b>{item.name}</b><i><em style={{ width: `${Math.max(15, Math.min(100, item.value))}%` }} /></i><small>{item.category || 'Marketplace'}</small></div>) : <EmptyPanel icon={TrendingUp} title="No trend data yet" text="Trends will appear as marketplace activity grows." />}</div></section><section className="module-panel"><div className="compact-heading"><h2><Globe2 /> Regional signals</h2><span>{countries.length} markets</span></div>{countries.length ? <div className="region-grid">{countries.slice(0, 9).map((item) => <article key={item.name}><span>{item.flagEmoji || '🌐'}</span><div><b>{item.name}</b><small>{item.region || item.currency || 'Global market'}</small></div></article>)}</div> : <EmptyPanel icon={Globe2} title="No regional data yet" text="Regional signals will appear here." />}</section></div>

        <section className="insight-history-section"><div className="insight-section-heading"><div><span className="eyebrow">Research library</span><h2>Saved reports</h2></div><small>Select a report to open it</small></div>{reports.length ? <div className="report-history">{reports.map((item, index) => <button key={item.savedReportId || item._id || index} onClick={() => setSelectedReport(item)}><span className="report-history-icon"><BarChart3 /></span><span><small>{labelForMode(item.reportType || item.mode)}</small><b>{item.title || item.product || 'Market research'}</b><em>{previewText(item)}</em></span><footer><time><Clock3 /> {item.generatedAt || item.createdAt ? new Date(item.generatedAt || item.createdAt).toLocaleDateString([], { dateStyle: 'medium' }) : 'Saved report'}</time><ArrowRight /></footer></button>)}</div> : <div className="insight-empty-library"><Lightbulb /><h3>Your research library is ready</h3><p>Generate your first report to save market findings and revisit them here.</p><a href="#insight-builder">Create a report</a></div>}</section>
      </>}
    </>}
  </div></AppShell>
}

function ReportWorkspace({ report, onBack }) {
  const sections = report.sections || []
  const rows = report.opportunityTable || report.importAnalysis || report.exportAnalysis || []
  const summary = report.summary || report.executiveSummary || report.aiAnalysis || 'Your generated market intelligence report.'
  return <div className="insight-report-workspace"><button className="insight-back" onClick={onBack}><ArrowLeft /> Back to market insights</button><header><div><span className="eyebrow">Generated intelligence</span><h1>{report.title || `${report.product || 'Product'} market report`}</h1><p>{summary}</p></div><span className="insight-report-badge"><Sparkles /> AI-assisted analysis</span></header>{report.kpis?.length > 0 && <div className="report-kpis">{report.kpis.map((item) => <Metric key={item.label} label={item.label} value={item.value} icon={TrendingUp} />)}</div>}<div className="report-sections">{sections.length ? sections.map((item, index) => <article key={item.title || index}><span>{String(index + 1).padStart(2, '0')}</span><div><h3>{item.title}</h3><p>{item.content || item.summary}</p>{(item.bullets || item.points)?.length > 0 && <ul>{(item.bullets || item.points).map((value) => <li key={value}>{value}</li>)}</ul>}</div></article>) : <article><span>01</span><div><h3>Executive overview</h3><p>{summary}</p></div></article>}</div>{rows.length > 0 && <div className="insight-table"><div><h2><BarChart3 /> Opportunity data</h2><small>{rows.length} analyzed records</small></div><table><thead><tr>{Object.keys(rows[0]).slice(0, 5).map((key) => <th key={key}>{key.replaceAll('_', ' ')}</th>)}</tr></thead><tbody>{rows.slice(0, 10).map((row, index) => <tr key={index}>{Object.keys(rows[0]).slice(0, 5).map((key) => <td key={key}>{typeof row[key] === 'object' ? row[key]?.label || row[key]?.change || '—' : String(row[key] ?? '—')}</td>)}</tr>)}</tbody></table></div>}</div>
}

function Metric({ label, value, icon: Icon }) { return <span>{Icon && <i><Icon /></i>}<span><b>{value}</b><small>{label}</small></span></span> }
function EmptyPanel({ icon: Icon, title, text }) { return <div className="insight-panel-empty"><Icon /><b>{title}</b><p>{text}</p></div> }
function RefreshLabel() { return <><Sparkles /></> }
function labelForMode(value) { return String(value || 'Market analysis').replaceAll('_', ' ') }
function previewText(item) { return String(item.summary || item.executiveSummary || item.aiAnalysis || 'Open this report to review its findings and recommendations.').slice(0, 125) }
