import { Download, FileSignature, History, Search, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { fetchQuotations } from '../api/trade'
import { resolveApiResourceUrl } from '../api/client'
import { useAuth } from '../auth/auth-context'
import AppShell from '../components/AppShell'
import { StatusBadge } from '../components/TradeUI'
import useAsyncData from '../hooks/useAsyncData'
import { getRealtimeClient } from '../realtime/socket'
import { displayName, resolveId } from '../utils/trade'
import { TradeSkeleton } from './RfqsPage'

const filters = ['all', 'pending', 'signed', 'cancelled', 'expired']
const finalStatuses = new Set(['buyer_accepted', 'final_quotation_pending', 'final_quotation_signed', 'won'])

export default function AgreementsPage() {
  const { user } = useAuth()
  const roles = user?.roles || [user?.primaryRole || 'buyer']
  const canSell = roles.includes('seller')
  const [params] = useSearchParams()
  const [role, setRole] = useState(canSell && (params.get('role') === 'seller' || user?.primaryRole === 'seller') ? 'seller' : 'buyer')
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const query = useAsyncData(useCallback(async () => (await fetchQuotations({ scope: role, limit: 100 })).quotations, [role]))
  const reloadAgreements = query.reload
  useEffect(() => { let socket; const refresh = () => reloadAgreements(); getRealtimeClient().then(client => { socket = client; client.on('quotation_updated', refresh) }).catch(() => {}); return () => socket?.off('quotation_updated', refresh) }, [reloadAgreements])
  const records = useMemo(() => (query.data || []).filter(hasFinalQuotation).filter(item => filter === 'all' || group(item) === filter).filter(item => !search || JSON.stringify(item).toLowerCase().includes(search.toLowerCase())), [filter, query.data, search])
  return <AppShell><main className="container agreements-page"><header className="agreements-hero"><div><span className="eyebrow"><ShieldCheck /> Signed trade records</span><h1>Agreements</h1><p>Final Quotations are the official commercial record. Review signatures, PDFs, history and the connected Trade Workspace.</p></div>{canSell && <div className="role-switch"><button className={role === 'buyer' ? 'active' : ''} onClick={() => setRole('buyer')}>Buyer</button><button className={role === 'seller' ? 'active' : ''} onClick={() => setRole('seller')}>Seller</button></div>}</header><div className="agreements-toolbar"><label><Search /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search Final Quotation, product or participant" /></label><nav>{filters.map(value => <button className={filter === value ? 'active' : ''} onClick={() => setFilter(value)} key={value}>{label(value)}</button>)}</nav></div>{query.loading ? <TradeSkeleton /> : query.error ? <div className="inline-error">{query.error.message}</div> : records.length ? <div className="agreement-manager-grid">{records.map(item => <FinalQuotationCard item={item} role={role} key={resolveId(item)} />)}</div> : <div className="empty-results"><FileSignature /><h2>No Final Quotations in this view</h2><p>Accepted trades appear here when Seller preparation begins.</p></div>}</main></AppShell>
}

function FinalQuotationCard({ item, role }) {
  const document = [...(item.tradeDocuments || [])].reverse().find(value => value.documentType === 'quotation' && value.metadata?.isFinalQuotation && value.status !== 'void')
  const rfq = typeof item.rfqId === 'object' ? item.rfqId : {}
  const product = typeof item.productId === 'object' ? item.productId : {}
  const status = item.status === 'final_quotation_signed' || item.status === 'won' ? 'signed' : item.status === 'final_quotation_pending' ? 'pending_signature' : item.finalQuotation?.status || item.status
  return <article className="agreement-manager-card"><header><i><FileSignature /></i><span><small>{item.finalQuotation?.finalQuotationNumber || 'Final Quotation pending'}</small><h2>{product.name || rfq.title || item.title || 'Final Quotation'}</h2></span><StatusBadge status={status} /></header><dl><div><dt>Buyer</dt><dd>{displayName(rfq.buyerId, 'Marketplace Buyer')}</dd></div><div><dt>Seller</dt><dd>{displayName(item.sellerId || item.userId, 'Marketplace Seller')}</dd></div><div><dt>Version</dt><dd>V{document?.version || item.finalQuotation?.version || 1}</dd></div><div><dt>Updated</dt><dd>{new Date(item.updatedAt).toLocaleDateString()}</dd></div></dl><footer>{document?.previewUrl && <a href={`${resolveApiResourceUrl(document.previewUrl)}?format=pdf`} target="_blank" rel="noreferrer"><Download /> PDF</a>}<Link to={`/quotations/${resolveId(item)}?role=${role}#final-quotation-title`}>Final Quotation</Link><Link to={`/trade-workspace/quotation/${resolveId(item)}?section=activity`}><History /> Timeline</Link><Link to={`/trade-workspace/quotation/${resolveId(item)}`}>Trade Workspace</Link></footer></article>
}

function group(item) { if (item.status === 'expired' || item.finalQuotation?.status === 'expired') return 'expired'; if (['rejected','withdrawn'].includes(item.status) || item.finalQuotation?.status === 'cancelled') return 'cancelled'; if (['final_quotation_signed','won'].includes(item.status) || item.finalQuotation?.status === 'signed') return 'signed'; return 'pending' }
function hasFinalQuotation(item) { return finalStatuses.has(item.status) || Boolean(item.finalQuotation?.finalQuotationNumber) || (item.tradeDocuments || []).some(value => value.documentType === 'quotation' && value.metadata?.isFinalQuotation) }
function label(value) { return String(value).replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase()) }
