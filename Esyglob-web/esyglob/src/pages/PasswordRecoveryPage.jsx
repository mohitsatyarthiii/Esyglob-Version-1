import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, KeyRound, LockKeyhole, Mail, RotateCcw, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { requestPasswordReset, resetPassword, verifyPasswordResetOtp } from '../api/auth'
import Brand from '../components/Brand'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function PasswordRecoveryPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState('email')
  const [email, setEmail] = useState('')
  const [challengeId, setChallengeId] = useState('')
  const [otp, setOtp] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [lockCountdown, setLockCountdown] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const strength = useMemo(() => passwordStrength(password), [password])

  useEffect(() => {
    if (!countdown && !lockCountdown) return undefined
    const timer = window.setInterval(() => {
      setCountdown(value => Math.max(0, value - 1))
      setLockCountdown(value => Math.max(0, value - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [countdown, lockCountdown])

  useEffect(() => {
    if (step !== 'success') return undefined
    const timer = window.setTimeout(() => navigate('/login', { replace: true, state: { notice: 'Password updated successfully. Sign in with your new password.' } }), 3500)
    return () => window.clearTimeout(timer)
  }, [navigate, step])

  function captureError(nextError) {
    const retryAfter = Number(nextError?.details?.retryAfter || 0)
    if (nextError?.details?.code === 'PASSWORD_RESET_LOCKED' && retryAfter) setLockCountdown(retryAfter)
    setError(nextError.message || 'Unable to complete this request. Please try again.')
  }

  async function requestCode(event) {
    event.preventDefault()
    if (!EMAIL_PATTERN.test(email.trim())) return setError('Enter a valid registered email address.')
    if (loading) return
    setLoading(true); setError('')
    try {
      const result = await requestPasswordReset(email.trim())
      setChallengeId(result.challengeId)
      setCountdown(Number(result.resendAfterSeconds || 60))
      setStep('otp')
    } catch (nextError) { captureError(nextError) } finally { setLoading(false) }
  }

  async function verifyCode(event) {
    event.preventDefault()
    if (!/^\d{6}$/.test(otp)) return setError('Enter the complete 6-digit verification code.')
    if (loading || lockCountdown) return
    setLoading(true); setError('')
    try {
      const result = await verifyPasswordResetOtp(challengeId, otp)
      setResetToken(result.resetToken)
      setStep('password')
    } catch (nextError) { captureError(nextError) } finally { setLoading(false) }
  }

  async function resendCode() {
    if (loading || countdown || lockCountdown) return
    setLoading(true); setError('')
    try {
      const result = await requestPasswordReset(email.trim(), challengeId)
      setChallengeId(result.challengeId)
      setOtp('')
      setCountdown(Number(result.resendAfterSeconds || 60))
    } catch (nextError) { captureError(nextError) } finally { setLoading(false) }
  }

  async function savePassword(event) {
    event.preventDefault()
    const validation = validatePassword(password, confirmPassword)
    if (validation) return setError(validation)
    if (loading) return
    setLoading(true); setError('')
    try {
      await resetPassword(challengeId, resetToken, password, confirmPassword)
      setStep('success')
    } catch (nextError) { captureError(nextError) } finally { setLoading(false) }
  }

  const copy = {
    email: ['Recover your account', 'Enter your registered email to receive a secure verification code.'],
    otp: ['Check your email', `Enter the 6-digit code sent for ${maskEmail(email)}.`],
    password: ['Create a new password', 'Use a strong password you have not used for this account before.'],
    success: ['Password updated', 'Your password was changed securely. You can now return to sign in.'],
  }[step]

  return <main className="auth-page password-recovery-page">
    <section className="auth-aside">
      <Brand inverse />
      <div className="auth-aside__copy"><span className="eyebrow">Secure account recovery</span><h2>Your access, protected at every step.</h2><p>Verification codes expire quickly, can be used only once, and are protected by security controls.</p></div>
      <div className="auth-proof"><span><ShieldCheck /><b>Identity verification</b><small>Time-limited email confirmation</small></span><span><LockKeyhole /><b>Secure reset</b><small>Strong password and session protection</small></span></div>
    </section>
    <section className="auth-panel">
      <div className="auth-panel__mobile-brand"><Brand /></div>
      <button className="auth-back" onClick={() => step === 'email' ? navigate('/login') : (setStep('email'), setError(''))}><ArrowLeft /> {step === 'email' ? 'Sign in' : 'Start again'}</button>
      <div className="auth-card recovery-card">
        <div className="auth-card__heading"><span className="auth-icon">{step === 'success' ? <Check /> : step === 'otp' ? <KeyRound /> : <LockKeyhole />}</span><h1>{copy[0]}</h1><p>{copy[1]}</p></div>
        <ol className="recovery-steps" aria-label="Password recovery progress">{['Email', 'Verify', 'Password'].map((label, index) => <li className={index <= ['email','otp','password','success'].indexOf(step) ? 'active' : ''} key={label}><i>{index + 1}</i><span>{label}</span></li>)}</ol>
        {error && <div className="form-message form-message--error" role="alert">{error}</div>}
        {lockCountdown > 0 && <div className="recovery-lock"><ShieldCheck /><span><b>Password reset temporarily unavailable</b><small>Try again in {formatDuration(lockCountdown)}. Normal sign-in remains available.</small></span></div>}
        {step === 'email' && <form onSubmit={requestCode} noValidate><RecoveryField icon={<Mail />} label="Registered email" type="email" value={email} onChange={setEmail} placeholder="name@company.com" autoComplete="email" /><button className="button button--primary button--full" disabled={loading}>{loading ? <span className="spinner" /> : <>Send verification code <ArrowRight /></>}</button></form>}
        {step === 'otp' && <form onSubmit={verifyCode} noValidate><label className="otp-field"><span>Verification code</span><input inputMode="numeric" autoComplete="one-time-code" maxLength="6" value={otp} onChange={event => { setOtp(event.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }} aria-label="6-digit verification code" placeholder="000000" /></label><p className="recovery-expiry">The code expires after 10 minutes. Three incorrect attempts invalidate it.</p><button className="button button--primary button--full" disabled={loading || otp.length !== 6 || lockCountdown > 0}>{loading ? <span className="spinner" /> : <>Verify code <ArrowRight /></>}</button><button className="recovery-resend" type="button" disabled={loading || countdown > 0 || lockCountdown > 0} onClick={resendCode}><RotateCcw /> {countdown > 0 ? `Resend available in ${formatDuration(countdown)}` : 'Resend a new code'}</button></form>}
        {step === 'password' && <form onSubmit={savePassword} noValidate><RecoveryField icon={<LockKeyhole />} label="New password" type={showPassword ? 'text' : 'password'} value={password} onChange={setPassword} placeholder="Create a strong password" autoComplete="new-password" action={<button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff /> : <Eye />}</button>} /><div className="password-strength"><span><i style={{ width: `${strength.score * 20}%` }} /></span><small>{strength.label} password</small></div><RecoveryField icon={<LockKeyhole />} label="Confirm password" type="password" value={confirmPassword} onChange={setConfirmPassword} placeholder="Repeat your new password" autoComplete="new-password" /><ul className="password-policy"><li className={password.length >= 12 ? 'done' : ''}>12+ characters</li><li className={/[A-Z]/.test(password) && /[a-z]/.test(password) ? 'done' : ''}>Upper and lowercase</li><li className={/\d/.test(password) && /[^A-Za-z0-9]/.test(password) ? 'done' : ''}>Number and symbol</li></ul><button className="button button--primary button--full" disabled={loading}>{loading ? <span className="spinner" /> : <>Update password <ArrowRight /></>}</button></form>}
        {step === 'success' && <div className="recovery-success"><span><Check /></span><p>All pending verification codes have been invalidated.</p><Link className="button button--primary button--full" to="/login">Return to sign in <ArrowRight /></Link><small>Redirecting automatically…</small></div>}
        {step !== 'success' && <div className="auth-switch"><Link to="/login">Return to sign in</Link></div>}
      </div>
    </section>
  </main>
}

function RecoveryField({ icon, label, action, onChange, ...props }) {
  return <label className="field"><span>{label}</span><div className="field__control">{icon}<input required {...props} onChange={event => { onChange(event.target.value) }} />{action}</div></label>
}

function validatePassword(password, confirmation) {
  if (password.length < 12) return 'Password must be at least 12 characters.'
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) return 'Use uppercase, lowercase, a number, and a special character.'
  if (password !== confirmation) return 'Passwords do not match.'
  return ''
}

function passwordStrength(password) {
  const score = [password.length >= 12, /[A-Z]/.test(password), /[a-z]/.test(password), /\d/.test(password), /[^A-Za-z0-9]/.test(password)].filter(Boolean).length
  return { score, label: score >= 5 ? 'Strong' : score >= 4 ? 'Good' : score >= 3 ? 'Fair' : 'Weak' }
}

function maskEmail(email) {
  const [name, domain] = String(email).split('@')
  if (!domain) return email
  return `${name.slice(0, 2)}${'*'.repeat(Math.max(2, name.length - 2))}@${domain}`
}

function formatDuration(seconds) {
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h ${Math.ceil((seconds % 3600) / 60)}m`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}
