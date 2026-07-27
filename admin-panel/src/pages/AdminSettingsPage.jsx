import { BellRing, LockKeyhole, Moon, ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const permissions = [
  ['Super administrator', 'Full operational access, role management and audit visibility.'],
  ['Verification administrator', 'Seller applications, documents, feedback and verification decisions.'],
  ['Operations administrator', 'Orders, fulfillment, products, categories and customer operations.'],
  ['Finance administrator', 'Payments, refunds, coupons, gift cards and financial exports.'],
  ['Content administrator', 'Product moderation, categories, catalog media and SEO metadata.'],
  ['Support administrator', 'User status, seller support, order notes and read-only payment visibility.'],
]

export default function AdminSettingsPage() {
  const { user } = useAuth()
  return <div className="resource-page settings-page">
    <header className="resource-heading">
      <div><span className="eyebrow">System</span><h1>Admin settings</h1><p>Workspace preferences and the access model used by EsyGlob operations.</p></div>
    </header>
    <div className="settings-grid">
      <section className="settings-panel">
        <header><ShieldCheck /><div><h2>Administrator profile</h2><p>Your authenticated operations identity.</p></div></header>
        <dl>
          <div><dt>Name</dt><dd>{user?.fullName || 'Administrator'}</dd></div>
          <div><dt>Email</dt><dd>{user?.email || '—'}</dd></div>
          <div><dt>Assigned roles</dt><dd>{user?.adminRoles?.join(', ') || 'Super administrator'}</dd></div>
        </dl>
      </section>
      <section className="settings-panel">
        <header><Moon /><div><h2>Appearance</h2><p>Use the theme control in the top navigation to switch instantly.</p></div></header>
        <p className="settings-copy">Your sidebar and theme preferences are retained on this device.</p>
      </section>
      <section className="settings-panel settings-panel--wide">
        <header><LockKeyhole /><div><h2>Role-based access model</h2><p>Backend permissions are enforced independently of the interface.</p></div></header>
        <div className="permission-list">{permissions.map(([role, description]) => <article key={role}><b>{role}</b><span>{description}</span></article>)}</div>
      </section>
      <section className="settings-panel">
        <header><BellRing /><div><h2>Operational alerts</h2><p>Sensitive actions are recorded in the activity log.</p></div></header>
        <p className="settings-copy">Use the bell in the top navigation to open the searchable audit activity stream.</p>
      </section>
    </div>
  </div>
}
