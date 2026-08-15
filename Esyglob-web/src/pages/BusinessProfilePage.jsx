/* eslint-disable react-hooks/set-state-in-effect */
import {
  BadgeCheck,
  BarChart3,
  Building2,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  ExternalLink,
  Factory,
  FileCheck2,
  FileText,
  Globe2,
  Image,
  LockKeyhole,
  PackageCheck,
  Save,
  ShieldCheck,
  Sparkles,
  Truck,
  Upload,
  Users,
  Video,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  archiveVerificationDocument,
  fetchVerificationWorkspace,
  saveFactoryProfile,
  saveVerificationDraft,
  selectManualVerification,
  startDigiLockerVerification,
  uploadVerificationDocument,
} from '../api/verification'
import { uploadFiles } from '../api/trade'
import { fetchCategories } from '../api/marketplace'
import AppShell from '../components/AppShell'
import AddressAutocomplete from '../components/AddressAutocomplete'
import { SafeImage } from '../components/MarketplaceCards'

const sections = [
  ['overview', 'Overview', BarChart3],
  ['company', 'Company', Building2],
  ['products', 'Products & markets', PackageCheck],
  ['trade', 'Trade capabilities', Globe2],
  ['factory', 'Factory', Factory],
  ['media', 'Media', Image],
  ['verification', 'Verification', ShieldCheck],
  ['contacts', 'Team & contacts', Users],
]

const documentTypes = [
  ['business_registration', 'Business registration'],
  ['gst_certificate', 'GST certificate'],
  ['import_export_code', 'IEC certificate'],
  ['government_id_front', 'Authorized person ID'],
  ['address_proof', 'Registered address proof'],
  ['factory_license', 'Factory licence'],
  ['quality_certificate', 'ISO / quality certificate'],
  ['certification', 'Other certification'],
]

const emptySeller = {
  companyName: '', companyType: '', companyDescription: '', companyWebsite: '', yearEstablished: '',
  employeeCount: '', gstNumber: '', panNumber: '', businessRegistrationNumber: '', importExportCode: '',
  businessEmail: '', businessPhone: '', companyLogo: '', coverImage: '', companyPhotos: [], companyVideos: [],
  brochures: [], languages: [], productCategories: [], productSubcategories: [], industries: [], mainProducts: [],
  exportMarkets: [], certifications: [], address: { street: '', city: '', state: '', country: '', pincode: '' },
  shippingInfo: { originPort: '', preferredCarriers: [], exportCountries: [], handlingTime: '', shippingSupport: [] },
  tradeCapabilities: { oem: false, odm: false, privateLabel: false, minimumOrderQuantity: '', productionLeadTime: '', qualityAssurance: '', rdCapability: '' },
  socialLinks: { linkedin: '', facebook: '', instagram: '', youtube: '' },
  teamContacts: [],
}

const emptyFactory = {
  name: '', address: { street: '', city: '', state: '', country: '', pincode: '' }, floorArea: '',
  description: '', employeeCount: '', productionLines: '', machinery: '', monthlyCapacity: '', annualCapacity: '',
  capabilities: [], qualityControl: '', qualityProcesses: [], exportMarkets: [], images: [], videos: [], certifications: [],
}

