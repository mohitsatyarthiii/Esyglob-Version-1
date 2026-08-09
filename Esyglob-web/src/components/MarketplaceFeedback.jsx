import { AlertCircle, ArrowRight, PackageOpen, RefreshCw, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

export function MarketplaceError({ error, onRetry, title = 'We could not load this marketplace section.' }) {
  return <div className="marketplace-feedback" role="alert">
    <i><AlertCircle /></i>
    <div>
      <h3>{title}</h3>
      <p>{error?.message || 'Check your connection and try again.'}</p>
    </div>
    {onRetry && <button type="button" onClick={onRetry}><RefreshCw /> Try again</button>}
  </div>
}

export function MarketplaceEmpty({ filtered = false, onReset, title = 'Products are coming soon', description = "We're currently adding products and verified suppliers to this category." }) {
  if (filtered) return <div className="marketplace-empty" role="status">
    <i><PackageOpen /></i>
    <span>Nothing matched</span>
    <h2>Try a broader search</h2>
    <p>Adjust or clear your filters to see more marketplace products.</p>
    {onReset && <button type="button" className="button button--secondary" onClick={onReset}><RefreshCw /> Clear filters</button>}
  </div>
  return <div className="marketplace-empty marketplace-empty--soon" role="status">
    <i><Sparkles /></i>
    <span>Coming Soon</span>
    <h2>{title}</h2>
    <p>{description} Check back soon for new products and suppliers.</p>
    <Link className="button button--primary" to="/categories">Explore other categories <ArrowRight /></Link>
  </div>
}
