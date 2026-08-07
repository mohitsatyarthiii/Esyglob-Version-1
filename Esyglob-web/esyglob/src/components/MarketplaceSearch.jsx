import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import UnifiedSearchInput from './UnifiedSearchInput'

export default function MarketplaceSearch({ className = '' }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  function submitSearch(value) {
    navigate(value ? `/search?q=${encodeURIComponent(value)}` : '/search')
  }

  return <UnifiedSearchInput
    className={`header-search ${className}`.trim()}
    value={query}
    onChange={setQuery}
    onSubmit={submitSearch}
    placeholder="Search products, manufacturers, services and categories"
    ariaLabel="Search marketplace"
    showSubmit
  />
}
