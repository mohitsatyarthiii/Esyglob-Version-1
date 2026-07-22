import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './auth-context'
import SplashScreen from '../pages/SplashScreen'

export default function ProtectedRoute() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'checking') return <SplashScreen compact />
  if (status !== 'authenticated') return <Navigate replace state={{ from: location.pathname }} to="/login" />
  return <Outlet />
}
