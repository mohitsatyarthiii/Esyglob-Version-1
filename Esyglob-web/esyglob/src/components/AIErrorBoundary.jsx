import { Component } from 'react'
import { Bot, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'

export default class AIErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) { return { error } }

  componentDidCatch(error, info) {
    console.error('AI workspace render failure:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return <div className="ai-boundary-fallback" role="alert"><i><Bot /></i><h1>AI workspace could not load</h1><p>The rest of EsyGlob is still available. Retry the assistant or return to your account.</p><small>{this.state.error?.message || 'Unexpected rendering error'}</small><div><button onClick={() => this.setState({ error: null })}><RefreshCw /> Retry AI</button><Link to="/account">Return to account</Link></div></div>
  }
}
