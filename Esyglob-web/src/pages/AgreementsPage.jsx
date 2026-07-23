import { Download, FileSignature, Search, ShieldCheck } from 'lucide-react'
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

const filters = ['signed', 'waiting', 'all']
const finalStatuses = new Set(['buyer_accepted', 'final_quotation_pending', 'final_quotation_signed', 'won'])

export default function AgreementsPage() {
  const { user } = useAuth()
  const roles = user?.roles || [user?.primaryRole || 'buyer']
  const canSell = roles.includes('seller')
  const [params] = useSearchParams()
  const [role, setRole] = useState(canSell && (params.get('role') === 'seller' || user?.primaryRole === 'seller') ? 'seller' : 'buyer')
  const selectedQuotation = params.get('quotation')
  const [filter, setFilter] = useState(selectedQuotation ? 'all' : 'signed')
  const [search, setSearch] = useState('')
  const query = useAsyncData(useCallback(async () => (await fetchQuotations({ scope: role, limit: 100 })).quotations, [role]))
  const reloadAgreements = query.reload
  useEffect(() => { let socket; const refresh = () => reloadAgreements(); getRealtimeClient().then(client => { socket = client; client.on('quotation_updated', refresh) }).catch(() => {}); return () => socket?.off('quotation_updated', refresh) }, [reloadAgreements])
  const records = useMemo(() => (query.data || []).filter(hasFinalQuotation).filter(item => !selectedQuotation || resolveId(item) === selectedQuotation).filter(item => filter === 'all' || group(item) === filter).filter(item => !search || JSON.stringify(item).toLowerCase().includes(search.toLowerCase())), [filter, query.data, search, selectedQuotation])
  return <AppShell><main className="container agreements-page"><header className="agreements-hero"><div><span className="eyebrow"><ShieldCheck /> Official signed records</span><h1>Signed Final Quotations</h1><p>Your executed Final Quotations are stored here as the permanent commercial agreement between Buyer and Seller.</p></div>{canSell && <div className="role-switch"><button className={role === 'buyer' ? 'active' : ''} onClick={() => setRole('buyer')}>Buyer</button><button className={role === 'seller' ? 'active' : ''} onClick={() => setRole('seller')}>Seller</button></div>}</header><div className="agreements-toolbar"><label><Search /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search number, product, buyer or seller" /></label><nav>{filters.map(value => <button className={filter === value ? 'active' : ''} onClick={() => setFilter(value)} key={value}>{label(value)}</button>)}</nav></div>{query.loading ? <TradeSkeleton /> : query.error ? <div className="inline-error">{query.error.message}</div> : records.length ? <div className="agreement-manager-grid">{records.map(item => <FinalQuotationCard item={item} role={role} key={resolveId(item)} />)}</div> : <div className="empty-results"><FileSignature /><h2>No Final Quotations in this view</h2><p>Fully signed records appear here automatically after both parties complete e-signing.</p></div>}</main></AppShell>
}

function FinalQuotationCard({ item, role }) {
  const document = [...(item.tradeDocuments || [])].reverse().find(value => value.documentType === 'quotation' && value.metadata?.isFinalQuotation && value.status !== 'void')
  const rfq = typeof item.rfqId === 'object' ? item.rfqId : {}
  const product = typeof item.productId === 'object' ? item.productId : {}
  const status = item.status === 'final_quotation_signed' || item.status === 'won' ? 'signed' : item.status === 'final_quotation_pending' ? 'pending_signature' : item.finalQuotation?.status || item.status
  const signedDate = document?.completedAt || item.finalQuotation?.buyerSignedAt || item.finalQuotation?.sellerSignedAt
  return <article className="agreement-manager-card"><header><i><FileSignature /></i><span><small>{item.finalQuotation?.finalQuotationNumber || 'Final Quotation pending'}</small><h2>{product.name || rfq.title || item.title || 'Final Quotation'}</h2></span><StatusBadge status={status} /></header><dl><div><dt>Buyer</dt><dd>{displayName(rfq.buyerId, 'Marketplace Buyer')}</dd></div><div><dt>Seller</dt><dd>{displayName(item.sellerId || item.userId, 'Marketplace Seller')}</dd></div><div><dt>Status</dt><dd>{label(status)}</dd></div><div><dt>{status === 'signed' ? 'Signed date' : 'Updated'}</dt><dd>{new Date(signedDate || item.updatedAt).toLocaleDateString()}</dd></div></dl><footer>{document?.previewUrl && <a href={`${resolveApiResourceUrl(document.previewUrl)}?format=pdf`} target="_blank" rel="noreferrer"><Download /> Download PDF</a>}<Link to={`/quotations/${resolveId(item)}?role=${role}#final-quotation-title`}>Open Quotation</Link></footer></article>
}

function group(item) { return ['final_quotation_signed','won'].includes(item.status) || item.finalQuotation?.status === 'signed' ? 'signed' : 'waiting' }
function hasFinalQuotation(item) { return finalStatuses.has(item.status) || Boolean(item.finalQuotation?.finalQuotationNumber) || (item.tradeDocuments || []).some(value => value.documentType === 'quotation' && value.metadata?.isFinalQuotation) }
function label(value) { return String(value).replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase()) }
