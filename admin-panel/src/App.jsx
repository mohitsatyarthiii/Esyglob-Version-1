import { Navigate, Route, Routes } from 'react-router-dom'
import AdminLayout from './components/AdminLayout'
import { useAuth } from './context/AuthContext'
import DashboardPage from './pages/DashboardPage'
import AdminSettingsPage from './pages/AdminSettingsPage'
import LoginPage from './pages/LoginPage'
import ResourcePage from './pages/ResourcePage'
import './App.css'

function ProtectedAdmin() {
  const { status, user } = useAuth()
  if (status === 'checking') return <div className="admin-boot"><span /><p>Loading EsyGlob operations…</p></div>
  if (status !== 'authenticated') return <Navigate replace to="/login" />
  if (!user?.roles?.includes('admin')) return <main className="admin-denied"><h1>Admin access required</h1><p>This account does not have marketplace administration permissions.</p><a href="/login">Use another account</a></main>
  return <AdminLayout />
}

export default function App() {
  return <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route element={<ProtectedAdmin />}>
      <Route index element={<Navigate replace to="/dashboard" />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/users" element={<ResourcePage resource="users" />} />
      <Route path="/sellers" element={<ResourcePage resource="sellers" />} />
      <Route path="/verifications" element={<ResourcePage resource="verifications" />} />
      <Route path="/products" element={<ResourcePage resource="products" />} />
      <Route path="/categories" element={<ResourcePage resource="categories" />} />
      <Route path="/orders" element={<ResourcePage resource="orders" />} />
      <Route path="/payments" element={<ResourcePage resource="payments" />} />
      <Route path="/coupons" element={<ResourcePage resource="coupons" />} />
      <Route path="/gift-cards" element={<ResourcePage resource="gift-cards" />} />
      <Route path="/activities" element={<ResourcePage resource="activities" />} />
      <Route path="/settings" element={<AdminSettingsPage />} />
    </Route>
    <Route path="*" element={<Navigate replace to="/dashboard" />} />
  </Routes>
}
