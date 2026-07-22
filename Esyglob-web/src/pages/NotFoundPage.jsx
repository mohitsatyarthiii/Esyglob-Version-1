import { ArrowLeft, Compass } from 'lucide-react'
import { Link } from 'react-router-dom'
import Brand from '../components/Brand'

export default function NotFoundPage() {
  return <main className="not-found"><Brand /><Compass /><span className="eyebrow">404 · Route not found</span><h1>This trade route ends here.</h1><p>Return to the marketplace and continue sourcing.</p><Link className="button button--primary" to="/"><ArrowLeft /> Go to EsyGlob</Link></main>
}
