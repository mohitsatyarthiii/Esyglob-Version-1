import { useCallback, useEffect, useMemo, useState } from 'react'
import { updatePreferredLanguage } from '../api/account'
import { useAuth } from '../auth/auth-context'
import { I18nContext } from './i18n-context'
import { SUPPORTED_LANGUAGES, translate } from './resources'

const STORAGE_KEY = 'esyglob.language'
const supported = value => SUPPORTED_LANGUAGES.some(item => item.code === value)

function localLanguage() {
  try { const value = localStorage.getItem(STORAGE_KEY); if (supported(value)) return value } catch { /* Storage can be unavailable. */ }
  const browser = String(navigator.language || 'en').split('-')[0].toLowerCase()
  return supported(browser) ? browser : 'en'
}

export default function I18nProvider({ children }) {
  const { user, status } = useAuth()
  const [selection, setSelection] = useState(() => ({ value: localLanguage(), owner: 'guest' }))
  const accountId = status === 'authenticated' ? String(user?.id || user?._id || 'account') : 'guest'
  const accountLanguage = supported(user?.preferredLanguage) ? user.preferredLanguage : 'en'
  const language = selection.owner === accountId ? selection.value : status === 'authenticated' ? accountLanguage : selection.value

  useEffect(() => {
    const definition = SUPPORTED_LANGUAGES.find(item => item.code === language)
    document.documentElement.lang = language
    document.documentElement.dir = definition?.direction || 'ltr'
    try { localStorage.setItem(STORAGE_KEY, language) } catch { /* Storage can be unavailable. */ }
  }, [language])

  const setLanguage = useCallback(async next => {
    if (!supported(next)) return false
    setSelection({ value: next, owner: accountId })
    if (status === 'authenticated') await updatePreferredLanguage(next)
    return true
  }, [accountId, status])
  const t = useCallback((key, variables) => translate(language, key, variables), [language])
  const value = useMemo(() => ({ language, languages: SUPPORTED_LANGUAGES, setLanguage, t, direction: language === 'ar' ? 'rtl' : 'ltr' }), [language, setLanguage, t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
