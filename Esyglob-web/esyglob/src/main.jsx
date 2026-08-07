import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import CurrencyProvider from './preferences/CurrencyProvider'
import './index.css'
import App from './App'
import AppErrorBoundary from './components/AppErrorBoundary'
import { ConfirmProvider, GlobalFormUX, NavigationUX, ToastProvider } from './components/EnterpriseUX'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <ConfirmProvider>
          <AppErrorBoundary>
            <AuthProvider>
              <CurrencyProvider><GlobalFormUX /><NavigationUX /><App /></CurrencyProvider>
            </AuthProvider>
          </AppErrorBoundary>
        </ConfirmProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
)
