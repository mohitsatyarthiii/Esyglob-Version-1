import { Search } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function MarketplaceSearch({ className = '' }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  function submitSearch(event) {
    event.preventDefault()
    const value = query.trim()
    navigate(value ? `/search?q=${encodeURIComponent(value)}` : '/search')
  }

  return <form className={`header-search ${className}`.trim()} onSubmit={submitSearch} role="search">
    <Search />
    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products, suppliers and categories" aria-label="Search marketplace" />
    <button>Search</button>
  </form>
}
