import { useCallback, useEffect, useMemo, useState } from 'react'
import { clearApiCache } from '../api/client'
import { getCurrentUser, login, logout, signup } from '../api/auth'
import { AuthContext } from './auth-context'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState('checking')

  const refresh = useCallback(async () => {
    try {
      const current = await getCurrentUser()
      setUser(current)
      setStatus(current ? 'authenticated' : 'guest')
    } catch (error) {
      setUser(null)
      setStatus('guest')
      if (error.status !== 401) throw error
    }
  }, [])

  useEffect(() => {
    let active = true
    getCurrentUser()
      .then((current) => {
        if (!active) return
        setUser(current)
        setStatus(current ? 'authenticated' : 'guest')
      })
      .catch(() => {
        if (!active) return
        setUser(null)
        setStatus('guest')
      })
    return () => { active = false }
  }, [])

  const signIn = useCallback(async (input) => {
    clearApiCache()
    const nextUser = await login(input)
    setUser(nextUser)
    setStatus('authenticated')
    return nextUser
  }, [])

  const signUp = useCallback(async (input) => {
    clearApiCache()
    const nextUser = await signup(input)
    setUser(nextUser)
    setStatus('authenticated')
    return nextUser
  }, [])

  const signOut = useCallback(async () => {
    setUser(null)
    setStatus('guest')
    try {
      await logout()
    } finally {
      clearApiCache()
    }
  }, [])

  const value = useMemo(() => ({ user, status, refresh, signIn, signUp, signOut }), [refresh, signIn, signOut, signUp, status, user])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
