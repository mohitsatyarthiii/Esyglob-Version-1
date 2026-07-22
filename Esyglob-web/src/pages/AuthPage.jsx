import { ArrowLeft, ArrowRight, Building2, Check, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, UserRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { requestPasswordReset, resetPassword } from '../api/auth'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/auth-context'
import Brand from '../components/Brand'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function AuthPage({ mode }) {
  const { status, signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [role, setRole] = useState('buyer')
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const strength = useMemo(() => passwordStrength(form.password), [form.password])

  if (status === 'authenticated') return <Navigate replace to="/home" />

  const isSignup = mode === 'signup'
  const isForgot = mode === 'forgot'
  const isReset = mode === 'reset'
  const title = isSignup ? 'Create your EsyGlob account' : isForgot ? 'Recover your account' : isReset ? 'Set a new password' : 'Welcome back'
  const subtitle = isSignup ? 'Start sourcing or selling in the global marketplace.' : isForgot ? 'Enter your email to request recovery instructions.' : isReset ? 'Choose a strong password for your account.' : 'Sign in to continue to your marketplace.'

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
    setError('')
  }

  function validate() {
    if (!EMAIL_PATTERN.test(form.email.trim())) return 'Enter a valid business email address.'
    if (isForgot) return ''
    if (isSignup && form.name.trim().length < 2) return 'Enter your full name.'
    if (form.password.length < (isSignup || isReset ? 8 : 1)) return isSignup || isReset ? 'Password must be at least 8 characters.' : 'Enter your password.'
    if ((isSignup || isReset) && form.password !== form.confirmPassword) return 'Passwords do not match.'
    return ''
  }

  async function submit(event) {
    event.preventDefault()
    const validationError = validate()
    if (validationError) return setError(validationError)
    setLoading(true)
    setError('')
    setMessage('')
    try {
      if (isForgot) {
        await requestPasswordReset(form.email.trim())
        setMessage('If an account exists, password recovery instructions have been prepared.')
      } else if (isReset) {
        const token = searchParams.get('token')
        if (!token) throw new Error('This reset link is missing its security token.')
        await resetPassword(token, form.password)
        navigate('/login', { replace: true, state: { notice: 'Password reset. You can now sign in.' } })
      } else if (isSignup) {
        await signUp({ name: form.name.trim(), email: form.email.trim(), password: form.password, role })
        navigate('/home', { replace: true })
      } else {
        await signIn({ email: form.email.trim(), password: form.password })
        navigate(location.state?.from || '/home', { replace: true })
      }
    } catch (nextError) {
      if (nextError instanceof ApiError && nextError.status === 404 && (isForgot || isReset)) {
        setError('Password recovery is not enabled on the current EsyGlob API. Please contact support for account access.')
      } else {
        setError(nextError.message || 'Something went wrong. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-aside">
        <Link to="/welcome"><Brand inverse /></Link>
        <div className="auth-aside__copy"><span className="eyebrow">One platform. Every trade.</span><h2>Build trusted business across borders.</h2><p>Source products, verify suppliers, negotiate and manage trade with confidence.</p></div>
        <div className="auth-proof"><span><ShieldCheck /><b>Secure by design</b><small>Protected sessions and verified accounts</small></span><span><Building2 /><b>Built for B2B</b><small>Purpose-built sourcing and seller workflows</small></span></div>
        <div className="auth-quote"><p>“EsyGlob gives every business a clearer, safer path to global sourcing.”</p><span>Global trade, made easier</span></div>
      </section>
      <section className="auth-panel">
        <div className="auth-panel__mobile-brand"><Brand /></div>
        <button className="auth-back" onClick={() => navigate(-1)}><ArrowLeft /> Back</button>
        <div className="auth-card">
          <div className="auth-card__heading"><span className="auth-icon"><LockKeyhole /></span><h1>{title}</h1><p>{subtitle}</p></div>
          {location.state?.notice && <div className="form-message form-message--success"><Check /> {location.state.notice}</div>}
          {error && <div className="form-message form-message--error" role="alert">{error}</div>}
          {message && <div className="form-message form-message--success"><Check /> {message}</div>}

          <form onSubmit={submit} noValidate>
            {isSignup && (
              <>
                <div className="role-picker" aria-label="Choose account type">
                  <button type="button" className={role === 'buyer' ? 'active' : ''} onClick={() => setRole('buyer')}><UserRound /><span><b>Buyer</b><small>Source products</small></span><i /></button>
                  <button type="button" className={role === 'seller' ? 'active' : ''} onClick={() => setRole('seller')}><Building2 /><span><b>Seller</b><small>Grow your business</small></span><i /></button>
                </div>
                <Field icon={<UserRound />} label="Full name" name="name" value={form.name} onChange={(value) => update('name', value)} placeholder="Your full name" autoComplete="name" />
              </>
            )}
            {!isReset && <Field icon={<Mail />} label="Business email" name="email" type="email" value={form.email} onChange={(value) => update('email', value)} placeholder="name@company.com" autoComplete="email" />}
            {!isForgot && <Field icon={<LockKeyhole />} label={isReset ? 'New password' : 'Password'} name="password" type={showPassword ? 'text' : 'password'} value={form.password} onChange={(value) => update('password', value)} placeholder="Enter your password" autoComplete={isSignup || isReset ? 'new-password' : 'current-password'} action={<button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff /> : <Eye />}</button>} />}
            {(isSignup || isReset) && (
              <>
                <div className="password-strength"><span><i style={{ width: `${strength.score * 20}%` }} /></span><small>{strength.label} password</small></div>
                <Field icon={<LockKeyhole />} label="Confirm password" name="confirmPassword" type="password" value={form.confirmPassword} onChange={(value) => update('confirmPassword', value)} placeholder="Repeat your password" autoComplete="new-password" />
              </>
            )}
            {!isSignup && !isForgot && !isReset && <div className="form-row"><label className="checkbox"><input type="checkbox" /><span /> Keep me signed in</label><Link to="/forgot-password">Forgot password?</Link></div>}
            {isSignup && <p className="terms">By creating an account, you agree to EsyGlob’s Terms of Service and Privacy Policy.</p>}
            <button className="button button--primary button--full" disabled={loading} type="submit">{loading ? <span className="spinner" /> : <>{isSignup ? 'Create account' : isForgot ? 'Request recovery' : isReset ? 'Reset password' : 'Sign in'} <ArrowRight /></>}</button>
          </form>
          <div className="auth-switch">
            {isSignup ? <>Already have an account? <Link to="/login">Sign in</Link></> : isForgot || isReset ? <><Link to="/login">Return to sign in</Link></> : <>New to EsyGlob? <Link to="/signup">Create an account</Link></>}
          </div>
        </div>
      </section>
    </main>
  )
}

function Field({ icon, label, action, onChange, ...props }) {
  return <label className="field"><span>{label}</span><div className="field__control">{icon}<input {...props} onChange={(event) => onChange(event.target.value)} />{action}</div></label>
}

function passwordStrength(password) {
  const score = [password.length >= 8, /[A-Z]/.test(password), /[a-z]/.test(password), /\d/.test(password), /[^A-Za-z0-9]/.test(password)].filter(Boolean).length
  return { score, label: score >= 5 ? 'Strong' : score >= 4 ? 'Good' : score >= 3 ? 'Fair' : 'Weak' }
}