export default function BusinessProfilePage() {
  const [searchParams] = useSearchParams()
  const requestedSection = searchParams.get('section')
  const digiLockerOutcome = searchParams.get('digilocker')
  const [data, setData] = useState(null)
  const [seller, setSeller] = useState(emptySeller)
  const [factory, setFactory] = useState(emptyFactory)
  const [active, setActive] = useState(() => sections.some(([key]) => key === requestedSection) ? requestedSection : 'overview')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [marketplaceCategories, setMarketplaceCategories] = useState([])

  const load = useCallback(async () => {
    const result = await fetchVerificationWorkspace()
    setData(result)
    setSeller(normalizeSeller(result.seller))
    setFactory(normalizeFactory(result.factory))
    if (!requestedSection && !result.seller?.companyName) setActive('company')
  }, [requestedSection])

  useEffect(() => { load().catch((next) => setError(next.message)) }, [load])
  useEffect(() => { fetchCategories().then(setMarketplaceCategories).catch(() => setError('Unable to load marketplace categories.')) }, [])
  useEffect(() => {
    if (digiLockerOutcome === 'success') setMessage('DigiLocker documents were securely processed and added to this verification for review.')
    if (digiLockerOutcome === 'cancelled') setMessage('DigiLocker consent was cancelled. You can continue with manual verification.')
    if (digiLockerOutcome === 'failed') setError('DigiLocker verification is temporarily unavailable. You can continue with manual verification.')
  }, [digiLockerOutcome])

  const docs = useMemo(() => (data?.verification?.documents || []).filter((item) => item.status !== 'archived'), [data])
  const progress = useMemo(() => profileProgress(seller, factory, docs), [seller, factory, docs])
  const status = data?.verification?.status || seller.verificationStatus || 'draft'
  const factoryStatus = factory.verificationStatus || 'draft'

  async function save(section = active, submitForReview = false) {
    setBusy(true); setError(''); setMessage('')
    try {
      const payload = sellerPayload(seller, data, submitForReview)
      if (section === 'factory') {
        await saveFactoryProfile(factoryPayload(factory))
        await saveVerificationDraft(payload)
      } else {
        await saveVerificationDraft(payload)
        if (section === 'media' && (factory.images.length || factory.videos.length)) await saveFactoryProfile(factoryPayload(factory))
      }
      setMessage(submitForReview ? 'Business Profile submitted for verification.' : `${sectionLabel(section)} saved.`)
      await load()
    } catch (next) { setError(next.message) } finally { setBusy(false) }
  }

  async function uploadMedia(target, event) {
    const files = Array.from(event.target.files || [])
    if (!files.length) return
    setBusy(true); setError('')
    try {
      const uploaded = await uploadFiles(files, 'business-profile')
      const urls = uploaded.map((item) => item.secure_url || item.url || item.location).filter(Boolean)
      if (target === 'companyLogo' || target === 'coverImage') setSeller((current) => ({ ...current, [target]: urls[0] || current[target] }))
      else if (target === 'factoryImages') setFactory((current) => ({ ...current, images: unique([...current.images, ...urls]) }))
      else if (target === 'factoryVideos') setFactory((current) => ({ ...current, videos: unique([...current.videos, ...urls]) }))
      else setSeller((current) => ({ ...current, [target]: unique([...(current[target] || []), ...urls]) }))
      setMessage('Media uploaded. Save this section to publish the changes.')
    } catch (next) { setError(next.message) } finally { setBusy(false); event.target.value = '' }
  }

  async function uploadDocument(type, file) {
    if (!file) return
    setBusy(true); setError('')
    try { await uploadVerificationDocument(type, file); await load(); setMessage('Document uploaded for review.') }
    catch (next) { setError(next.message) } finally { setBusy(false) }
  }

  async function startDigiLocker() {
    setBusy(true); setError(''); setMessage('')
    try {
      const result = await startDigiLockerVerification()
      if (!result?.authorizationUrl) throw new Error('DigiLocker verification is temporarily unavailable.')
      window.location.assign(result.authorizationUrl)
    } catch (next) { setError(`${next.message} You can continue with manual verification.`); setBusy(false) }
  }

  async function chooseManual() {
    setBusy(true); setError(''); setMessage('')
    try { await selectManualVerification(); await load(); setMessage('Manual verification selected. Upload documents below when ready.') }
    catch (next) { setError(next.message) } finally { setBusy(false) }
  }

  if (!data && !error) return <AppShell><div className="container business-profile-loading">Loading Business Profile…</div></AppShell>

  return <AppShell><main className="business-profile-page">
    <div className="container">
      <header className="business-profile-hero">
        <div>
          <span className="eyebrow"><Sparkles /> Seller company CMS</span>
          <h1>Business Profile</h1>
          <p>Manage the single company profile that powers verification, marketplace discovery, RFQ matching, and your public Manufacturer page.</p>
        </div>
        <div className="business-profile-hero__actions">
          {data?.seller?._id && <Link className="button button--secondary" to={`/sellers/${data.seller._id}`} target="_blank">Preview public page <ExternalLink /></Link>}
          <button className="button button--primary" disabled={busy} onClick={() => save(active)}><Save /> {busy ? 'Saving…' : 'Save section'}</button>
        </div>
      </header>

      {(error || message) && <div className={`business-profile-alert ${error ? 'error' : 'success'}`}>{error ? <CircleAlert /> : <Check />}<span>{error || message}</span><button onClick={() => { setError(''); setMessage('') }}><X /></button></div>}

      <section className="business-profile-progress">
        <div className="business-profile-progress__ring" style={{ '--profile-progress': `${progress.percent * 3.6}deg` }}><span><b>{progress.percent}%</b><small>complete</small></span></div>
        <div><span>Public profile readiness</span><h2>{progress.percent === 100 ? 'Your profile is ready to earn buyer trust.' : `${progress.missing.length} sections need attention.`}</h2><p>{progress.missing.length ? `Complete ${progress.missing.join(', ')} to strengthen search visibility and RFQ matching.` : 'All core profile sections contain publishable information.'}</p></div>
        <div className="business-profile-trust">
          <TrustState label="Identity" status={verificationState(data, ['government_id_front', 'director_id'])} />
          <TrustState label="Business" status={seller.isVerified ? 'verified' : status} />
          <TrustState label="Factory" status={factoryStatus} />
          <TrustState label="Documents" status={docs.some((item) => ['verified', 'approved'].includes(item.status)) ? 'verified' : docs.length ? 'pending' : 'missing'} />
        </div>
      </section>

      <div className="business-profile-layout">
        <aside className="business-profile-nav">
          <div className="business-profile-brand"><span>{seller.companyLogo ? <SafeImage src={seller.companyLogo} alt="" /> : <Building2 />}</span><div><b>{seller.companyName || 'Your company'}</b><small>{formatStatus(status)}</small></div></div>
          <nav>{sections.map(([key, label, Icon]) => <button className={active === key ? 'active' : ''} onClick={() => setActive(key)} key={key}><Icon /><span><b>{label}</b><small>{progress.sections[key] ? 'Complete' : 'Needs attention'}</small></span><ChevronRight /></button>)}</nav>
        </aside>

        <section className="business-profile-workspace">
          {active === 'overview' && <Overview data={data} seller={seller} factory={factory} progress={progress} setActive={setActive} />}
          {active === 'company' && <CompanySection seller={seller} setSeller={setSeller} />}
          {active === 'products' && <ProductsSection seller={seller} setSeller={setSeller} productCount={data?.seller?.totalProducts || 0} categories={marketplaceCategories} />}
          {active === 'trade' && <TradeSection seller={seller} setSeller={setSeller} />}
          {active === 'factory' && <FactorySection factory={factory} setFactory={setFactory} />}
          {active === 'media' && <MediaSection seller={seller} setSeller={setSeller} factory={factory} setFactory={setFactory} busy={busy} upload={uploadMedia} />}
          {active === 'verification' && <VerificationSection data={data} seller={seller} setSeller={setSeller} docs={docs} busy={busy} upload={uploadDocument} remove={async (id) => { await archiveVerificationDocument(id); await load() }} submit={() => save('verification', true)} startDigiLocker={startDigiLocker} chooseManual={chooseManual} />}
          {active === 'contacts' && <ContactsSection seller={seller} setSeller={setSeller} />}
          {active !== 'overview' && <footer className="business-profile-savebar"><span>Changes update your public Manufacturer page after saving.</span><button className="button button--primary" disabled={busy} onClick={() => save(active)}><Save /> Save {sectionLabel(active)}</button></footer>}
        </section>
      </div>
    </div>
  </main></AppShell>
}

