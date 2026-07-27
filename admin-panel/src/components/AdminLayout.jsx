import {
  Bell, ChevronDown, Command, LayoutDashboard, Menu, Moon, PanelLeftClose, Search, Settings, X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { navGroups, resources } from '../config/resources'

const icons = Object.fromEntries(Object.values(resources).map((value) => [value.title, value.icon]))

export default function AdminLayout() {
  const { user, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('admin-sidebar') === 'collapsed')
  const [mobile, setMobile] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [dark, setDark] = useState(() => localStorage.getItem('admin-theme') === 'dark')
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; localStorage.setItem('admin-theme', dark ? 'dark' : 'light') }, [dark])
  useEffect(() => {
    const shortcut = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); setCommandOpen((value) => !value)
      }
    }
    document.addEventListener('keydown', shortcut)
    return () => document.removeEventListener('keydown', shortcut)
  }, [])
  const pageTitle = useMemo(() => navGroups.flatMap(([, links]) => links).find(([, path]) => path === location.pathname)?.[0] || 'Admin', [location.pathname])
  const toggle = () => setCollapsed((value) => { localStorage.setItem('admin-sidebar', value ? 'expanded' : 'collapsed'); return !value })
  return <div className={`admin-app${collapsed ? ' is-collapsed' : ''}${mobile ? ' mobile-open' : ''}`}>
    <aside className="admin-sidebar">
      <header><div className="admin-brand"><i>E</i><span><b>EsyGlob</b><small>Admin</small></span></div><button onClick={toggle} aria-label="Collapse sidebar"><PanelLeftClose /></button></header>
      <nav>{navGroups.map(([group, links]) => <section key={group}><small>{group}</small>{links.map(([label, to]) => {
        const Icon = label === 'Dashboard' ? LayoutDashboard : icons[label]
        return <NavLink key={to} to={to} title={label} onClick={() => setMobile(false)}><Icon /><span>{label}</span></NavLink>
      })}</section>)}</nav>
      <footer><NavLink to="/settings"><Settings /><span>Settings</span></NavLink><button onClick={signOut}><span className="admin-avatar">{String(user?.fullName || user?.email || 'A').slice(0, 1)}</span><span><b>{user?.fullName || 'Administrator'}</b><small>{user?.email}</small></span><ChevronDown /></button></footer>
    </aside>
    <button className="admin-mobile-backdrop" onClick={() => setMobile(false)} aria-label="Close navigation" />
    <div className="admin-workspace">
      <header className="admin-topbar"><button className="mobile-menu" onClick={() => setMobile(true)}><Menu /></button><div className="breadcrumbs"><span>Admin</span><b>/</b><strong>{pageTitle}</strong></div><button className="admin-global-search" onClick={() => setCommandOpen(true)}><Search /><span>Search users, products, orders…</span><kbd>Ctrl K</kbd></button><div className="top-actions"><button onClick={() => setDark((value) => !value)} aria-label="Toggle theme"><Moon /></button><button onClick={() => navigate('/activities')} aria-label="Open activity log"><Bell /><i /></button><span className="admin-avatar">{String(user?.fullName || user?.email || 'A').slice(0, 1)}</span></div></header>
      <main className="admin-content"><Outlet /></main>
    </div>
    {commandOpen && <CommandPalette close={() => setCommandOpen(false)} navigate={navigate} />}
  </div>
}

function CommandPalette({ close, navigate }) {
  const [query, setQuery] = useState('')
  const options = navGroups.flatMap(([, links]) => links).filter(([label]) => label.toLowerCase().includes(query.toLowerCase()))
  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === 'Escape') close() }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [close])
  return <div className="command-backdrop" onMouseDown={close}><section className="command-palette" onMouseDown={(event) => event.stopPropagation()}><header><Command /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search admin modules…" /><button onClick={close}><X /></button></header><small>Navigate</small>{options.map(([label, to]) => <button key={to} onClick={() => { navigate(to); close() }}><span>{label}</span><kbd>↵</kbd></button>)}</section></div>
}
