import {
  ArrowDownLeft, ArrowUpRight, Building2, CreditCard, Landmark, Plus,
  RefreshCw, ShieldCheck, Smartphone, Star, Trash2, WalletCards, X,
} from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import {
  addPaymentMethod, fetchWallet, managePaymentMethod, removePaymentMethod, requestWithdrawal,
} from '../api/account'
import { fetchServiceRequests } from '../api/services'
import { useAuth } from '../auth/auth-context'
import AppShell from '../components/AppShell'
import { Money, StatusBadge } from '../components/TradeUI'
import { PageHead } from '../components/PageHead'
import useAsyncData from '../hooks/useAsyncData'
import { resolveId } from '../utils/trade'
import { TradeSkeleton } from './RfqsPage'
import UnifiedSearchInput from '../components/UnifiedSearchInput'
import { useConfirm, useToast } from '../components/EnterpriseUX'
import ProviderBrand from '../components/ProviderBrand'

export default function WalletPage() {
  const confirm = useConfirm()
  const toast = useToast()
  const { user } = useAuth()
  const roles = user?.roles || ['buyer']
  const [role, setRole] = useState(user?.primaryRole === 'seller' ? 'seller' : 'buyer')
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [dialog, setDialog] = useState('')
  const [error, setError] = useState('')
  const [methodBusy, setMethodBusy] = useState('')
  const query = useAsyncData(useCallback(() => fetchWallet(role), [role]))
  const serviceQuery = useAsyncData(useCallback(() => fetchServiceRequests({ role, limit: 100 }), [role]))
  const data = query.data || {}
  const summary = data.summary || {}
  const methods = data.paymentMethods || []
  const activity = useMemo(() => {
    const services = serviceQuery.data || []
    const serviceById = new Map(services.map(item => [resolveId(item), item]))
    const paymentEntityIds = new Set((data.payments || []).map(item => resolveId(item.entityId)).filter(Boolean))
    const servicePayments = services.filter(item => item.paymentStatus === 'paid' && !paymentEntityIds.has(resolveId(item))).map(item => ({
      _id: `service-${resolveId(item)}`,
      amount: item.pricing?.totalPayable,
      currency: item.pricing?.currency,
      createdAt: item.updatedAt || item.createdAt,
      description: item.serviceTitle,
      direction: 'debit',
      providerKey: item.provider?.key,
      reference: item.requestNumber,
      section: 'service_payment',
      status: 'completed',
    }))
    return [
      ...(data.transactions || []).map(item => ({ ...item, section: 'transaction' })),
      ...(data.withdrawals || []).map(item => ({ ...item, section: 'withdrawal', direction: 'debit' })),
      ...(data.payments || []).map(item => {
        const service = serviceById.get(resolveId(item.entityId))
        return { ...item, section: 'payment', direction: 'debit', providerKey: service?.provider?.key }
      }),
      ...servicePayments,
    ].filter(item => filter === 'all' || item.direction === filter)
    .filter(item => !search || [item.description, item.type, item.reference, item.status]
      .some(value => String(value || '').toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  }, [data.payments, data.transactions, data.withdrawals, filter, search, serviceQuery.data])

  async function manage(method, action) {
    const key = `${resolveId(method)}:${action}`
    setMethodBusy(key); setError('')
    try {
      if (action === 'remove') {
        if (!await confirm({ title: 'Remove payment account?', message: 'This saved account will no longer be available for future payments or withdrawals.', confirmLabel: 'Remove account' })) return
        await removePaymentMethod(resolveId(method), role)
        toast.success('Payment account removed.')
      } else {
        await managePaymentMethod(resolveId(method), { action, role })
      }
      await query.reload()
    } catch (next) {
      setError(next.message)
    } finally {
      setMethodBusy('')
    }
  }

  return <AppShell><div className="container module-page">
    <PageHead eyebrow="Payments and settlements" title="Wallet" description="Secure payout accounts, balances, credits, refunds and withdrawals in one ledger." />
    <div className="module-actions">
      {roles.includes('seller') && <div className="role-switch">
        <button className={role === 'buyer' ? 'active' : ''} onClick={() => setRole('buyer')}>Buyer</button>
        <button className={role === 'seller' ? 'active' : ''} onClick={() => setRole('seller')}>Seller</button>
      </div>}
      <button className="button button--secondary" onClick={() => setDialog('method')}><Plus /> Payment account</button>
      {role === 'seller' && <button className="button button--primary" onClick={() => setDialog('withdraw')}><ArrowUpRight /> Withdraw</button>}
    </div>
    {error && <p className="action-error">{error}</p>}
    {query.loading ? <TradeSkeleton /> : query.error ? <p className="inline-error">{query.error.message}</p> : <>
      <section className="wallet-hero">
        <div><span>Available balance</span><b><Money value={summary.balance || data.wallet?.balance || 0} currency={data.wallet?.currency} /></b><p>{role === 'seller' ? 'Seller earnings and available settlements' : 'Buyer credits, refunds and payments'}</p></div>
        <div><Metric label="Credits" value={summary.totalCredits} /><Metric label="Refunds" value={summary.refundedAmount} /><Metric label="Escrow" value={summary.escrowBalance} /><Metric label="Withdrawable" value={summary.withdrawableAmount} /></div>
      </section>
      <div className="wallet-metrics"><Metric label="Completed payments" value={summary.completedPayments} plain /><Metric label="Order payments" value={summary.orderPaymentTotal} money /><Metric label="Pending settlement" value={summary.pendingSettlement} money /><Metric label="Total debits" value={summary.totalDebits} money /></div>
      <section className="module-panel payment-methods-panel">
        <div className="compact-heading"><div><h2>Saved payment accounts</h2><p>Bank and UPI accounts are usable only after RazorpayX verification.</p></div><ShieldCheck /></div>
        {methods.length ? <div className="payment-method-grid">{methods.map(method => {
          const id = resolveId(method)
          const label = method.label || method.bankName || (method.type === 'upi' ? 'UPI account' : 'Bank account')
          return <article className="payment-method-card" key={id}>
            <i>{method.type === 'upi' ? <Smartphone /> : <Building2 />}</i>
            <div className="payment-method-copy">
              <div><b>{label}</b>{method.isDefault && <span className="default-chip"><Star /> Default</span>}</div>
              <p>{method.type === 'upi' ? method.upiId : `${method.maskedAccountNumber || 'Account'} · ${method.ifsc || ''}`}</p>
              <small>{method.verificationMessage || 'Awaiting verification'}</small>
            </div>
            <StatusBadge status={method.verificationStatus || 'pending'} />
            <div className="payment-method-actions">
              {method.verificationStatus !== 'verified' && <button className="button button--secondary" disabled={Boolean(methodBusy)} onClick={() => manage(method, 'verify')}><RefreshCw /> {methodBusy === `${id}:verify` ? 'Checking…' : 'Verify'}</button>}
              {method.verificationStatus === 'verified' && !method.isDefault && <button className="button button--secondary" disabled={Boolean(methodBusy)} onClick={() => manage(method, 'set_default')}><Star /> Make default</button>}
              <button className="icon-button icon-button--danger" aria-label={`Remove ${label}`} disabled={Boolean(methodBusy)} onClick={() => manage(method, 'remove')}><Trash2 /></button>
            </div>
          </article>
        })}</div> : <div className="empty-results"><Landmark /><h2>No payment accounts</h2><p>Add a bank account or UPI ID. It stays pending until the provider confirms ownership.</p></div>}
      </section>
      <section className="module-panel">
        <div className="compact-heading"><h2>Wallet activity</h2><div className="ledger-filters"><UnifiedSearchInput compact suggestions={false} value={search} onChange={setSearch} onSubmit={setSearch} placeholder="Search ledger" /><select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All activity</option><option value="credit">Credits</option><option value="debit">Debits</option></select></div></div>
        {activity.length ? <div className="wallet-ledger">{activity.map((item, index) => <article key={resolveId(item) || index}>
          <i className={item.direction === 'credit' ? 'credit' : 'debit'}>{item.providerKey ? <ProviderBrand providerKey={item.providerKey} compact /> : item.direction === 'credit' ? <ArrowDownLeft /> : <ArrowUpRight />}</i>
          <div><b>{item.description || String(item.type || item.section).replaceAll('_', ' ')}</b><p>{item.reference || item.transactionNumber || item.paymentId || item.withdrawalNumber || 'Wallet activity'}</p></div>
          <time>{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ''}</time><StatusBadge status={item.status || item.paymentStatus || 'completed'} />
          <strong className={item.direction === 'credit' ? 'credit' : 'debit'}>{item.direction === 'credit' ? '+' : '−'}<Money value={item.amount || item.totalAmount} currency={item.currency} /></strong>
        </article>)}</div> : <div className="empty-results"><WalletCards /><h2>No wallet activity</h2><p>Payments, credits and refunds will appear here.</p></div>}
      </section>
    </>}
  </div>
  {dialog && <WalletDialog type={dialog} methods={methods} summary={summary} role={role} error={error} setError={setError} onClose={() => { setDialog(''); setError('') }} onSuccess={async () => { setDialog(''); await query.reload() }} />}
  </AppShell>
}

function Metric({ label, value, money, plain }) {
  return <span><small>{label}</small><b>{money ? <Money value={value || 0} /> : plain ? Number(value || 0).toLocaleString() : <Money value={value || 0} />}</b></span>
}

function WalletDialog({ type, methods, summary, onClose, onSuccess, error, setError, role }) {
  const verified = methods.filter(item => item.verificationStatus === 'verified')
  const [form, setForm] = useState(type === 'method'
    ? { type: 'bank_account', role, label: '', accountHolder: '', accountNumber: '', ifsc: '', bankName: '', upiId: '', isDefault: false }
    : { amount: '', paymentMethodId: verified[0]?._id || '', currency: 'INR' })
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      if (type === 'method') await addPaymentMethod(form)
      else await requestWithdrawal({ ...form, amount: Number(form.amount) })
      onSuccess()
    } catch (next) {
      setError(next.message); setBusy(false)
    }
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="module-modal" onMouseDown={event => event.stopPropagation()} onSubmit={submit}>
    <div className="compact-heading"><div><h2>{type === 'method' ? 'Add payment account' : 'Withdraw funds'}</h2><p>{type === 'method' && 'Details are encrypted before storage and verified through RazorpayX.'}</p></div><button type="button" onClick={onClose}><X /></button></div>
    {type === 'method' ? <>
      <label>Method type<select value={form.type} onChange={event => setForm({ ...form, type: event.target.value })}><option value="bank_account">Bank account</option><option value="upi">UPI</option></select></label>
      <label>Account label<input value={form.label} onChange={event => setForm({ ...form, label: event.target.value })} placeholder="For example: Primary settlement" /></label>
      {form.type === 'bank_account' ? <div className="form-grid">
        <label>Account holder<input autoComplete="name" value={form.accountHolder} onChange={event => setForm({ ...form, accountHolder: event.target.value })} required /></label>
        <label>Account number<input inputMode="numeric" autoComplete="off" value={form.accountNumber} onChange={event => setForm({ ...form, accountNumber: event.target.value.replace(/\D/g, '') })} required /></label>
        <label>IFSC<input autoCapitalize="characters" value={form.ifsc} onChange={event => setForm({ ...form, ifsc: event.target.value.toUpperCase() })} required /></label>
        <label>Bank name<input value={form.bankName} onChange={event => setForm({ ...form, bankName: event.target.value })} /></label>
      </div> : <label>UPI ID<input autoCapitalize="none" autoCorrect="off" value={form.upiId} onChange={event => setForm({ ...form, upiId: event.target.value })} placeholder="name@bank" required /></label>}
      <label className="check-field"><input type="checkbox" checked={form.isDefault} onChange={event => setForm({ ...form, isDefault: event.target.checked })} /> Make default after successful verification</label>
    </> : <>
      <p>Available to withdraw: <b><Money value={summary.withdrawableAmount || 0} /></b></p>
      <label>Verified payment account<select value={form.paymentMethodId} onChange={event => setForm({ ...form, paymentMethodId: event.target.value })} required><option value="">Select account</option>{verified.map(item => <option value={resolveId(item)} key={resolveId(item)}>{item.label || item.bankName || item.upiId || item.maskedAccountNumber}</option>)}</select></label>
      {!verified.length && <p className="action-error">Verify a bank or UPI account before requesting a withdrawal.</p>}
      <label>Amount<input type="number" min="100" value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })} required /></label>
    </>}
    {error && <p className="action-error">{error}</p>}
    <button className="button button--primary button--full" disabled={busy || (type === 'withdraw' && !verified.length)}>{busy ? 'Saving…' : type === 'method' ? <><Landmark /> Save and verify</> : <><CreditCard /> Request withdrawal</>}</button>
  </form></div>
}