function Overview({ data, seller, factory, progress, setActive }) {
  const metrics = [
    ['Response rate', `${Number(data?.seller?.responseRate || 0)}%`, Clock3],
    ['Average response', data?.seller?.averageResponseTimeHours ? `${data.seller.averageResponseTimeHours}h` : '—', Clock3],
    ['Active products', Number(data?.seller?.totalProducts || 0), PackageCheck],
    ['Orders completed', Number(data?.seller?.totalOrders || 0), BadgeCheck],
    ['Rating', Number(data?.seller?.rating || 0).toFixed(1), Sparkles],
    ['Trust score', `${Number(data?.seller?.trustScore || data?.verificationCenter?.overallTrustScore || 0)}/100`, ShieldCheck],
  ]
  return <div className="business-profile-overview">
    <header><span>Profile control centre</span><h2>{seller.companyName || 'Build your company presence'}</h2><p>System metrics are calculated from actual marketplace activity and cannot be edited.</p></header>
    <div className="business-system-metrics">{metrics.map(([label, value, Icon]) => <article key={label}><i><Icon /></i><span><small>{label}</small><b>{value}</b></span></article>)}</div>
    <section><div><h3>Profile sections</h3><p>Complete each area once; EsyGlob reuses it everywhere buyers see your company.</p></div><div className="business-section-checklist">{sections.slice(1).map(([key, label, Icon]) => <button key={key} onClick={() => setActive(key)}><i className={progress.sections[key] ? 'done' : ''}>{progress.sections[key] ? <Check /> : <Icon />}</i><span><b>{label}</b><small>{progress.sections[key] ? 'Ready to publish' : 'Add required information'}</small></span><ChevronRight /></button>)}</div></section>
    {factory.inspection?.scheduledAt && <div className="business-inspection-note"><Factory /><span><b>Factory inspection scheduled</b><small>{new Date(factory.inspection.scheduledAt).toLocaleString()}</small></span></div>}
    <div className="business-inspection-note"><Truck /><span><b>Seller pickup and carrier readiness</b><small>Review Delhivery and Shiprocket pickup registration.</small></span><Link className="button button--secondary" to="/seller/shipping-setup">Shipping setup</Link></div>
  </div>
}

