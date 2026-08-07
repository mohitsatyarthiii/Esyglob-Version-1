import { Bot, Calculator, Camera, Grid2X2, Search, ShieldCheck, Store, Target } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/auth-context'
import AppShell from '../components/AppShell'
import { PageHead } from '../components/PageHead'

const actions = [
  { icon: Search, title: 'Marketplace search', text: 'Search products, suppliers and categories.', href: '/search' },
  { icon: Grid2X2, title: 'Explore categories', text: 'Browse industries and live subcategories.', href: '/categories' },
  { icon: Store, title: 'Verified manufacturers', text: 'Compare trusted supplier profiles.', href: '/sellers' },
  { icon: Camera, title: 'AI image search', text: 'Find visually similar marketplace products.', href: '/explore/image-search', auth: true },
  { icon: Target, title: 'Create an RFQ', text: 'Send structured buying requirements.', href: '/rfqs/new', auth: true },
  { icon: Calculator, title: 'Trade calculator', text: 'Estimate landed cost, duty, freight, profit and more.', href: '/services/calculator' },
]
export default function ExplorePage() {
  const { status } = useAuth()
  return <AppShell><div className="listing-page container"><PageHead eyebrow="Discover EsyGlob" title="Explore" description="The same mobile-app discovery flow, expanded for the browser." /><div className="explore-grid">{actions.map(({ icon: Icon, title, text, href, auth }) => <Link key={title} to={auth && status !== 'authenticated' ? '/login' : href} state={auth ? { from: href } : undefined}><i><Icon /></i><div><h2>{title}</h2><p>{text}</p></div></Link>)}</div><section className="explore-ai"><Bot /><div><span className="eyebrow">AI-assisted sourcing</span><h2>Start with a product image or a marketplace search.</h2><p>AI features use your EsyGlob account and the existing backend search implementation.</p></div><ShieldCheck /></section></div></AppShell>
}
