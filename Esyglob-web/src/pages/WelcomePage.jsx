import { ArrowRight, BadgeCheck, Globe2, Search, ShieldCheck, Sparkles } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/auth-context'
import Brand from '../components/Brand'

export default function WelcomePage() {
  const navigate = useNavigate()
  const { status } = useAuth()
  if (status === 'authenticated') return <Navigate replace to="/home" />

  return (
    <main className="welcome-page">
      <div className="welcome-nav"><Brand /><button onClick={() => navigate('/login')}>Sign in</button></div>
      <div className="welcome-grid">
        <section className="welcome-copy">
          <span className="welcome-kicker"><Sparkles /> The smarter way to source globally</span>
          <h1>Global trade.<br /><em>Made simple.</em></h1>
          <p>Discover verified manufacturers, compare quality products and manage every sourcing conversation in one secure marketplace.</p>
          <div className="welcome-actions"><button className="button button--primary" onClick={() => navigate('/signup')}>Create free account <ArrowRight /></button><button className="button button--ghost" onClick={() => navigate('/login')}>I already have an account</button></div>
          <div className="welcome-trust"><span><ShieldCheck /> Secure sourcing</span><span><BadgeCheck /> Verified businesses</span><span><Globe2 /> Global marketplace</span></div>
        </section>
        <section className="welcome-visual" aria-label="Marketplace preview">
          <div className="visual-glow" />
          <div className="market-window">
            <div className="market-window__top"><i /><i /><i /><span>esyglob.in</span></div>
            <div className="market-window__body">
              <div className="preview-heading"><span><small>Welcome to EsyGlob</small><b>What are you sourcing today?</b></span><div className="preview-avatar">E</div></div>
              <div className="preview-search"><Search /><span>Search products and suppliers</span></div>
              <div className="preview-stats"><span><b>Verified</b><small>suppliers</small></span><span><b>35+</b><small>categories</small></span><span><b>Secure</b><small>trade</small></span></div>
              <div className="preview-cards"><span /><span /><span /></div>
            </div>
          </div>
          <div className="float-card float-card--verified"><BadgeCheck /><span><b>Verified supplier</b><small>Trust score 92/100</small></span></div>
          <div className="float-card float-card--ai"><Sparkles /><span><b>EsyAI search</b><small>Your trade copilot</small></span></div>
        </section>
      </div>
      <div className="welcome-footer"><span>© {new Date().getFullYear()} EsyGlob</span><span>Built for global businesses</span></div>
    </main>
  )
}