function CompanySection({ seller, setSeller }) {
  return <Section title="Company information" description="Core legal and descriptive information used across your public profile and verification.">
    <div className="business-form-grid"><Field label="Company name" value={seller.companyName} onChange={(value) => set(seller, setSeller, 'companyName', value)} /><SelectField label="Business type" value={seller.companyType} onChange={(value) => set(seller, setSeller, 'companyType', value)} options={['manufacturer', 'wholesaler', 'distributor', 'trader', 'exporter', 'other']} /><Field label="Year established" type="number" value={seller.yearEstablished} onChange={(value) => set(seller, setSeller, 'yearEstablished', value)} /><SelectField label="Employees" value={seller.employeeCount} onChange={(value) => set(seller, setSeller, 'employeeCount', value)} options={['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+']} /><Field label="Website" value={seller.companyWebsite} onChange={(value) => set(seller, setSeller, 'companyWebsite', value)} /><ListField label="Languages" value={seller.languages} onChange={(value) => set(seller, setSeller, 'languages', value)} /><Field label="Company description" wide textarea value={seller.companyDescription} onChange={(value) => set(seller, setSeller, 'companyDescription', value)} /></div>
    <Subhead title="Business registration" />
    <div className="business-form-grid"><Field label="Registration number" value={seller.businessRegistrationNumber} onChange={(value) => set(seller, setSeller, 'businessRegistrationNumber', value)} /><Field label="GST / Tax ID" value={seller.gstNumber} onChange={(value) => set(seller, setSeller, 'gstNumber', value)} /><Field label="PAN number" value={seller.panNumber} onChange={(value) => set(seller, setSeller, 'panNumber', value)} /><Field label="Import Export Code" value={seller.importExportCode} onChange={(value) => set(seller, setSeller, 'importExportCode', value)} /></div>
  </Section>
}

function ProductsSection({ seller, setSeller, productCount, categories }) {
  const toggleCategory = (category) => {
    const selected = seller.productCategories.includes(category.name)
    const removedSubcategories = new Set((category.subcategories || []).map((item) => item.name))
    setSeller({
      ...seller,
      productCategories: selected ? seller.productCategories.filter((item) => item !== category.name) : [...seller.productCategories, category.name],
      productSubcategories: selected ? seller.productSubcategories.filter((item) => !removedSubcategories.has(item)) : seller.productSubcategories,
    })
  }
  const toggleSubcategory = (subcategory) => setSeller({ ...seller, productSubcategories: seller.productSubcategories.includes(subcategory.name) ? seller.productSubcategories.filter((item) => item !== subcategory.name) : [...seller.productSubcategories, subcategory.name] })
  return <Section title="Products, categories & industries" description="These selections influence marketplace ranking, related products, RFQ matching, and Manufacturer categories." action={<Link to="/seller/products">Manage {productCount} live products <ExternalLink /></Link>}>
    <div className="business-taxonomy-picker">{categories.map((category) => { const active = seller.productCategories.includes(category.name); return <article className={active ? 'active' : ''} key={category._id || category.slug}><label><input type="checkbox" checked={active} onChange={() => toggleCategory(category)} /><b>{category.name}</b></label>{active && <div>{(category.subcategories || []).map((subcategory) => <label key={subcategory._id || subcategory.slug}><input type="checkbox" checked={seller.productSubcategories.includes(subcategory.name)} onChange={() => toggleSubcategory(subcategory)} /><span>{subcategory.name}</span></label>)}</div>}</article> })}</div>
    <div className="business-form-grid"><ListField label="Industries served" value={seller.industries} onChange={(value) => set(seller, setSeller, 'industries', value)} /><ListField label="Main products" value={seller.mainProducts} onChange={(value) => set(seller, setSeller, 'mainProducts', value)} /></div>
    <p className="business-field-note">Select one or more marketplace categories and their valid subcategories. These exact selections control public RFQ matching.</p>
  </Section>
}

function TradeSection({ seller, setSeller }) {
  const trade = seller.tradeCapabilities
  return <Section title="Export & trade capabilities" description="Help buyers understand order flexibility, production lead times, fulfilment support, and market experience.">
    <div className="business-toggle-row">{[['oem', 'OEM service'], ['odm', 'ODM service'], ['privateLabel', 'Private label']].map(([key, label]) => <button type="button" className={trade[key] ? 'active' : ''} onClick={() => setSeller({ ...seller, tradeCapabilities: { ...trade, [key]: !trade[key] } })} key={key}>{trade[key] && <Check />}{label}</button>)}</div>
    <div className="business-form-grid"><Field label="Minimum order quantity" value={trade.minimumOrderQuantity} onChange={(value) => setSeller({ ...seller, tradeCapabilities: { ...trade, minimumOrderQuantity: value } })} /><Field label="Production lead time" value={trade.productionLeadTime} onChange={(value) => setSeller({ ...seller, tradeCapabilities: { ...trade, productionLeadTime: value } })} /><ListField label="Main export countries" value={seller.exportMarkets} onChange={(value) => set(seller, setSeller, 'exportMarkets', value)} /><ListField label="Main markets" value={seller.shippingInfo.exportCountries} onChange={(value) => setSeller({ ...seller, shippingInfo: { ...seller.shippingInfo, exportCountries: value } })} /><Field label="Origin port" value={seller.shippingInfo.originPort} onChange={(value) => setSeller({ ...seller, shippingInfo: { ...seller.shippingInfo, originPort: value } })} /><Field label="Handling time" value={seller.shippingInfo.handlingTime} onChange={(value) => setSeller({ ...seller, shippingInfo: { ...seller.shippingInfo, handlingTime: value } })} /><ListField label="Shipping support" value={seller.shippingInfo.shippingSupport} onChange={(value) => setSeller({ ...seller, shippingInfo: { ...seller.shippingInfo, shippingSupport: value } })} /><ListField label="Preferred carriers" value={seller.shippingInfo.preferredCarriers} onChange={(value) => setSeller({ ...seller, shippingInfo: { ...seller.shippingInfo, preferredCarriers: value } })} /><Field label="Quality assurance" wide textarea value={trade.qualityAssurance} onChange={(value) => setSeller({ ...seller, tradeCapabilities: { ...trade, qualityAssurance: value } })} /><Field label="R&D capabilities" wide textarea value={trade.rdCapability} onChange={(value) => setSeller({ ...seller, tradeCapabilities: { ...trade, rdCapability: value } })} /></div>
  </Section>
}

