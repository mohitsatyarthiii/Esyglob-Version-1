import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import CurrencyProvider from './preferences/CurrencyProvider'
import './index.css'
import App from './App'
import AppErrorBoundary from './components/AppErrorBoundary'
import { ConfirmProvider, GlobalFormUX, NavigationUX, ToastProvider } from './components/EnterpriseUX'
import I18nProvider from './i18n/I18nProvider'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <ConfirmProvider>
          <AppErrorBoundary>
            <AuthProvider><I18nProvider>
              <CurrencyProvider><GlobalFormUX /><NavigationUX /><App /></CurrencyProvider>
            </I18nProvider></AuthProvider>
          </AppErrorBoundary>
        </ConfirmProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
)
