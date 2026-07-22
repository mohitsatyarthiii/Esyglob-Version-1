import { Download, FileSignature, Search, ShieldCheck } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { fetchQuotations } from '../api/trade'
import { useAuth } from '../auth/auth-context'
import AppShell from '../components/AppShell'
import { StatusBadge } from '../components/TradeUI'
import useAsyncData from '../hooks/useAsyncData'
import { displayName, resolveId } from '../utils/trade'
import { TradeSkeleton } from './RfqsPage'

const filters = ['all', 'pending', 'seller_signed', 'fully_signed', 'cancelled']
const agreementStatuses = new Set(['buyer_accepted', 'agreement_pending', 'agreement_signed', 'won'])

export default function AgreementsPage() {
  const { user } = useAuth()
  const roles = user?.roles || [user?.primaryRole || 'buyer']
  const canSell = roles.includes('seller')
  const [params] = useSearchParams()
  const [role, setRole] = useState(canSell && (params.get('role') === 'seller' || user?.primaryRole === 'seller') ? 'seller' : 'buyer')
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const query = useAsyncData(useCallback(async () => (await fetchQuotations({ scope: role, limit: 100 })).quotations, [role]))
  const agreements = useMemo(() => (query.data || []).filter(hasAgreement).filter(item => filter === 'all' || group(item) === filter).filter(item => !search || JSON.stringify(item).toLowerCase().includes(search.toLowerCase())), [filter, query.data, search])

  return <AppShell><main className="container agreements-page"><header className="agreements-hero"><div><span className="eyebrow"><ShieldCheck /> Contract center</span><h1>Agreements</h1><p>Review pending signatures, download executed contracts and open the connected trade workspace.</p></div>{canSell && <div className="role-switch"><button className={role === 'buyer' ? 'active' : ''} onClick={() => setRole('buyer')}>Buyer</button><button className={role === 'seller' ? 'active' : ''} onClick={() => setRole('seller')}>Seller</button></div>}</header><div className="agreements-toolbar"><label><Search /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search agreement, product or participant" /></label><nav>{filters.map(value => <button className={filter === value ? 'active' : ''} onClick={() => setFilter(value)} key={value}>{label(value)}</button>)}</nav></div>{query.loading ? <TradeSkeleton /> : query.error ? <div className="inline-error">{query.error.message}</div> : agreements.length ? <div className="agreement-manager-grid">{agreements.map(item => <AgreementCard item={item} role={role} key={resolveId(item)} />)}</div> : <div className="empty-results"><FileSignature /><h2>No agreements in this view</h2><p>Accepted quotations automatically appear here as live Agreements.</p></div>}</main></AppShell>
}

function AgreementCard({ item, role }) {
  const document = (item.tradeDocuments || []).find(value => ['purchase_agreement','commercial_agreement'].includes(value.documentType) && value.status !== 'void')
  const preview = document?.previewUrl
  const rfq = typeof item.rfqId === 'object' ? item.rfqId : {}
  const product = typeof item.productId === 'object' ? item.productId : {}
  return <article className="agreement-manager-card"><header><i><FileSignature /></i><span><small>{item.agreement?.agreementNumber || 'Agreement pending'}</small><h2>{product.name || rfq.title || item.title || 'Commercial Agreement'}</h2></span><StatusBadge status={document?.status || item.agreement?.status || item.status} /></header><dl><div><dt>Buyer</dt><dd>{displayName(rfq.buyerId, 'Marketplace Buyer')}</dd></div><div><dt>Seller</dt><dd>{displayName(item.sellerId || item.userId, 'Marketplace Seller')}</dd></div><div><dt>Created</dt><dd>{new Date(document?.createdAt || item.acceptedAt || item.createdAt).toLocaleDateString()}</dd></div><div><dt>Updated</dt><dd>{new Date(item.updatedAt).toLocaleDateString()}</dd></div></dl><footer>{preview && <a href={`${preview}?format=pdf`} target="_blank" rel="noreferrer"><Download /> Download PDF</a>}<Link to={`/quotations/${resolveId(item)}?role=${role}#agreement-workflow-title`}>Open Agreement</Link><Link to={`/trade-workspace/quotation/${resolveId(item)}`}>Trade Workspace</Link></footer></article>
}

function group(item) { const status = item.agreement?.status; if (status === 'completed' || ['agreement_signed','won'].includes(item.status)) return 'fully_signed'; if (status === 'awaiting_buyer_signature') return 'seller_signed'; if (['rejected','expired','withdrawn'].includes(item.status) || status === 'void') return 'cancelled'; return 'pending' }
function hasAgreement(item) { return agreementStatuses.has(item.status) || Boolean(item.agreement?.agreementNumber) || (item.tradeDocuments || []).some(value => ['purchase_agreement','commercial_agreement'].includes(value.documentType)) }
function label(value) { return String(value).replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase()) }
