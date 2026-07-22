import { Component } from 'react'
import { House, RefreshCw, TriangleAlert } from 'lucide-react'

export default class AppErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) { return { error } }

  componentDidCatch(error, info) {
    console.error('Application render failure:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return <main className="app-failure" role="alert"><TriangleAlert /><h1>This page could not load</h1><p>Your data is safe. Retry the page, or return to the marketplace.</p><small>{this.state.error?.message || 'Unexpected application error'}</small><div><button type="button" onClick={() => window.location.reload()}><RefreshCw /> Retry page</button><a href="/home"><House /> Go to home</a></div></main>
  }
}
