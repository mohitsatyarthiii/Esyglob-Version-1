import { ArrowLeft, Save, Send } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { createProductEnquiry, fetchCategories } from '../api/marketplace'
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
  const [categories, setCategories] = useState([])
  const [publishedRfq, setPublishedRfq] = useState(null)
  const requestKey = useRef('')
  const [form, setForm] = useState({
    productName: product.name || '',
    quantity: String(product.requestedQuantity || product.moq || product.minimumOrderQuantity || 1),
    unit: product.requestedUnit || product.unit || 'pcs',
    targetPrice: product.price || '',
    currency: product.currency || 'INR',
    deliveryCountry: 'India',
    deliveryTimeline: 'flexible',
    notes: '',
    category: '',
    subcategory: '',
  })
  const privateRfq = Boolean(prefill.sellerId || prefill.sellerUserId)
  useEffect(() => {
    if (privateRfq) return
    fetchCategories().then(setCategories).catch(() => setError('Unable to load marketplace categories. Please try again.'))
  }, [privateRfq])
  const update = useCallback((key, value) => setForm((current) => ({ ...current, [key]: value })), [])

  async function submit(status) {
    requestKey.current ||= globalThis.crypto?.randomUUID?.() || `rfq-${Date.now()}-${Math.random()}`
    setError('')
    const quantity = Number(form.quantity)
    if (!form.productName.trim() || !Number.isFinite(quantity) || quantity <= 0 || !form.unit.trim() || !form.deliveryCountry.trim() || !form.deliveryTimeline || (!privateRfq && status !== 'draft' && (!form.category || !form.subcategory))) {
      return setError('Product, valid quantity, unit, delivery location and timeline are required.')
    }
    if ([form.productName, form.notes].some((value) => contactPattern.test(value))) {
      return setError('Phone numbers, email addresses and external links are not allowed in RFQs.')
    }
    if (status !== 'draft') {
      const prompt = privateRfq
        ? `Send this private RFQ to ${prefill.supplierName || 'the selected manufacturer'}?`
        : 'Publish this RFQ to the public marketplace?'
      if (!window.confirm(prompt)) return
    }

    setBusy(status)
    try {
      const productId = product._id || product.id
      const common = {
        idempotencyKey: requestKey.current,
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

      const isPrivate = privateRfq
      const payload = {
        ...common,
        category: isPrivate ? (typeof product.category === 'object' ? product.category?.name : product.category || 'General') : form.category,
        subcategory: isPrivate ? (typeof product.subcategory === 'object' ? product.subcategory?.name : product.subcategory || '') : form.subcategory,
        visibility: isPrivate ? 'private' : 'public',
        sellerId: prefill.sellerId || undefined,
        sellerUserId: prefill.sellerUserId || undefined,
        status,
        rfqType: productId ? 'product' : 'custom',
      }
      const result = isPrivate ? await createSellerRfq(payload) : await createRfq(payload)
      if (result.chat) return navigate(`/messages/${result.chat._id || result.chat.id}`)
      const rfq = result.rfq || result
      if (!isPrivate && status !== 'draft') setPublishedRfq(rfq)
      else navigate(`/rfqs/${rfq._id || rfq.id}`)
    } catch (nextError) {
      setError(privateRfq ? nextError.message : 'Unable to publish RFQ. Please try again.')
      setBusy('')
    }
  }

  const selectedCategory = categories.find((item) => item.name === form.category)
  if (publishedRfq) return <AppShell><div className="trade-form-page container trade-form-page--compact"><section className="trade-form-section"><span className="eyebrow">Published</span><h1>RFQ published successfully.</h1><p>Your request is live in the Public RFQ Marketplace. Matching manufacturers are being notified without affecting its public availability.</p><div className="trade-page-actions"><Link className="button button--primary" to={`/rfqs/${publishedRfq._id || publishedRfq.id}`}>View Public RFQ</Link><Link className="button button--secondary" to="/rfqs">Go to My RFQs</Link></div></section></div></AppShell>
  return <AppShell><div className="trade-form-page container trade-form-page--compact">
    <button className="back-link" onClick={() => navigate(-1)}><ArrowLeft /> Back</button>
    <header><span className="eyebrow">{privateRfq ? 'Private RFQ' : 'Buyer sourcing request'}</span><h1>{privateRfq ? `Send private RFQ${prefill.supplierName ? ` to ${prefill.supplierName}` : ''}` : 'Create RFQ'}</h1><p>Share the essential requirement. Suppliers can clarify details in the negotiation workspace.</p></header>
    <div className="trade-form-layout">
      <div>
        <FormSection title="Product requirement">
          <Field label="Product" required><input value={form.productName} onChange={(event) => update('productName', event.target.value)} placeholder="What do you need?" /></Field>
          {!privateRfq && <div className="form-grid"><Field label="Category" required><select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value, subcategory: '' }))}><option value="">Select marketplace category</option>{categories.map((item) => <option value={item.name} key={item._id || item.slug}>{item.name}</option>)}</select></Field><Field label="Subcategory" required><select value={form.subcategory} disabled={!selectedCategory} onChange={(event) => update('subcategory', event.target.value)}><option value="">Select subcategory</option>{(selectedCategory?.subcategories || []).map((item) => <option value={item.name} key={item._id || item.slug}>{item.name}</option>)}</select></Field></div>}
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
        <div className="sticky-form-actions"><button className="button button--secondary" disabled={Boolean(busy)} onClick={() => submit('draft')}><Save /> {busy === 'draft' ? 'Saving…' : 'Save draft'}</button><button className="button button--primary" disabled={Boolean(busy)} onClick={() => submit('active')}><Send /> {busy === 'active' ? 'Submitting…' : privateRfq ? 'Send private RFQ' : 'Publish RFQ'}</button></div>
      </aside>
    </div>
  </div></AppShell>
}

export function FormSection({ title, children }) { return <section className="trade-form-section"><h2>{title}</h2>{children}</section> }
export function Field({ label, required, children }) { return <label className="trade-field"><span>{label}{required && <em>*</em>}</span>{children}</label> }
