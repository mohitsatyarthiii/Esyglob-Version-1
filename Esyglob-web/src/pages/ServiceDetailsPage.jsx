import { ArrowLeft, ArrowRight, BadgeCheck, CheckCircle2, Clock3, FileText, ShieldCheck, Sparkles } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { getService, isServiceAvailable } from '../api/services'
import { useAuth } from '../auth/auth-context'
import AppShell from '../components/AppShell'
import { PageHead } from '../components/PageHead'
import { ServiceBenefits, ServiceTrustGrid } from '../components/ServiceTrust'
import TrustedPartners from '../components/TrustedPartners'
import { Money } from '../components/TradeUI'

export default function ServiceDetailsPage() {
  const { serviceKey } = useParams(); const service = getService(serviceKey); const { status } = useAuth()
  if (!service) return <AppShell><div className="container module-page"><div className="empty-results"><FileText /><h1>Service not found</h1><Link to="/services">Browse services</Link></div></div></AppShell>
  const bookingPath = status === 'authenticated' ? `/services/${service.key}/book` : '/login'
  const available = isServiceAvailable(service)
  return <AppShell><div className={`container service-detail-page service-accent service-accent--${service.key}`}>
    <PageHead title={`${service.title} | EsyGlob Trade Services`} description={service.description} />
    <Link className="back-link" to="/services"><ArrowLeft /> All services</Link>
    <section className="service-detail-hero">
      <div className="service-detail-hero__copy">
        <span className="eyebrow"><Sparkles /> {service.category} service</span>
        <h1>{service.title}</h1>
        <p>{service.description}</p>
        <div className="service-trust"><span><ShieldCheck /> Secure workflow</span><span><Clock3 /> Live status tracking</span><span><BadgeCheck /> Verified operations</span></div>
        <div className="service-detail-actions">{available ? <Link className="button button--primary" to={bookingPath} state={status === 'authenticated' ? undefined : { from: `/services/${service.key}/book` }}>{service.key === 'shipping' ? 'View live rates' : 'Book this service'} <ArrowRight /></Link> : <button className="button button--coming-soon" type="button" disabled>Coming Soon — We'll notify you when available</button>}<Link className="button button--secondary" to="/services/requests">Booking history</Link></div>
      </div>
      <aside className="service-detail-quote">
        <span className="service-detail-quote__badge"><ShieldCheck /> EsyGlob assured workflow</span>
        <small>Starting price</small>
        <b>{service.startingPriceAmount !== null ? <><span>From </span><Money value={service.startingPriceAmount} currency={service.startingPriceCurrency} /></> : service.startingPrice}</b>
        <p>A detailed GST-inclusive quote is calculated from your booking requirements before submission.</p>
        <div><span><strong>Account-only</strong><small>Secure documents</small></span><span><strong>Live</strong><small>Request tracking</small></span><span><strong>End-to-end</strong><small>Operations support</small></span></div>
      </aside>
    </section>

    <TrustedPartners
      serviceKey={service.key}
      title={service.category === 'Inspection' ? 'Trusted Inspection Partners' : 'Supported Providers'}
      description="Logos shown are loaded from EsyGlob's local partner asset library."
    />

    <section className="service-detail-section">
      <header><span>Built for dependable trade</span><h2>Professional service, clearly coordinated</h2><p>Every request follows a structured path designed to reduce uncertainty and keep your team informed.</p></header>
      <ServiceBenefits category={service.category} />
    </section>

    <div className="service-detail-grid">
      <section className="module-panel service-process-panel"><div className="service-panel-heading"><span>Simple process</span><h2>How it works</h2></div>{service.steps.map((step, index) => <article className="service-step" key={step}><i>{String(index + 1).padStart(2, '0')}</i><div><b>{step}</b><p>Your information is securely attached to the service request and visible in its timeline.</p></div></article>)}</section>
      <section className="module-panel service-requirements-panel"><div className="service-panel-heading"><span>Prepared upfront</span><h2>Information required</h2></div><ul className="service-checklist">{service.fields.filter((item) => item.required).map((item) => <li key={item.key}><CheckCircle2 /> {item.label}</li>)}</ul><p className="privacy-note"><ShieldCheck /> Commercial details and documents remain account-protected.</p></section>
    </div>

    <section className="service-detail-section service-detail-trust-section"><header><span>Trade with confidence</span><h2>Trust is built into the workflow</h2></header><ServiceTrustGrid /></section>

    <section className="service-detail-final-cta"><div><span><BadgeCheck /> Professional trade support</span><h2>{available ? 'Ready to move this requirement forward?' : 'This service is coming soon'}</h2><p>{available ? 'Start a secure request and keep every commercial detail, update and milestone in one place.' : 'We are preparing a dependable partner workflow before opening requests.'}</p></div>{available ? <Link className="button button--primary" to={bookingPath} state={status === 'authenticated' ? undefined : { from: `/services/${service.key}/book` }}>Start service request <ArrowRight /></Link> : <button className="button button--coming-soon" type="button" disabled>Coming Soon</button>}</section>
  </div></AppShell>
}