function FactorySection({ factory, setFactory }) {
  return <Section title="Factory information" description="Factory details are maintained here and rendered automatically on the public Manufacturer page.">
    <div className="business-form-grid"><Field label="Factory name" value={factory.name} onChange={(value) => set(factory, setFactory, 'name', value)} /><Field label="Factory area" value={factory.floorArea} onChange={(value) => set(factory, setFactory, 'floorArea', value)} /><Field label="Employees" type="number" value={factory.employeeCount} onChange={(value) => set(factory, setFactory, 'employeeCount', value)} /><Field label="Production lines" type="number" value={factory.productionLines} onChange={(value) => set(factory, setFactory, 'productionLines', value)} /><Field label="Monthly capacity" value={factory.monthlyCapacity} onChange={(value) => set(factory, setFactory, 'monthlyCapacity', value)} /><Field label="Annual capacity" value={factory.annualCapacity} onChange={(value) => set(factory, setFactory, 'annualCapacity', value)} /><ListField label="Machines & equipment" value={listValue(factory.machinery)} onChange={(value) => set(factory, setFactory, 'machinery', value.join(', '))} /><ListField label="Production capabilities" value={factory.capabilities} onChange={(value) => set(factory, setFactory, 'capabilities', value)} /><ListField label="Quality processes" value={factory.qualityProcesses} onChange={(value) => set(factory, setFactory, 'qualityProcesses', value)} /><ListField label="Factory export markets" value={factory.exportMarkets} onChange={(value) => set(factory, setFactory, 'exportMarkets', value)} /><Field label="Factory overview" wide textarea value={factory.description} onChange={(value) => set(factory, setFactory, 'description', value)} /><Field label="Quality control process" wide textarea value={factory.qualityControl} onChange={(value) => set(factory, setFactory, 'qualityControl', value)} /></div>
    <Subhead title="Factory address" />
    <AddressFields value={factory.address} onChange={(address) => setFactory({ ...factory, address })} />
  </Section>
}

function MediaSection({ seller, setSeller, factory, setFactory, busy, upload }) {
  return <Section title="Media library" description="Upload once and reuse media automatically across your Manufacturer page, supplier cards, and verification evidence.">
    <div className="business-media-groups">
      <MediaGroup title="Company logo" icon={Building2} values={seller.companyLogo ? [seller.companyLogo] : []} single upload={(event) => upload('companyLogo', event)} remove={() => setSeller({ ...seller, companyLogo: '' })} busy={busy} />
      <MediaGroup title="Company banner" icon={Image} values={seller.coverImage ? [seller.coverImage] : []} single upload={(event) => upload('coverImage', event)} remove={() => setSeller({ ...seller, coverImage: '' })} busy={busy} />
      <MediaGroup title="Company & office photos" icon={Image} values={seller.companyPhotos} upload={(event) => upload('companyPhotos', event)} remove={(url) => setSeller({ ...seller, companyPhotos: seller.companyPhotos.filter((item) => item !== url) })} busy={busy} />
      <MediaGroup title="Factory & production photos" icon={Factory} values={factory.images} upload={(event) => upload('factoryImages', event)} remove={(url) => setFactory({ ...factory, images: factory.images.filter((item) => item !== url) })} busy={busy} />
      <MediaGroup title="Company videos" icon={Video} values={seller.companyVideos} accept="video/*" upload={(event) => upload('companyVideos', event)} remove={(url) => setSeller({ ...seller, companyVideos: seller.companyVideos.filter((item) => item !== url) })} busy={busy} />
      <MediaGroup title="Factory videos" icon={Video} values={factory.videos} accept="video/*" upload={(event) => upload('factoryVideos', event)} remove={(url) => setFactory({ ...factory, videos: factory.videos.filter((item) => item !== url) })} busy={busy} />
      <MediaGroup title="Brochures" icon={FileText} values={seller.brochures} accept=".pdf,.doc,.docx" upload={(event) => upload('brochures', event)} remove={(url) => setSeller({ ...seller, brochures: seller.brochures.filter((item) => item !== url) })} busy={busy} />
    </div>
  </Section>
}

