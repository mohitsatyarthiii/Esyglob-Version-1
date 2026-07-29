import { ArrowLeft, Save, Send } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { createProductEnquiry } from '../api/marketplace'
import { createRfq, createSellerRfq } from '../api/trade'
import AppShell from '../components/AppShell'
import { AttachmentUploader } from '../components/TradeUI'
import { CURRENCY_OPTIONS } from '../preferences/currency-context'

const contactPattern = /(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?\d[\d\s().-]{7,}\d))/i

export default function RfqCreatePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const prefill = location.state || {}
  const product = prefill.product || {}
  const [attachments, setAttachments] = useState([])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    productName: product.name || '',
    quantity: String(product.requestedQuantity || product.moq || product.minimumOrderQuantity || 1),
    unit: product.requestedUnit || product.unit || 'pcs',
    targetPrice: product.price || '',
    currency: product.currency || 'INR',
    deliveryCountry: 'India',
    deliveryTimeline: 'flexible',
    notes: '',
  })
  const update = useCallback((key, value) => setForm((current) => ({ ...current, [key]: value })), [])

  async function submit(status) {
    setError('')
    const quantity = Number(form.quantity)
    if (!form.productName.trim() || !Number.isFinite(quantity) || quantity <= 0 || !form.unit.trim() || !form.deliveryCountry.trim() || !form.deliveryTimeline) {
      return setError('Product, valid quantity, unit, delivery location and timeline are required.')
    }
    if ([form.productName, form.notes].some((value) => contactPattern.test(value))) {
      return setError('Phone numbers, email addresses and external links are not allowed in RFQs.')
    }

    setBusy(status)
    try {
      const productId = product._id || product.id
      const common = {
        productId: productId || undefined,
        productName: form.productName.trim(),
        title: form.productName.trim(),
        quantity,
        unit: form.unit.trim(),
        targetPrice: Number(form.targetPrice) || undefined,
        currency: form.currency,
        deliveryCountry: form.deliveryCountry.trim(),
        destinationCountry: form.deliveryCountry.trim(),
        deliveryTimeline: form.deliveryTimeline,
        notes: form.notes.trim() || undefined,
        description: form.notes.trim() || `Quotation requested for ${form.productName.trim()}.`,
        attachments,
        items: [{
          name: form.productName.trim(),
          quantity,
          unit: form.unit.trim(),
          targetPrice: Number(form.targetPrice) || undefined,
        }],
      }

      if (productId && prefill.sellerUserId && status !== 'draft') {
        const result = await createProductEnquiry({
          ...common,
          sellerUserId: prefill.sellerUserId,
          destinationCountry: common.deliveryCountry,
          additionalNotes: common.notes,
        })
        const rfq = result.rfq || result
        return result.chat
          ? navigate(`/messages/${result.chat._id || result.chat.id}`)
          : navigate(`/rfqs/${rfq._id || rfq.id}`)
      }

      const isPrivate = Boolean(prefill.sellerId || prefill.sellerUserId)
      const payload = {
        ...common,
        category: typeof product.category === 'object' ? product.category?.name : product.category || 'General',
        visibility: isPrivate ? 'private' : 'public',
        sellerId: prefill.sellerId || undefined,
        sellerUserId: prefill.sellerUserId || undefined,
        status,
        rfqType: productId ? 'product' : 'custom',
      }
      const result = isPrivate ? await createSellerRfq(payload) : await createRfq(payload)
      if (result.chat) return navigate(`/messages/${result.chat._id || result.chat.id}`)
      const rfq = result.rfq || result
      navigate(`/rfqs/${rfq._id || rfq.id}`)
    } catch (nextError) {
      setError(nextError.message)
      setBusy('')
    }
  }

  const privateRfq = Boolean(prefill.sellerId || prefill.sellerUserId)
  return <AppShell><div className="trade-form-page container trade-form-page--compact">
    <button className="back-link" onClick={() => navigate(-1)}><ArrowLeft /> Back</button>
    <header><span className="eyebrow">{privateRfq ? 'Private supplier enquiry' : 'Buyer sourcing request'}</span><h1>{privateRfq ? `Send enquiry${prefill.supplierName ? ` to ${prefill.supplierName}` : ''}` : 'Create RFQ'}</h1><p>Share the essential requirement. Suppliers can clarify details in the negotiation workspace.</p></header>
    <div className="trade-form-layout">
      <div>
        <FormSection title="Product requirement">
          <Field label="Product" required><input value={form.productName} onChange={(event) => update('productName', event.target.value)} placeholder="What do you need?" /></Field>
          <div className="form-grid form-grid--3">
            <Field label="Quantity" required><input type="number" min="0.01" step="any" value={form.quantity} onChange={(event) => update('quantity', event.target.value)} /></Field>
            <Field label="Unit" required><input value={form.unit} onChange={(event) => update('unit', event.target.value)} placeholder="pcs, kg, cartons" /></Field>
            <Field label="Target price (optional)"><div className="compound-input"><select value={form.currency} onChange={(event) => update('currency', event.target.value)}>{CURRENCY_OPTIONS.map((item) => <option value={item.code} key={item.code}>{item.code}</option>)}</select><input type="number" min="0" step="0.01" value={form.targetPrice} onChange={(event) => update('targetPrice', event.target.value)} /></div></Field>
          </div>
          <div className="form-grid">
            <Field label="Delivery location" required><input value={form.deliveryCountry} onChange={(event) => update('deliveryCountry', event.target.value)} placeholder="City, state, country" /></Field>
            <Field label="Timeline" required><select value={form.deliveryTimeline} onChange={(event) => update('deliveryTimeline', event.target.value)}><option value="flexible">Flexible</option><option value="urgent">Urgent</option><option value="30_days">Within 30 days</option><option value="60_days">Within 60 days</option><option value="90_days">Within 90 days</option></select></Field>
          </div>
          <Field label="Notes"><textarea rows="4" value={form.notes} onChange={(event) => update('notes', event.target.value)} placeholder="Specifications, quality expectations or packaging notes" /></Field>
        </FormSection>
        <FormSection title="Attachment (optional)"><AttachmentUploader folder="rfqs" value={attachments} onChange={setAttachments} /></FormSection>
      </div>
      <aside>
        <FormSection title="Ready to send?"><p className="form-help">Product, quantity, unit, delivery location and timeline are required. Target price, notes and attachments are optional.</p></FormSection>
        {error && <p className="action-error">{error}</p>}
        <div className="sticky-form-actions"><button className="button button--secondary" disabled={Boolean(busy)} onClick={() => submit('draft')}><Save /> {busy === 'draft' ? 'Saving…' : 'Save draft'}</button><button className="button button--primary" disabled={Boolean(busy)} onClick={() => submit('active')}><Send /> {busy === 'active' ? 'Submitting…' : privateRfq ? 'Send enquiry' : 'Publish RFQ'}</button></div>
      </aside>
    </div>
  </div></AppShell>
}

export function FormSection({ title, children }) { return <section className="trade-form-section"><h2>{title}</h2>{children}</section> }
export function Field({ label, required, children }) { return <label className="trade-field"><span>{label}{required && <em>*</em>}</span>{children}</label> }
