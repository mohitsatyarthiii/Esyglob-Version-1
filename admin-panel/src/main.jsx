import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import ConfigurationError from './components/ConfigurationError.jsx'
import { validateEnvironment } from './config/environment.js'
import { AuthProvider } from './context/AuthContext.jsx'
import './index.css'

const configuration = validateEnvironment()
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => failureCount < 2 && (!error?.status || error.status === 408 || error.status === 429 || error.status >= 500),
      retryDelay: (attempt) => Math.min(1_000 * (2 ** attempt), 4_000),
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {configuration.error
      ? <ConfigurationError message={configuration.error.message} />
      : <BrowserRouter>
          <QueryClientProvider client={queryClient}>
            <AuthProvider><App /></AuthProvider>
          </QueryClientProvider>
        </BrowserRouter>}
  </StrictMode>,
)