function VerificationSection({ data, seller, setSeller, docs, busy, upload, remove, submit, startDigiLocker, chooseManual }) {
  const status = data?.verification?.status || 'draft'
  const method = data?.verification?.verificationMethod || 'manual'
  const digiLocker = data?.verificationOptions?.digilocker || {}
  const automated = data?.verification?.digilocker || {}
  const feedback = data?.verification?.sellerFeedback || data?.verification?.rejectionReason || data?.verification?.informationRequests?.at(-1)?.message
  return <Section title="Trust & verification" description="Verification validates the Business Profile. It does not create a separate public data record.">
    <div className="verification-method-heading"><span>Complete business verification</span><h3>Choose how you want to verify your business</h3><p>Both methods use the same application, status history, admin review, and verified seller badge.</p></div>
    <div className="verification-method-grid">
      <article className={method === 'digilocker' ? 'active' : ''}><i><LockKeyhole /></i><div><span>Automatic verification</span><h3>Verify with DigiLocker</h3><p>Connect securely and share only eligible government-issued documents with your consent.</p><small>{digiLocker.configured ? `${digiLocker.documents?.length || 0} authorized document type(s) enabled` : 'Temporarily unavailable in this environment'}</small></div><button className="button button--primary" disabled={busy || !digiLocker.configured} onClick={startDigiLocker}>{method === 'digilocker' ? 'Reconnect DigiLocker' : 'Verify with DigiLocker'}</button></article>
      <article className={method === 'manual' ? 'active' : ''}><i><FileCheck2 /></i><div><span>Upload documents</span><h3>Manual verification</h3><p>Continue with the existing document upload and administrator review workflow.</p><small>Always available</small></div><button className="button button--secondary" disabled={busy} onClick={chooseManual}>{method === 'manual' ? 'Manual selected' : 'Continue manually'}</button></article>
    </div>
    {!digiLocker.configured && <div className="digilocker-fallback"><CircleAlert /><span><b>DigiLocker verification is temporarily unavailable.</b><small>You can continue with manual verification without losing any existing documents or history.</small></span><button className="button button--secondary" disabled={busy} onClick={chooseManual}>Continue with manual verification</button></div>}
    <div className="business-verification-status"><ShieldCheck /><span><small>Application status</small><b>{formatStatus(status)}</b><p>Trust score {data?.verificationCenter?.overallTrustScore || 0}/100 · Level {data?.verificationCenter?.verificationLevel || 0}</p></span><button className="button button--primary" disabled={busy || ['submitted', 'under_review', 'approved'].includes(status)} onClick={submit}>Submit for review</button></div>
    {automated.documents?.length > 0 && <div className="digilocker-results"><header><LockKeyhole /><div><span>Verification method</span><h3>DigiLocker</h3><p>Automatically processed documents. Final approval remains in the existing admin workflow.</p></div></header><div>{automated.documents.map((document) => <article key={`${document.doctype}-${document.providerReferenceHash}`}><FileCheck2 /><span><b>{document.label || formatStatus(document.type)}</b><small>{document.issuer || 'Government issuer'} · {formatStatus(document.category)}</small></span><strong>{formatStatus(document.status)}</strong></article>)}</div>{automated.matches?.length > 0 && <section><h4>Profile matching</h4>{automated.matches.map((item, index) => <span className={`match-${item.status}`} key={`${item.field}-${item.documentType}-${index}`}><b>{formatStatus(item.field)}</b><small>{formatStatus(item.status)}</small></span>)}</section>}</div>}
    {feedback && <div className="business-verification-feedback"><FileText /><div><b>Admin feedback</b><p>{feedback}</p><small>Update the requested information or replace rejected documents, then submit the same verification again.</small></div></div>}
    <div className="business-certification-editor"><ListField label="Company certifications" value={seller.certifications} onChange={(values) => setSeller({ ...seller, certifications: values.map((name) => ({ name, status: seller.certifications.find((item) => (item.name || item) === name)?.status || 'unverified' })) })} /><p>Add ISO, CE, BIS, GST, IEC, MSME, RoHS, FSSAI, or other credentials. Upload supporting evidence below for verification.</p></div>
    <div className="business-document-grid">{documentTypes.map(([type, label]) => { const item = [...docs].reverse().find((document) => document.type === type); return <article key={type}><i className={item ? `status-${item.status}` : ''}><FileCheck2 /></i><span><b>{label}</b><small>{item ? formatStatus(item.status) : 'PDF, JPG or PNG · max 5 MB'}</small></span>{item ? <><a href={item.downloadUrl || item.url} target="_blank" rel="noreferrer">View</a><button onClick={() => remove(item._id)}>Remove</button></> : <label><Upload /> Upload<input hidden type="file" disabled={busy} accept=".pdf,.png,.jpg,.jpeg" onChange={(event) => upload(type, event.target.files?.[0])} /></label>}</article> })}</div>
  </Section>
}

