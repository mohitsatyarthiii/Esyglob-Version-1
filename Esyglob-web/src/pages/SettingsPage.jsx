import { Bell, Globe2, KeyRound, Languages, MapPin, RefreshCw, Save, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { changePassword } from '../api/account'
import AppShell from '../components/AppShell'
import CurrencySelector from '../components/CurrencySelector'
import { PageHead } from '../components/PageHead'
import { useCurrency } from '../preferences/currency-context'
import { useI18n } from '../i18n/i18n-context'

export default function SettingsPage() {
  const { refreshRates, loading, error: lastError } = useCurrency()
  const { language, languages, setLanguage, t } = useI18n()
  const [password, setPassword] = useState({ currentPassword: '', newPassword: '' })
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [languageMessage, setLanguageMessage] = useState('')
  async function passwordSave(event) {
    event.preventDefault()
    setBusy('password')
    setMessage('')
    try {
      await changePassword(password)
      setPassword({ currentPassword: '', newPassword: '' })
      setMessage('Password updated successfully.')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy('')
    }
  }
  async function languageChange(event) {
    setBusy('language'); setLanguageMessage('')
    try { await setLanguage(event.target.value); setLanguageMessage('Language preference saved.') }
    catch { setLanguageMessage('Unable to save language. Please try again.') }
    finally { setBusy('') }
  }
  return <AppShell><div className="container module-page">
    <PageHead eyebrow="Account controls" title="Settings and security" description="Manage marketplace preferences, regional display and account security." />
    <div className="settings-grid">
      <section className="module-panel"><h2><Globe2 /> Currency</h2><p>Choose by official currency name, code and matching flag. This preference is synchronized with your profile and mobile app.</p><CurrencySelector className="settings-currency-selector" /><button className="button button--secondary" onClick={() => refreshRates(true)} disabled={loading}><RefreshCw /> {loading ? 'Refreshing…' : 'Refresh exchange rates'}</button>{lastError && <small className="action-error">{lastError}</small>}</section>
      <section className="module-panel"><h2><Languages /> {t('settings.languageTitle')}</h2><p>{t('settings.languageBody')}</p><label>{t('preferences.language')}<select value={language} disabled={busy === 'language'} onChange={languageChange}>{languages.map(item => <option value={item.code} key={item.code}>{item.name}</option>)}</select></label>{languageMessage && <p className={languageMessage.includes('saved') ? 'action-success' : 'action-error'}>{languageMessage}</p>}</section>
      <section className="module-panel"><h2><MapPin /> Addresses and location</h2><p>Select saved destinations or use GPS from the same address manager.</p><div className="settings-links"><Link to="/addresses"><MapPin /> Manage addresses</Link></div></section>
      <section className="module-panel"><h2><Bell /> Communication</h2><p>Review synchronized RFQ, quotation, message and order notifications.</p><div className="settings-links"><Link to="/notifications"><Bell /> Notification center</Link><Link to="/messages"><ShieldCheck /> Buyer-seller messages</Link></div></section>
      <form className="module-panel" onSubmit={passwordSave}><h2><KeyRound /> Change password</h2><label>Current password<input type="password" value={password.currentPassword} onChange={(event) => setPassword({ ...password, currentPassword: event.target.value })} required /></label><label>New password<input type="password" minLength="8" value={password.newPassword} onChange={(event) => setPassword({ ...password, newPassword: event.target.value })} required /></label>{message && <p className={message.includes('successfully') ? 'action-success' : 'action-error'}>{message}</p>}<button className="button button--primary" disabled={Boolean(busy)}><Save /> Update password</button></form>
    </div>
  </div></AppShell>
}
