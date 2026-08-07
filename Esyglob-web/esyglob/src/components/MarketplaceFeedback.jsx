import { AlertCircle, RefreshCw } from 'lucide-react'

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