function ContactsSection({ seller, setSeller }) {
  const contacts = seller.teamContacts.length ? seller.teamContacts : [{ name: '', designation: '', email: '', phone: '' }]
  return <Section title="Team, contacts & location" description="Publish the right business contact points while keeping account identity separate.">
    <div className="business-form-grid"><Field label="Business email" type="email" value={seller.businessEmail} onChange={(value) => set(seller, setSeller, 'businessEmail', value)} /><Field label="Business phone" value={seller.businessPhone} onChange={(value) => set(seller, setSeller, 'businessPhone', value)} /></div>
    <Subhead title="Office address" /><AddressFields value={seller.address} onChange={(address) => setSeller({ ...seller, address })} />
    <Subhead title="Team contacts" action={<button type="button" onClick={() => setSeller({ ...seller, teamContacts: [...contacts, { name: '', designation: '', email: '', phone: '' }] })}>Add contact</button>} />
    <div className="business-team-list">{contacts.map((contact, index) => <article key={index}><div className="business-form-grid"><Field label="Name" value={contact.name} onChange={(value) => updateContact(seller, setSeller, contacts, index, 'name', value)} /><Field label="Designation" value={contact.designation} onChange={(value) => updateContact(seller, setSeller, contacts, index, 'designation', value)} /><Field label="Email" type="email" value={contact.email} onChange={(value) => updateContact(seller, setSeller, contacts, index, 'email', value)} /><Field label="Phone" value={contact.phone} onChange={(value) => updateContact(seller, setSeller, contacts, index, 'phone', value)} /></div>{contacts.length > 1 && <button type="button" onClick={() => setSeller({ ...seller, teamContacts: contacts.filter((_, itemIndex) => itemIndex !== index) })}><X /> Remove</button>}</article>)}</div>
    <Subhead title="Social links" /><div className="business-form-grid">{['linkedin', 'facebook', 'instagram', 'youtube'].map((key) => <Field label={formatStatus(key)} value={seller.socialLinks[key]} onChange={(value) => setSeller({ ...seller, socialLinks: { ...seller.socialLinks, [key]: value } })} key={key} />)}</div>
  </Section>
}

function Section({ title, description, action, children }) { return <div className="business-profile-section"><header><div><span>Business Profile</span><h2>{title}</h2><p>{description}</p></div>{action}</header>{children}</div> }
function Subhead({ title, action }) { return <div className="business-subhead"><h3>{title}</h3>{action}</div> }
function Field({ label, value, onChange, type = 'text', textarea = false, wide = false }) { return <label className={wide ? 'wide' : ''}><span>{label}</span>{textarea ? <textarea value={value || ''} onChange={(event) => onChange(event.target.value)} /> : <input type={type} value={value ?? ''} onChange={(event) => onChange(event.target.value)} />}</label> }
function SelectField({ label, value, onChange, options }) { return <label><span>{label}</span><select value={value || ''} onChange={(event) => onChange(event.target.value)}><option value="">Select</option>{options.map((item) => <option value={item} key={item}>{formatStatus(item)}</option>)}</select></label> }
function ListField({ label, value, onChange }) {
  const serialized = listValue(value).join(', ')
  const [draft, setDraft] = useState(serialized)
  useEffect(() => setDraft(serialized), [serialized])
  return <label><span>{label}</span><input value={draft} placeholder="Separate multiple values with commas" onChange={(event) => setDraft(event.target.value)} onBlur={() => onChange(split(draft))} /></label>
}
function AddressFields({ value, onChange }) { return <div className="business-form-grid"><label className="wide"><span>Find address</span><AddressAutocomplete value={value?.street || ''} onChange={street => onChange({ ...value, street })} onSelect={location => onChange({ ...value, street: location.line1 || location.formattedAddress, district: location.district, city: location.city, state: location.state, country: location.country, pincode: location.postalCode, countryCode: location.countryCode, placeId: location.placeId, latitude: location.latitude, longitude: location.longitude })} /></label>{['district', 'city', 'state', 'country', 'pincode'].map((key) => <Field label={formatStatus(key)} value={value?.[key]} onChange={(next) => onChange({ ...value, [key]: next })} key={key} />)}</div> }
function TrustState({ label, status }) { const verified = ['verified', 'approved'].includes(String(status).toLowerCase()); return <span className={verified ? 'verified' : ''}>{verified ? <Check /> : <Clock3 />}<small>{label}</small><b>{verified ? 'Verified' : formatStatus(status)}</b></span> }

