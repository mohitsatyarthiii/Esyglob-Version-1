import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BadgeCheck, CheckCircle2, Clock3, Download, ExternalLink, Eye, FileText, History, Image,
  Save, ShieldCheck, Trash2, XCircle, ZoomIn, ZoomOut,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import {
  createResource, deleteResource, fetchVerificationDocument, getResource, listResource, reviewVerificationDocument,
  runResourceAction, updateResource,
} from '../api/client'
import ConfirmDialog from '../components/ConfirmDialog'
import DataTable from '../components/DataTable'
import Drawer from '../components/Drawer'
import ProviderBrand from '../components/ProviderBrand'
import AdminAddressAutocomplete from '../components/AdminAddressAutocomplete'
import ImageUploader from '../components/ImageUploader'
import { resources } from '../config/resources'
import { getProviderKey } from '../utils/providers'

export default function ResourcePage({ resource }) {
  const config = resources[resource]
  const client = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [debounced, setDebounced] = useState('')
  const [sort, setSort] = useState({ sortBy: 'createdAt', sortOrder: 'desc' })
  const [selected, setSelected] = useState(null)
  const [creating, setCreating] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [notice, setNotice] = useState('')
  useEffect(() => { const timer = setTimeout(() => { setDebounced(search); setPage(1) }, 280); return () => clearTimeout(timer) }, [search])
  const query = useQuery({ queryKey: ['admin', resource, page, debounced, status, sort], queryFn: () => listResource(resource, { page, search: debounced, status, ...sort }) })
  const detail = useQuery({ queryKey: ['admin', resource, selected?._id], queryFn: () => getResource(resource, selected._id), enabled: Boolean(selected?._id) })
  const invalidate = useCallback(async () => { await client.invalidateQueries({ queryKey: ['admin', resource] }) }, [client, resource])
  const remove = useMutation({ mutationFn: (id) => deleteResource(resource, id), onSuccess: async () => { setSelected(null); setNotice(resource === 'gift-cards' ? 'Gift card deactivated.' : 'Record deleted.'); await invalidate() } })
  const askDelete = (row) => new Promise((resolve) => setConfirm({ title: `${resource === 'gift-cards' ? 'Deactivate' : 'Delete'} ${config.title.slice(0, -1).toLowerCase()}?`, message: resource === 'gift-cards' ? 'The balance remains in history but the card can no longer be redeemed.' : 'This permanently removes the record. This action cannot be undone.', action: resource === 'gift-cards' ? 'Deactivate' : 'Delete record', resolve }))
    .then(async (approved) => { if (approved) await remove.mutateAsync(row._id) })
  const bulkDelete = async (ids) => {
    const approved = await new Promise((resolve) => setConfirm({ title: `Delete ${ids.length} records?`, message: 'Selected records will be permanently deleted or safely deactivated where transaction history must be retained.', action: `Continue with ${ids.length}`, resolve }))
    if (approved) { await Promise.all(ids.map((id) => deleteResource(resource, id))); setNotice(`${ids.length} records processed.`); await invalidate() }
  }
  const bulkStatus = async (ids, nextStatus) => {
    await runResourceAction(resource, ids[0], { action: 'bulk_status', ids, status: nextStatus })
    setNotice(`${ids.length} records updated to ${nextStatus.replaceAll('_', ' ')}.`)
    await invalidate()
  }
  const closeConfirm = (answer) => { confirm?.resolve(answer); setConfirm(null) }
  const refresh = async (message) => { setNotice(message); await Promise.all([detail.refetch(), invalidate()]) }
  const record = detail.data || selected
  return <div className="resource-page">
    <header className="page-heading"><div><span>Marketplace operations</span><h1>{config.title}</h1><p>{config.description}</p></div><div>{config.canCreate && <button className="primary" onClick={() => setCreating(true)}>Create new</button>}</div></header>
    {notice && <div className="admin-notice">{notice}<button onClick={() => setNotice('')}>Dismiss</button></div>}
    <DataTable config={config} data={query.data?.items} loading={query.isLoading} error={query.error} page={page} pages={query.data?.pagination?.pages || 1} total={query.data?.pagination?.total || 0} search={search} setSearch={setSearch} status={status} setStatus={(value) => { setStatus(value); setPage(1) }} sort={sort} setSort={setSort} onPage={setPage} onOpen={setSelected} onDelete={askDelete} onBulkDelete={bulkDelete} onBulkStatus={bulkStatus} onCreate={() => setCreating(true)} />
    <RecordDrawer key={`${resource}-${selected?._id || (creating ? 'new' : 'closed')}`} resource={resource} config={config} record={record} open={Boolean(selected || creating)} creating={creating} loading={detail.isLoading} close={() => { setSelected(null); setCreating(false) }} saved={async (message) => { setNotice(message); setSelected(null); setCreating(false); await invalidate() }} refreshed={refresh} askDelete={askDelete} />
    <ConfirmDialog state={confirm} close={closeConfirm} />
  </div>
}

