import { ArrowLeft, Plus, Save, Send, Trash2 } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { createProductEnquiry, fetchCategories } from '../api/marketplace'
import { createRfq, createSellerRfq } from '../api/trade'
import AppShell from '../components/AppShell'
import { AttachmentUploader } from '../components/TradeUI'
import useAsyncData from '../hooks/useAsyncData'

const emptyItem = { name: '', category: '', subcategory: '', quantity: '1', unit: 'pcs', targetPrice: '', specifications: '' }
const contactPattern = /(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?\d[\d\s().-]{7,}\d))/i

export default function RfqCreatePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const prefill = location.state || {}
  const product = prefill.product || {}
  const categories = useAsyncData(fetchCategories)
  const [attachments, setAttachments] = useState([])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    title: product.name || '',
    description: product.description || '',
    category: typeof product.category === 'object' ? product.category?.name : product.category || '',
    subcategory: typeof product.subcategory === 'object' ? product.subcategory?.name : product.subcategory || '',
    specifications: '',
    minimumOrderQuantity: '',
    targetPrice: product.price || '',
    currency: product.currency || 'INR',
    deliveryCountry: 'India',
    deliveryPort: '',
    deliveryTimeline: 'flexible',
    deliveryDate: '',
    shippingPreference: 'standard',
    incoterms: 'FOB',
    isVerifiedSuppliersOnly: false,
    items: [{
      ...emptyItem,
      name: product.name || '',
      category: typeof product.category === 'string' ? product.category : product.category?.name || '',
      subcategory: typeof product.subcategory === 'string' ? product.subcategory : product.subcategory?.name || '',
      quantity: String(product.requestedQuantity || product.moq || product.minimumOrderQuantity || 1),
      unit: product.requestedUnit || product.unit || 'pcs',
      targetPrice: product.price || '',
    }],
  })
  const subcategories = useMemo(() => categories.data?.find((item) => item.name === form.category)?.subcategories || [], [categories.data, form.category])
  const update = useCallback((key, value) => setForm((current) => ({ ...current, [key]: value })), [])

  function updateItem(index, key, value) {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index
        ? { ...item, [key]: value, ...(key === 'category' ? { subcategory: '' } : {}) }
        : item),
    }))
  }

  async function submit(status) {
    setError('')
    const validItems = form.items.filter((item) => item.name.trim())
    if (!form.title.trim() || !form.description.trim() || !form.category || !form.deliveryCountry.trim() || !validItems.length) {
      return setError('Title, description, category, at least one product, quantity and destination country are required.')
    }
    if (validItems.some((item) => !Number.isFinite(Number(item.quantity)) || Number(item.quantity) < 1)) {
      return setError('Enter a valid quantity for every product.')
    }
    if ([form.title, form.description, form.specifications, ...validItems.flatMap((item) => [item.name, item.specifications])].some((value) => contactPattern.test(value))) {
      return setError('Phone numbers, email addresses and external links are not allowed in RFQs.')
    }

    setBusy(status)
    try {
      const items = validItems.map((item) => ({
        ...item,
        category: item.category || form.category,
        subcategory: item.subcategory || form.subcategory,
        quantity: Math.max(Number(item.quantity) || 1, 1),
        targetPrice: Number(item.targetPrice) || undefined,
      }))
      const quantity = items.reduce((sum, item) => sum + item.quantity, 0)

      if ((product._id || product.id) && prefill.sellerUserId && status !== 'draft') {
        const result = await createProductEnquiry({
          productId: product._id || product.id,
          sellerUserId: prefill.sellerUserId,
          productName: form.title,
          quantity: items[0].quantity,
          unit: items[0].unit,
          targetPrice: Number(form.targetPrice) || undefined,
          destinationCountry: form.deliveryCountry,
          additionalNotes: [form.description, form.specifications].filter(Boolean).join('\n\n'),
          attachments,
        })
        const rfq = result.rfq || result
        return result.chat ? navigate(`/messages/${result.chat._id || result.chat.id}`) : navigate(`/rfqs/${rfq._id || rfq.id}`)
      }

      const isPrivate = Boolean(prefill.sellerId || prefill.sellerUserId)
      const payload = {
        ...form,
        quantity,
        unit: items[0].unit,
        targetPrice: Number(form.targetPrice) || undefined,
        visibility: isPrivate ? 'private' : 'public',
        sellerId: prefill.sellerId || undefined,
        sellerUserId: prefill.sellerUserId || undefined,
        status,
        rfqType: items.length > 1 ? 'multi_product' : product._id || product.id ? 'product' : 'custom',
        productId: product._id || product.id || undefined,
        items,
        attachments,
      }
      if (isPrivate) {
        const result = await createSellerRfq(payload)
        return result.chat ? navigate(`/messages/${result.chat._id || result.chat.id}`) : navigate(`/rfqs/${result.rfq?._id || result.rfq?.id || result._id || result.id}`)
      }
      const rfq = await createRfq(payload)
      navigate(`/rfqs/${rfq._id || rfq.id}`)
    } catch (nextError) {
      setError(nextError.message)
      setBusy('')
    }
  }

  return <AppShell><div className="trade-form-page container">
    <button className="back-link" onClick={() => navigate(-1)}><ArrowLeft /> Back</button>
    <header><span className="eyebrow">{prefill.sellerId || prefill.sellerUserId ? 'Private supplier enquiry' : 'Buyer sourcing request'}</span><h1>{prefill.sellerId || prefill.sellerUserId ? `Send enquiry${prefill.supplierName ? ` to ${prefill.supplierName}` : ''}` : 'Create RFQ'}</h1><p>{prefill.sellerId || prefill.sellerUserId ? 'This private RFQ is visible only to the selected supplier and opens a direct buyer–seller chat.' : 'Describe the requirement once; EsyGlob sends it only to relevant marketplace suppliers.'}</p></header>
    <div className="trade-form-layout">
      <div>
        <FormSection title="Requirement">
          <Field label="RFQ title" required><input value={form.title} onChange={(event) => update('title', event.target.value)} /></Field>
          <Field label="Description" required><textarea value={form.description} onChange={(event) => update('description', event.target.value)} /></Field>
          <div className="form-grid">
            <Field label="Category" required><select value={form.category} onChange={(event) => { update('category', event.target.value); update('subcategory', '') }}><option value="">Select category</option>{categories.data?.map((item) => <option key={item._id || item.name}>{item.name}</option>)}</select></Field>
            <Field label="Subcategory"><select value={form.subcategory} onChange={(event) => update('subcategory', event.target.value)}><option value="">Select subcategory</option>{subcategories.map((item) => <option key={item._id || item.name} value={item.name}>{item.name}</option>)}</select></Field>
          </div>
          <Field label="Specifications"><textarea value={form.specifications} onChange={(event) => update('specifications', event.target.value)} /></Field>
        </FormSection>
        <FormSection title="Products and quantity">
          {form.items.map((item, index) => <div className="line-item" key={index}>
            <div className="line-item__head"><b>Item {index + 1}</b>{form.items.length > 1 && <button type="button" onClick={() => update('items', form.items.filter((_, itemIndex) => itemIndex !== index))}><Trash2 /></button>}</div>
            <div className="form-grid form-grid--3">
              <Field label="Product" required><input value={item.name} onChange={(event) => updateItem(index, 'name', event.target.value)} /></Field>
              <Field label="Quantity" required><input type="number" min="1" value={item.quantity} onChange={(event) => updateItem(index, 'quantity', event.target.value)} /></Field>
              <Field label="Unit"><input value={item.unit} onChange={(event) => updateItem(index, 'unit', event.target.value)} /></Field>
            </div>
            <Field label="Item specifications"><input value={item.specifications} onChange={(event) => updateItem(index, 'specifications', event.target.value)} /></Field>
          </div>)}
          <button className="add-line" type="button" onClick={() => update('items', [...form.items, { ...emptyItem }])}><Plus /> Add another product</button>
        </FormSection>
        <FormSection title="Attachments"><AttachmentUploader folder="rfqs" value={attachments} onChange={setAttachments} /></FormSection>
      </div>
      <aside>
        <FormSection title="Commercial and delivery terms">
          <Field label="Target price"><div className="compound-input"><select value={form.currency} onChange={(event) => update('currency', event.target.value)}><option>INR</option><option>USD</option><option>EUR</option><option>GBP</option></select><input type="number" min="0" value={form.targetPrice} onChange={(event) => update('targetPrice', event.target.value)} /></div></Field>
          <Field label="Destination country" required><input value={form.deliveryCountry} onChange={(event) => update('deliveryCountry', event.target.value)} /></Field>
          <Field label="Delivery port"><input value={form.deliveryPort} onChange={(event) => update('deliveryPort', event.target.value)} /></Field>
          <Field label="Required delivery date"><input type="date" value={form.deliveryDate} onChange={(event) => update('deliveryDate', event.target.value)} /></Field>
          <Field label="Shipping preference"><select value={form.shippingPreference} onChange={(event) => update('shippingPreference', event.target.value)}><option value="standard">Standard logistics</option><option value="premium">Premium logistics</option><option value="enterprise">Enterprise logistics</option><option value="seller_quote">Seller to quote</option></select></Field>
          <Field label="Timeline"><select value={form.deliveryTimeline} onChange={(event) => update('deliveryTimeline', event.target.value)}><option value="flexible">Flexible</option><option value="urgent">Urgent</option><option value="30_days">Within 30 days</option><option value="60_days">Within 60 days</option></select></Field>
          <Field label="Incoterms"><select value={form.incoterms} onChange={(event) => update('incoterms', event.target.value)}>{['FOB', 'CIF', 'EXW', 'CFR', 'DDP', 'DAP'].map((item) => <option key={item}>{item}</option>)}</select></Field>
          {!prefill.sellerId && !prefill.sellerUserId && <label className="checkbox trade-checkbox"><input type="checkbox" checked={form.isVerifiedSuppliersOnly} onChange={(event) => update('isVerifiedSuppliersOnly', event.target.checked)} /><span /> Verified suppliers only</label>}
        </FormSection>
        {error && <p className="action-error">{error}</p>}
        <div className="sticky-form-actions"><button className="button button--secondary" disabled={Boolean(busy)} onClick={() => submit('draft')}><Save /> {busy === 'draft' ? 'Saving…' : 'Save draft'}</button><button className="button button--primary" disabled={Boolean(busy)} onClick={() => submit('active')}><Send /> {busy === 'active' ? 'Submitting…' : prefill.sellerId || prefill.sellerUserId ? 'Send private enquiry' : 'Publish RFQ'}</button></div>
      </aside>
    </div>
  </div></AppShell>
}

export function FormSection({ title, children }) { return <section className="trade-form-section"><h2>{title}</h2>{children}</section> }
export function Field({ label, required, children }) { return <label className="trade-field"><span>{label}{required && <em>*</em>}</span>{children}</label> }
