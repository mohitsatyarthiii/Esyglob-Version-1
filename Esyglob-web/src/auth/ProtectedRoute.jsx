import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './auth-context'
import SplashScreen from '../pages/SplashScreen'

export default function ProtectedRoute() {
  const { status, error, refresh } = useAuth()
  const location = useLocation()
  if (status === 'checking') return <SplashScreen compact />
  if (status === 'error') return <main className="auth-restore-error" role="alert"><h1>We could not restore your session</h1><p>{error?.message || 'EsyGlob could not reach the server.'}</p><button type="button" onClick={() => refresh().catch(() => {})}>Retry</button></main>
  if (status !== 'authenticated') return <Navigate replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} to="/login" />
  return <Outlet />
}
