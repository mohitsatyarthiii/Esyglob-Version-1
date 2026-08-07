import { useCallback, useEffect, useMemo, useState } from 'react'
import { clearApiCache } from '../api/client'
import { getCurrentUser, login, logout, signup } from '../api/auth'
import { AuthContext } from './auth-context'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState('checking')
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    setStatus('checking')
    setError(null)
    try {
      const current = await getCurrentUser()
      setUser(current)
      setStatus(current ? 'authenticated' : 'guest')
      return current
    } catch (nextError) {
      setUser(null)
      if (nextError.status === 401) {
        setStatus('guest')
        return null
      }
      setError(nextError)
      setStatus('error')
      throw nextError
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
      .catch((nextError) => {
        if (!active) return
        setUser(null)
        if (nextError.status === 401) setStatus('guest')
        else { setError(nextError); setStatus('error') }
      })
    return () => { active = false }
  }, [])

  const signIn = useCallback(async (input) => {
    clearApiCache()
    setError(null)
    const nextUser = await login(input)
    setUser(nextUser)
    setStatus('authenticated')
    return nextUser
  }, [])

  const signUp = useCallback(async (input) => {
    clearApiCache()
    setError(null)
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

  const value = useMemo(() => ({ user, status, error, refresh, signIn, signUp, signOut }), [error, refresh, signIn, signOut, signUp, status, user])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