function RecordDrawer({ resource, config, record, open, creating, loading, close, saved, refreshed, askDelete }) {
  const [submitError, setSubmitError] = useState('')
  const schema = useMemo(() => {
    const shape = {}
    config.fields.forEach(([name, label, type]) => {
      const root = name.split('.')[0]
      if (name.includes('.')) { shape[root] = z.any().optional(); return }
      let field = type === 'number'
        ? z.preprocess((value) => value === '' ? undefined : Number(value), z.number({ error: `${label} must be a number.` }).nonnegative().optional())
        : type === 'boolean' ? z.boolean().optional() : z.any().optional()
      if (creating && config.required?.includes(name)) field = field.refine((value) => value !== undefined && value !== null && value !== '', `${label} is required.`)
      shape[name] = field
    })
    return z.object(shape).passthrough()
  }, [config.fields, config.required, creating])
  const { control, register, handleSubmit, reset, setValue, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema) })
  useEffect(() => {
    const source = creating ? {} : record || {}
    const defaults = {}
    config.fields.forEach(([name, , type]) => {
      const value = readField(source, name)
      setField(defaults, name, type === 'datetime-local' && value ? new Date(value).toISOString().slice(0, 16) : Array.isArray(value) ? value.join(', ') : value ?? (type === 'boolean' ? false : ''))
    })
    reset(defaults)
  }, [config.fields, creating, record, reset])
  const submit = async (values) => {
    setSubmitError('')
    try {
      const result = creating ? await createResource(resource, values) : await updateResource(resource, record._id, values)
      const secureCode = resource === 'gift-cards' ? result?.code || result?.giftCode : ''
      await saved(secureCode ? `Gift card generated. Copy the secure code now: ${secureCode}` : creating ? 'Record created and logged.' : 'Changes saved and logged.')
    } catch (error) {
      setSubmitError(error.message)
    }
  }
  const title = creating ? `Create ${config.title.slice(0, -1)}` : recordTitle(resource, record)
  const footer = config.readOnly ? <button onClick={close}>Close</button> : <><button onClick={close}>Cancel</button>{!creating && <button className="danger-outline" onClick={() => askDelete(record)}><Trash2 /> {resource === 'gift-cards' ? 'Deactivate' : 'Delete'}</button>}<button className="primary" form="record-form" disabled={isSubmitting}><Save /> {isSubmitting ? 'Saving…' : 'Save changes'}</button></>
  return <Drawer open={open} title={title} subtitle={creating ? 'Add a new marketplace record' : `${config.title.slice(0, -1)} · ${record?._id || ''}`} onClose={close} footer={footer}>
    {loading ? <DrawerSkeleton /> : <form id="record-form" className="record-form" onSubmit={handleSubmit(submit)}>
      {!creating && <RecordSummary resource={resource} record={record} />}
      {submitError && <p className="action-error">{submitError}</p>}
      {!creating && !config.readOnly && <ActionCenter resource={resource} record={record} completed={refreshed} />}
      {config.fields.length > 0 && <section><header><h3>{creating ? 'Record details' : 'Editable fields'}</h3><p>Changes apply immediately and are written to the admin activity log.</p></header><div className="drawer-form-grid">{config.fields.map(([name, label, type = 'text', options]) => <Field key={name} name={name} label={label} type={type} options={options} register={register} control={control} setValue={setValue} error={readField(errors, name)?.message} />)}</div></section>}
      {!creating && <RelatedPanels resource={resource} record={record} refreshed={refreshed} />}
    </form>}
  </Drawer>
}