function MediaGroup({ title, icon: Icon, values = [], upload, remove, busy, single, accept = 'image/*' }) {
  return <article className="business-media-group"><header><Icon /><span><b>{title}</b><small>{single ? 'One active asset' : `${values.length} uploaded`}</small></span><label><Upload /> Upload<input hidden type="file" multiple={!single} accept={accept} disabled={busy} onChange={upload} /></label></header><div>{values.length ? values.map((url) => <figure key={url}>{accept.startsWith('image') ? <SafeImage src={url} alt="" /> : <FileText />}<button onClick={() => remove(url)} aria-label={`Remove ${title}`}><X /></button></figure>) : <p>No media uploaded yet.</p>}</div></article>
}

function normalizeSeller(value = {}) {
  return {
    ...emptySeller, ...value,
    address: { ...emptySeller.address, ...(value.address || {}) },
    shippingInfo: { ...emptySeller.shippingInfo, ...(value.shippingInfo || {}) },
    tradeCapabilities: { ...emptySeller.tradeCapabilities, ...(value.tradeCapabilities || {}) },
    socialLinks: { ...emptySeller.socialLinks, ...(value.socialLinks || {}) },
    companyPhotos: listValue(value.companyPhotos), companyVideos: listValue(value.companyVideos), brochures: listValue(value.brochures),
    languages: listValue(value.languages), productCategories: listValue(value.productCategories), productSubcategories: listValue(value.productSubcategories),
    industries: listValue(value.industries), mainProducts: listValue(value.mainProducts), exportMarkets: listValue(value.exportMarkets),
    certifications: Array.isArray(value.certifications) ? value.certifications : [], teamContacts: Array.isArray(value.teamContacts) ? value.teamContacts : [],
  }
}
function normalizeFactory(value = {}) { return { ...emptyFactory, ...(value || {}), address: { ...emptyFactory.address, ...(value?.address || {}) }, capabilities: listValue(value?.capabilities), qualityProcesses: listValue(value?.qualityProcesses), exportMarkets: listValue(value?.exportMarkets), images: listValue(value?.images), videos: listValue(value?.videos), certifications: Array.isArray(value?.certifications) ? value.certifications : [], machinery: Array.isArray(value?.machinery) ? value.machinery.map((item) => item.name).filter(Boolean).join(', ') : value?.machinery || '' } }
function sellerPayload(value, data, submitForReview) {
  const cleanContacts = value.teamContacts.filter((item) => Object.values(item).some(Boolean))
  return { ...value, companyType: value.companyType || undefined, employeeCount: value.employeeCount || undefined, yearEstablished: Number(value.yearEstablished) || undefined, teamContacts: cleanContacts, certifications: value.certifications.map((item) => typeof item === 'string' ? { name: item, status: 'unverified' } : item), verificationCenter: { currentStep: data?.verification?.currentStep || 0, completedSteps: data?.verification?.completedSteps || [], stepData: data?.verification?.stepData || {}, submitForReview } }
}
function factoryPayload(value) { return { ...value, employeeCount: Number(value.employeeCount) || 0, productionLines: Number(value.productionLines) || 0, machinery: typeof value.machinery === 'string' ? value.machinery : listValue(value.machinery).join(', ') } }
function profileProgress(seller, factory, docs) {
  const checks = {
    company: Boolean(seller.companyName && seller.companyType && seller.companyDescription && seller.yearEstablished),
    products: Boolean(seller.productCategories.length && seller.mainProducts.length),
    trade: Boolean(seller.exportMarkets.length && seller.tradeCapabilities.minimumOrderQuantity && seller.tradeCapabilities.productionLeadTime),
    factory: Boolean(factory.name && factory.description && factory.monthlyCapacity),
    media: Boolean(seller.companyLogo && seller.coverImage && (seller.companyPhotos.length || factory.images.length)),
    verification: Boolean(docs.length),
    contacts: Boolean(seller.businessEmail && seller.businessPhone && seller.address.city && seller.address.country),
  }
  const missing = Object.entries(checks).filter(([, complete]) => !complete).map(([key]) => sectionLabel(key))
  return { sections: checks, missing, percent: Math.round(Object.values(checks).filter(Boolean).length / Object.keys(checks).length * 100) }
}
function verificationState(data, types) { const docs = data?.verification?.documents || []; const matching = docs.filter((item) => types.includes(item.type)); return matching.some((item) => ['verified', 'approved'].includes(item.status)) ? 'verified' : matching.length ? 'pending' : 'missing' }
function updateContact(seller, setSeller, contacts, index, key, value) { setSeller({ ...seller, teamContacts: contacts.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item) }) }
function set(source, setter, key, value) { setter({ ...source, [key]: value }) }
function split(value) { return unique(String(value || '').split(',').map((item) => item.trim()).filter(Boolean)) }
function listValue(value) { if (!value) return []; if (Array.isArray(value)) return value.map((item) => typeof item === 'string' ? item : item?.name).filter(Boolean); return split(value) }
function unique(value) { return [...new Set(value.filter(Boolean))] }
function sectionLabel(key) { return sections.find(([value]) => value === key)?.[1] || formatStatus(key) }
function formatStatus(value) { return String(value || 'not started').replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase()) }
