import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import CurrencyProvider from './preferences/CurrencyProvider'
import './index.css'
import App from './App'
import AppErrorBoundary from './components/AppErrorBoundary'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AppErrorBoundary>
        <AuthProvider>
          <CurrencyProvider><App /></CurrencyProvider>
        </AuthProvider>
      </AppErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
)