function ActionCenter({ resource, record, completed }) {
  const [selected, setSelected] = useState('')
  const [form, setForm] = useState({ reason: '', notes: '', amount: '', reference: '', status: '', sortOrder: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const actions = actionOptions(resource, record)
  if (!actions.length) return null
  const submit = async () => {
    setBusy(true); setError('')
    try {
      await runResourceAction(resource, record._id, {
        action: selected,
        reason: form.reason || undefined, notes: form.notes || undefined,
        amount: form.amount || undefined, reference: form.reference || undefined,
        status: form.status || undefined, sortOrder: form.sortOrder || undefined,
      })
      setSelected(''); setForm({ reason: '', notes: '', amount: '', reference: '', status: '', sortOrder: '' })
      await completed(`${humanize(selected)} completed and logged.`)
    } catch (next) { setError(next.message) } finally { setBusy(false) }
  }
  return <section className="action-center"><header><h3><ShieldCheck /> Operational actions</h3><p>Permission-checked actions with immutable audit history.</p></header><div className="action-buttons">{actions.map(([action, label, tone]) => <button type="button" className={tone || ''} key={action} onClick={() => { setSelected(action); setError('') }}>{label}</button>)}</div>{selected && <div className="action-form"><b>{humanize(selected)}</b>{requiresReason(selected) && <label>Reason<textarea value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="Required reason shown in the audit trail" /></label>}{['add_note', 'update_tracking'].includes(selected) && <label>{selected === 'update_tracking' ? 'Tracking note' : 'Internal note'}<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>}{selected === 'update_status' && <label>Order status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="">Select status</option>{['pending', 'confirmed', 'processing', 'production', 'ready_to_ship', 'shipped', 'delivered', 'completed', 'cancelled', 'refunded', 'disputed'].map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</select></label>}{['refund'].includes(selected) && <><label>Refund amount<input type="number" min="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="Leave blank for full refund" /></label><label>Manual reference<input value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} /></label></>}{['mark_paid', 'update_tracking'].includes(selected) && <label>{selected === 'update_tracking' ? 'Tracking number' : 'Transaction reference'}<input value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} /></label>}{['reorder'].includes(selected) && <label>Sort order<input type="number" min="0" value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: event.target.value })} /></label>}{error && <p className="action-error">{error}</p>}<footer><button type="button" onClick={() => setSelected('')}>Cancel</button><button type="button" className="primary" disabled={busy || !actionReady(selected, form)} onClick={submit}>{busy ? 'Processing…' : 'Confirm action'}</button></footer></div>}</section>
}

function Field({ name, label, type, options, register, control, setValue, error }) {
  if (type === 'boolean') return <label className="toggle-field"><span><b>{label}</b><small>Enable or disable this setting.</small></span><input type="checkbox" {...register(name)} /><i /></label>
  if (type === 'image-upload') return <div className="wide"><Controller name={name} control={control} render={({ field }) => <ImageUploader value={field.value || ''} onChange={field.onChange} folder="categories" label={label} />} />{error && <small className="field-error">{error}</small>}</div>
  if (type === 'address') return <label className="wide"><span>{label}</span><Controller name={name} control={control} render={({ field }) => <AdminAddressAutocomplete value={field.value} onChange={field.onChange} onSelect={location => {
    if (!location) return
    field.onChange(location.formattedAddress)
    setValue('city', location.city || '', { shouldDirty: true })
    setValue('country', location.country || '', { shouldDirty: true })
    setValue('state', location.state || '', { shouldDirty: true })
    setValue('postalCode', location.postalCode || '', { shouldDirty: true })
    setValue('district', location.district || '', { shouldDirty: true })
    setValue('latitude', location.latitude, { shouldDirty: true })
    setValue('longitude', location.longitude, { shouldDirty: true })
    setValue('placeId', location.placeId || '', { shouldDirty: true })
  }} />} />{error && <small className="field-error">{error}</small>}</label>
  return <label className={type === 'textarea' ? 'wide' : ''}><span>{label}</span>{type === 'select' ? <select {...register(name)}>{options.map((option) => <option value={option} key={option}>{option.replaceAll('_', ' ')}</option>)}</select> : type === 'textarea' ? <textarea rows="4" {...register(name)} /> : <input type={type} {...register(name)} />}{error && <small className="field-error">{error}</small>}</label>
}

function RecordSummary({ resource, record }) {
  const images = resource === 'products' ? record?.images : resource === 'sellers' ? [record?.companyLogo, ...(record?.companyPhotos || [])] : []
  const providerKey = getProviderKey(record)
  return <section className="record-summary">{providerKey && <div className="admin-provider-heading"><ProviderBrand providerKey={providerKey} /><span><small>Logistics provider</small><b>{humanize(providerKey)}</b></span></div>}{images?.filter(Boolean).length > 0 && <div className="record-media">{images.filter(Boolean).slice(0, 4).map((source) => <img src={source} key={source} alt="" />)}</div>}<dl>{Object.entries(record || {}).filter(([key, value]) => ['string', 'number', 'boolean'].includes(typeof value) && !key.startsWith('_') && !['description', 'adminNotes'].includes(key)).slice(0, 14).map(([key, value]) => <div key={key}><dt>{humanize(key)}</dt><dd>{String(value)}</dd></div>)}</dl></section>
}

function RelatedPanels({ resource, record, refreshed }) {
  if (resource === 'verifications') return <VerificationPanels record={record} refreshed={refreshed} />
  if (resource === 'categories') return <NestedCategoryManager record={record} refreshed={refreshed} />
  if (resource === 'payments') return <><DetailJson title="Gateway response" value={record?.gatewayResponse} /><Timeline items={paymentTimeline(record)} /></>
  if (resource === 'orders' && getProviderKey(record)) return <><section><header><h3>Provider booking</h3></header><div className="admin-provider-detail"><ProviderBrand providerKey={getProviderKey(record)} /><dl className="detail-list"><div><dt>Provider</dt><dd>{humanize(getProviderKey(record))}</dd></div><div><dt>Service</dt><dd>{record?.provider?.serviceName || record?.checkout?.logisticsSnapshot?.label || record?.shippingMethod || 'Carrier service'}</dd></div><div><dt>Tracking number</dt><dd>{record?.provider?.trackingNumber || record?.trackingNumber || 'Pending'}</dd></div><div><dt>ETA</dt><dd>{formatDate(record?.provider?.eta || record?.estimatedDeliveryDate)}</dd></div></dl></div></section><Timeline items={record?.timeline || record?.statusHistory || record?.history} /></>
  if (resource === 'coupons') return <><section><header><h3>Campaign analytics</h3></header><dl className="detail-list"><div><dt>Redemptions</dt><dd>{record?.redemptionCount || 0}</dd></div><div><dt>Discount distributed</dt><dd>{record?.currency || ''} {record?.totalDiscountDistributed || 0}</dd></div><div><dt>Usage limit</dt><dd>{record?.usageLimit || 'Unlimited'}</dd></div><div><dt>Per-user limit</dt><dd>{record?.perUserUsageLimit || 1}</dd></div></dl></section><HistoryList title="Redemption history" items={record?.redemptions} /></>
  if (resource === 'gift-cards') return <><section><header><h3>Balance and redemption status</h3></header><dl className="detail-list"><div><dt>Original balance</dt><dd>{record?.currency} {record?.originalBalance || 0}</dd></div><div><dt>Available balance</dt><dd>{record?.currency} {record?.balance || 0}</dd></div><div><dt>Redeem status</dt><dd>{humanize(record?.status)}</dd></div><div><dt>Expiry</dt><dd>{formatDate(record?.expiresAt)}</dd></div></dl></section><HistoryList title="Gift card transactions" items={record?.transactions} /></>
  if (resource === 'users') return <><section><header><h3>Login and account activity</h3></header><dl className="detail-list"><div><dt>Last login</dt><dd>{formatDate(record?.lastLoginAt)}</dd></div><div><dt>Onboarding</dt><dd>{record?.hasCompletedOnboarding ? 'Completed' : 'Incomplete'}</dd></div><div><dt>Admin role</dt><dd>{record?.metadata?.adminRole || 'Not assigned'}</dd></div><div><dt>Seller verification</dt><dd>{humanize(record?.verification?.status || 'not submitted')}</dd></div><div><dt>Verification feedback</dt><dd>{record?.verification?.sellerFeedback || record?.verification?.rejectionReason || '—'}</dd></div></dl></section><Timeline items={record?.activity} /></>
  const timeline = record?.timeline || record?.statusHistory || record?.history || record?.auditLogs
  if (timeline?.length) return <section><header><h3><Clock3 /> Activity timeline</h3></header><Timeline items={timeline} /></section>
  if (resource === 'products' && record?.images?.length) return <section><header><h3><Image /> Product media</h3></header><div className="record-media">{record.images.map((source) => <img src={source} alt="" key={source} />)}</div></section>
  return null
}

function NestedCategoryManager({ record, refreshed }) {
  const empty = { name: '', slug: '', description: '', image: '', active: true }
  const [form, setForm] = useState(empty)
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const save = async () => {
    setBusy(true); setError('')
    try {
      const payload = { categoryId: record._id, name: form.name.trim(), slug: form.slug.trim(), description: form.description.trim(), image: form.image.trim(), isActive: form.active }
      if (editing) await updateResource('subcategories', editing, payload)
      else await createResource('subcategories', payload)
      const message = editing ? 'Subcategory updated and logged.' : 'Subcategory created and logged.'
      setEditing(null); setForm(empty)
      await refreshed(message)
    } catch (next) { setError(next.message) } finally { setBusy(false) }
  }
  const edit = (item) => {
    setEditing(item._id)
    setForm({ name: item.name || '', slug: item.slug || '', description: item.description || '', image: item.image || '', active: item.isActive !== false })
  }
  const remove = async (item) => {
    if (!window.confirm(`Delete ${item.name}? Products linked to this subcategory should be reassigned first.`)) return
    setBusy(true); setError('')
    try { await deleteResource('subcategories', item._id); await refreshed('Subcategory deleted and logged.') } catch (next) { setError(next.message) } finally { setBusy(false) }
  }
  return <section className="nested-category-manager">
    <header><h3>Nested categories</h3><p>Create and maintain the taxonomy beneath this category.</p></header>
    <div className="nested-editor">
      <input value={form.name} onChange={(event) => change('name', event.target.value)} placeholder="Subcategory name" />
      <input value={form.slug} onChange={(event) => change('slug', event.target.value)} placeholder="URL slug" />
      <div className="nested-image-field"><ImageUploader value={form.image} onChange={(value) => change('image', value)} folder="subcategories" label="Subcategory image" disabled={busy} /></div>
      <textarea value={form.description} onChange={(event) => change('description', event.target.value)} placeholder="Description" />
      <label><input type="checkbox" checked={form.active} onChange={(event) => change('active', event.target.checked)} /> Active</label>
      <div>{editing && <button type="button" onClick={() => { setEditing(null); setForm(empty) }}>Cancel edit</button>}<button type="button" className="primary" disabled={busy || !form.name.trim() || !form.slug.trim()} onClick={save}>{editing ? 'Update subcategory' : 'Add subcategory'}</button></div>
    </div>
    {error && <p className="action-error">{error}</p>}
    <div className="nested-list">{record?.children?.length ? record.children.map((item) => <article key={item._id}>{item.image && <img src={item.image} alt="" />}<span><b>{item.name}</b><small>{item.slug}</small></span><em className={`status status--${item.isActive ? 'active' : 'inactive'}`}>{item.isActive ? 'active' : 'inactive'}</em><button type="button" onClick={() => edit(item)}>Edit</button><button type="button" className="danger-outline" onClick={() => remove(item)}>Delete</button></article>) : <p>No subcategories yet.</p>}</div>
  </section>
}

function VerificationPanels({ record, refreshed }) {
  const seller = record?.sellerId || {}
  const user = record?.userId || {}
  const business = record?.stepData?.business || record?.stepData?.company || {}
  const factory = record?.factory || {}
  return <><section><header><h3>Business and contact information</h3></header><dl className="detail-list">{[
    ['Company name', seller.companyName || business.companyName], ['Business type', seller.companyType || business.businessType],
    ['Owner', business.ownerName || user.fullName], ['Email', seller.businessEmail || user.email], ['Mobile', seller.businessPhone || user.phone],
    ['Address', seller.address || business.businessAddress], ['Country', seller.country || business.country], ['State', seller.state || business.state],
    ['City', seller.city || business.city], ['Registration date', seller.registrationDate || seller.createdAt],
    ['GST', seller.gstNumber || business.gstNumber], ['PAN', seller.panNumber || business.panNumber],
    ['IEC', seller.importExportCode || business.iecNumber], ['CIN', seller.cin || business.cin],
    ['MSME', seller.msmeNumber || business.msmeNumber], ['Business license', seller.businessRegistrationNumber || business.businessLicense],
    ['Business category', seller.primaryCategory || business.businessCategory],
  ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{formatAdminValue(value)}</dd></div>)}</dl></section>
    <StructuredDetails title="Complete submitted application" value={{ businessInfo: record?.businessInfo, stepData: record?.stepData }} />
    <section><header><h3>Factory and operations</h3></header><dl className="detail-list">{[['Factory name', factory.factoryName || factory.name], ['Factory area', factory.factoryArea || factory.floorArea], ['Employees', factory.totalEmployees || factory.employeeCount], ['Production lines', factory.productionLines], ['Monthly capacity', factory.monthlyCapacity], ['Factory status', factory.verificationStatus]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{formatAdminValue(value)}</dd></div>)}</dl>{factory.images?.length > 0 && <div className="record-media">{factory.images.map((source) => <img src={source} alt="Factory evidence" key={source} />)}</div>}</section>
    <SellerBadges verificationId={record?._id} seller={seller} refreshed={refreshed} />
    <DocumentReview verification={record} refreshed={refreshed} />
    <section><header><h3>Private internal notes</h3><p>Visible to administrators only; never included in seller notifications.</p></header><Timeline items={record?.internalNotes?.map((item) => ({ ...item, action: 'internal_note', notes: item.note, createdAt: item.createdAt, actorId: item.authorId }))} /></section>
    <section><header><h3><History /> Verification timeline</h3><p>Seller uploads, document decisions and application status changes.</p></header><Timeline items={record?.history} /></section>
  </>
}

const SELLER_BADGES = [
  ['verifiedSeller', 'Verified Seller'], ['premiumSeller', 'Premium Seller'],
  ['trustedSupplier', 'Trusted Supplier'], ['goldSupplier', 'Gold Supplier'],
  ['topRated', 'Top Rated'], ['manufacturer', 'Manufacturer'],
  ['exporter', 'Exporter'], ['fastResponse', 'Fast Response'],
]

function SellerBadges({ verificationId, seller, refreshed }) {
  const [badges, setBadges] = useState(() => sellerBadgeState(seller))
  const [saving, setSaving] = useState('')
  const [error, setError] = useState('')
  if (!seller?._id) return null
  const toggle = async (key) => {
    const previous = badges
    const next = { ...badges, [key]: !badges[key] }
    setBadges(next); setSaving(key); setError('')
    try {
      await updateResource('verifications', verificationId, { sellerBadges: next })
      await refreshed(`${SELLER_BADGES.find(([value]) => value === key)?.[1]} ${next[key] ? 'enabled' : 'disabled'}.`)
    } catch (nextError) {
      setBadges(previous)
      setError(nextError.message)
    } finally { setSaving('') }
  }
  return <section className="seller-badge-manager"><header><h3><BadgeCheck /> Seller Badges</h3><p>Badge changes save immediately and are returned by the public seller APIs.</p></header><div>{SELLER_BADGES.map(([key, label]) => <label className="toggle-field" key={key}><span><b>{label}</b><small>{saving === key ? 'Saving…' : badges[key] ? 'Assigned' : 'Not assigned'}</small></span><input type="checkbox" checked={Boolean(badges[key])} disabled={Boolean(saving)} onChange={() => toggle(key)} /><i /></label>)}</div>{error && <p className="action-error">{error}</p>}</section>
}

function sellerBadgeState(seller = {}) {
  const stored = seller.badges || {}
  const plan = String(seller.subscriptionPlan || '').toLowerCase()
  return {
    verifiedSeller: stored.verifiedSeller ?? Boolean(seller.isVerified),
    premiumSeller: stored.premiumSeller ?? Boolean(seller.isPremium || ['premium', 'gold', 'enterprise'].includes(plan)),
    trustedSupplier: stored.trustedSupplier ?? Boolean(seller.isTrustedSeller || seller.trustedSellerBadge === 'active'),
    goldSupplier: stored.goldSupplier ?? false,
    topRated: stored.topRated ?? Number(seller.rating || 0) >= 4.5,
    manufacturer: stored.manufacturer ?? seller.companyType === 'manufacturer',
    exporter: stored.exporter ?? (seller.companyType === 'exporter' || Boolean(seller.exportMarkets?.length)),
    fastResponse: stored.fastResponse ?? Number(seller.responseRate || 0) >= 80,
  }
}

function DocumentReview({ verification, refreshed }) {
  const [preview, setPreview] = useState(null)
  const [reviewing, setReviewing] = useState(null)
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const review = async (status) => {
    setBusy(true); setError('')
    try {
      await reviewVerificationDocument(verification._id, reviewing._id, { status, reason: reason || undefined, notes: notes || undefined })
      setReviewing(null); setReason(''); setNotes('')
      await refreshed(`Document ${status.replaceAll('_', ' ')} and seller notified.`)
    } catch (next) { setError(next.message) } finally { setBusy(false) }
  }
  const documents = verification?.documents?.filter((item) => item.status !== 'archived') || []
  return <section><header><h3><FileText /> Uploaded documents</h3><p>Review every file independently before approving the seller.</p></header><div className="verification-documents">{documents.length ? documents.map((document) => <article key={document._id}><button type="button" className="document-preview" disabled={!document.fileAvailable} onClick={() => setPreview(document)}>{isImage(document) && document.fileAvailable ? <img src={document.url} alt="" /> : <FileText />}</button><div><b>{document.name}</b><small>{humanize(document.type)} · {document.mimeType || fileType(document.name)}</small><small>{formatBytes(document.size)} · Uploaded {formatDate(document.uploadedAt)}</small>{!document.fileAvailable && <p>Original file is unavailable; metadata and review history remain preserved.</p>}{document.rejectionReason && <p>{document.rejectionReason}</p>}</div><em className={`status status--${document.status}`}>{humanize(document.status)}</em><div className="document-actions">{document.fileAvailable && <><button type="button" onClick={() => setPreview(document)}><Eye /> Preview</button><a href={document.url} target="_blank" rel="noreferrer"><ExternalLink /> Open</a><a href={document.url} download><Download /> Download</a></>}<button type="button" onClick={() => setReviewing(document)}>Review</button></div></article>) : <p className="admin-empty-state">No verification documents have been submitted.</p>}</div>
    {reviewing && <div className="document-review-form"><header><b>Review {reviewing.name}</b><button type="button" onClick={() => setReviewing(null)}>Close</button></header><label>Internal reviewer note<textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label><label>Seller feedback / rejection reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required for rejection or revision" /></label>{error && <p className="action-error">{error}</p>}<footer><button type="button" disabled={busy} onClick={() => review('under_review')}>Pending review</button><button type="button" className="danger-outline" disabled={busy || !reason.trim()} onClick={() => review('needs_update')}><XCircle /> Request revision</button><button type="button" className="danger-outline" disabled={busy || !reason.trim()} onClick={() => review('rejected')}>Reject</button><button type="button" className="primary" disabled={busy} onClick={() => review('verified')}><CheckCircle2 /> Approve</button></footer></div>}
    {preview && <DocumentViewer document={preview} close={() => setPreview(null)} />}
  </section>
}

function DocumentViewer({ document, close }) {
  const [zoom, setZoom] = useState(1)
  const [source, setSource] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    let objectUrl = ''
    fetchVerificationDocument(document._id).then((blob) => {
      if (!active) return
      objectUrl = URL.createObjectURL(blob)
      setSource(objectUrl)
    }).catch((nextError) => { if (active) setError(nextError.message) })
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [document._id])
  return <div className="document-viewer-backdrop" onMouseDown={close}><section className="document-viewer" onMouseDown={(event) => event.stopPropagation()}><header><div><b>{document.name}</b><small>{humanize(document.type)}</small></div><nav><button type="button" onClick={() => setZoom((value) => Math.max(.5, value - .25))}><ZoomOut /></button><span>{Math.round(zoom * 100)}%</span><button type="button" onClick={() => setZoom((value) => Math.min(3, value + .25))}><ZoomIn /></button><a href={document.url} target="_blank" rel="noreferrer"><ExternalLink /></a><button type="button" onClick={close}><XCircle /></button></nav></header><div>{error ? <p className="action-error">{error}</p> : !source ? <DrawerSkeleton /> : isImage(document) ? <img src={source} alt={document.name} style={{ transform: `scale(${zoom})` }} /> : <object data={source} type={document.mimeType || 'application/pdf'}><a href={document.url} target="_blank" rel="noreferrer">Open document</a></object>}</div></section></div>
}

function Timeline({ items = [] }) {
  return <div className="drawer-timeline">{items?.length ? items.map((item, index) => <article key={item._id || index}><i /><div><b>{humanize(item.action || item.status || 'Updated')}</b><p>{item.summary || item.notes || item.note || item.description}</p><small>{item.actorId?.fullName || item.actorId?.email || item.actorRole || ''}{item.createdAt || item.timestamp ? ` · ${formatDate(item.createdAt || item.timestamp, true)}` : ''}</small></div></article>) : <p>No history recorded yet.</p>}</div>
}
function HistoryList({ title, items = [] }) { return <section><header><h3><History /> {title}</h3></header>{items?.length ? <div className="nested-list">{items.map((item) => <article key={item._id}><span><b>{item.type || item.status || item.action || 'Transaction'}</b><small>{item.userId?.fullName || item.userId?.email || item.orderId?.orderNumber || formatDate(item.createdAt)}</small></span><strong>{item.amount ? `${item.currency || ''} ${item.amount}` : item.discountAmount || ''}</strong></article>)}</div> : <p>No history yet.</p>}</section> }
function DetailJson({ title, value }) { return value ? <section><header><h3>{title}</h3></header><pre className="detail-json">{JSON.stringify(value, null, 2)}</pre></section> : null }
function StructuredDetails({ title, value }) {
  const entries = flattenDetails(value)
  return entries.length ? <section><header><h3>{title}</h3><p>All fields submitted through the seller verification workflow.</p></header><dl className="detail-list">{entries.map(([label, item]) => <div key={label}><dt>{humanize(label.replaceAll('.', ' / '))}</dt><dd>{String(item)}</dd></div>)}</dl></section> : null
}
function DrawerSkeleton() { return <div className="drawer-skeleton">{Array.from({ length: 8 }, (_, index) => <i key={index} />)}</div> }
function recordTitle(resource, record) { return record?.fullName || record?.companyName || record?.name || record?.orderNumber || record?.paymentNumber || record?.code || record?.label || (resource === 'verifications' ? record?.sellerId?.companyName : '') || 'Record details' }
function humanize(value) { return String(value || '').replaceAll('_', ' ').replaceAll(/([A-Z])/g, ' $1').trim().replace(/^./, (letter) => letter.toUpperCase()) }
function formatDate(value, withTime = false) { return value ? new Date(value).toLocaleString([], withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }) : 'Not available' }
function formatBytes(value) { if (!Number(value)) return 'Size unavailable'; const units = ['B', 'KB', 'MB', 'GB']; const index = Math.min(Math.floor(Math.log(Number(value)) / Math.log(1024)), units.length - 1); return `${(Number(value) / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}` }
function formatAdminValue(value) { if (value === undefined || value === null || value === '') return 'Not provided'; if (typeof value !== 'object') return String(value); return [value.street, value.line1, value.line2, value.city, value.state, value.country, value.pincode || value.postalCode].filter(Boolean).join(', ') || JSON.stringify(value) }
function fileType(name = '') { return name.split('.').pop()?.toUpperCase() || 'File' }
function isImage(document) { return document.mimeType?.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(document.url || document.name || '') }
function requiresReason(action) { return ['suspend', 'reject', 'refund', 'cancel'].includes(action) }
function actionReady(action, form) {
  if (requiresReason(action) && !form.reason.trim()) return false
  if (['mark_paid', 'update_tracking'].includes(action) && !form.reference.trim()) return false
  if (action === 'add_note' && !form.notes.trim()) return false
  if (action === 'reorder' && form.sortOrder === '') return false
  if (action === 'update_status' && !form.status) return false
  return true
}
function paymentTimeline(record) { return [{ action: 'payment_created', createdAt: record?.createdAt, notes: record?.description }, record?.paidAt && { action: 'payment_completed', createdAt: record.paidAt, notes: record.transactionId }, record?.refundedAt && { action: 'payment_refunded', createdAt: record.refundedAt, notes: record.refundReason }].filter(Boolean) }
function actionOptions(resource, record) {
  const options = {
    users: [[record?.isBanned ? 'activate' : 'suspend', record?.isBanned ? 'Activate user' : 'Suspend user', record?.isBanned ? '' : 'danger']],
    products: [['approve', 'Approve'], ['reject', 'Reject', 'danger'], ['suspend', 'Suspend', 'danger'], ['feature', 'Feature'], ['hide', 'Hide'], ['restore', 'Restore']],
    categories: [[record?.isActive ? 'disable' : 'enable', record?.isActive ? 'Disable' : 'Enable'], ['reorder', 'Change order']],
    orders: [['update_status', 'Update status'], ['update_tracking', 'Update tracking'], ['mark_paid', 'Mark paid'], ['generate_invoice', 'Generate invoice'], ['add_note', 'Add note'], ['cancel', 'Cancel', 'danger'], ['refund', 'Refund', 'danger']],
    payments: [['mark_paid', 'Mark paid'], ['retry', 'Retry'], ['refund', 'Refund', 'danger']],
    coupons: [[record?.status === 'active' ? 'disable' : 'enable', record?.status === 'active' ? 'Disable' : 'Enable'], ['duplicate', 'Duplicate']],
    'gift-cards': [[record?.status === 'active' ? 'disable' : 'activate', record?.status === 'active' ? 'Deactivate' : 'Activate']],
  }
  return options[resource] || []
}
function readField(source, path) { return String(path).split('.').reduce((value, key) => value?.[key], source) }
function setField(target, path, value) {
  const parts = String(path).split('.')
  const last = parts.pop()
  const parent = parts.reduce((current, key) => current[key] ||= {}, target)
  parent[last] = value
}
function flattenDetails(value, prefix = '') {
  if (!value || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, item]) => {
    if (item === undefined || item === null || item === '' || key.startsWith('_')) return []
    const path = prefix ? `${prefix}.${key}` : key
    if (Array.isArray(item)) return item.length ? [[path, item.every((entry) => typeof entry !== 'object') ? item.join(', ') : JSON.stringify(item)]] : []
    if (typeof item === 'object') return flattenDetails(item, path)
    return [[path, item]]
  })
}
