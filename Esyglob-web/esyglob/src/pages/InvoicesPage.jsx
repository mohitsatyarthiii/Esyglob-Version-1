import { Download, FileText, ReceiptText } from 'lucide-react'
import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { buildApiUrl } from '../api/client'
import { fetchInvoices } from '../api/account'
import AppShell from '../components/AppShell'
import { Money, StatusBadge } from '../components/TradeUI'
import { PageHead } from '../components/PageHead'
import useAsyncData from '../hooks/useAsyncData'
import { resolveId } from '../utils/trade'
import { TradeSkeleton } from './RfqsPage'
import ProviderBrand from '../components/ProviderBrand'

export default function InvoicesPage() {
  const query = useAsyncData(useCallback(() => fetchInvoices(), []))
  const invoices = query.data || []
  return <AppShell><div className="container module-page">
    <PageHead eyebrow="Commercial records" title="Invoices" description="Issued invoices, payment status and downloadable PDF records for your trades and services." />
    {query.loading ? <TradeSkeleton /> : query.error ? <p className="inline-error">{query.error.message}</p> : invoices.length
      ? <div className="document-record-grid">{invoices.map(invoice => <article className="module-panel document-record-card" key={resolveId(invoice)}>
        <i>{invoice.serviceSnapshot?.provider?.key ? <ProviderBrand providerKey={invoice.serviceSnapshot.provider.key} compact /> : <ReceiptText />}</i><div><span>{invoice.invoiceNumber}</span><h2>{invoice.orderId?.orderNumber || invoice.serviceSnapshot?.serviceTitle || 'EsyGlob invoice'}</h2><p>{invoice.serviceSnapshot?.provider?.name || (invoice.issuedAt ? new Date(invoice.issuedAt).toLocaleDateString() : new Date(invoice.createdAt).toLocaleDateString())}</p></div>
        <StatusBadge status={invoice.paymentStatus || invoice.status} />
        <strong><Money value={invoice.totalAmount} currency={invoice.currency} /></strong>
        <div className="document-record-actions">{invoice.orderId?._id && <Link className="button button--secondary" to={`/orders/${invoice.orderId._id}`}><FileText /> Order</Link>}<a className="button button--primary" href={invoice.documentUrl || buildApiUrl(`/invoices/${resolveId(invoice)}.pdf`)} target="_blank" rel="noreferrer"><Download /> PDF</a></div>
      </article>)}</div>
      : <div className="module-panel empty-results"><ReceiptText /><h2>No invoices yet</h2><p>Invoices are generated after a verified payment and remain available here.</p></div>}
  </div></AppShell>
}
