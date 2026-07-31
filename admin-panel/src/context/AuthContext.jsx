/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getCurrentUser, login, logout } from '../api/client'

const AuthContext = createContext(null)
let bootstrapSessionRequest = null

function bootstrapSession() {
  bootstrapSessionRequest ||= getCurrentUser().finally(() => { bootstrapSessionRequest = null })
  return bootstrapSessionRequest
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState('checking')
  useEffect(() => {
    let active = true
    bootstrapSession().then((value) => { if (active) { setUser(value); setStatus('authenticated') } })
      .catch(() => { if (active) setStatus('guest') })
    return () => { active = false }
  }, [])
  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null)
      setStatus('guest')
    }
    window.addEventListener('esyglob:unauthorized', handleUnauthorized)
    return () => window.removeEventListener('esyglob:unauthorized', handleUnauthorized)
  }, [])
  const signIn = useCallback(async (credentials) => {
    const value = await login(credentials)
    setUser(value); setStatus('authenticated')
    return value
  }, [])
  const signOut = useCallback(async () => {
    try { await logout() } finally { setUser(null); setStatus('guest') }
  }, [])
  const value = useMemo(() => ({ user, status, signIn, signOut }), [signIn, signOut, status, user])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
