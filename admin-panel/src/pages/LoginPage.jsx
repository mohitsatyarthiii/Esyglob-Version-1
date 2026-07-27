import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate } from 'react-router-dom'
import { z } from 'zod'
import { useAuth } from '../context/AuthContext'

const schema = z.object({
  email: z.string().email('Enter a valid admin email.'),
  password: z.string().min(1, 'Enter your password.'),
})

export default function LoginPage() {
  const { status, user, signIn, signOut } = useAuth()
  const [serverError, setServerError] = useState('')
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema) })
  if (status === 'authenticated' && user?.roles?.includes('admin')) return <Navigate replace to="/dashboard" />
  const submit = async (values) => {
    setServerError('')
    try {
      const account = await signIn(values)
      if (!account?.roles?.includes('admin')) {
        await signOut()
        setServerError('This account does not have admin permissions.')
      }
    } catch (error) { setServerError(error.message) }
  }
  return <main className="admin-login">
    <section>
      <div className="admin-brand admin-brand--large"><i>E</i><span><b>EsyGlob</b><small>Admin operations</small></span></div>
      <div className="login-copy"><span><ShieldCheck /> Secure internal workspace</span><h1>Marketplace operations, in one focused workspace.</h1><p>Review trust, catalog, commerce and customer activity without leaving the admin dashboard.</p></div>
    </section>
    <form onSubmit={handleSubmit(submit)}>
      <i className="login-lock"><LockKeyhole /></i><h2>Sign in to Admin</h2><p>Use your existing EsyGlob administrator account.</p>
      <label>Email address<input type="email" autoComplete="email" autoFocus {...register('email')} />{errors.email && <small>{errors.email.message}</small>}</label>
      <label>Password<input type="password" autoComplete="current-password" {...register('password')} />{errors.password && <small>{errors.password.message}</small>}</label>
      {serverError && <div className="form-error">{serverError}</div>}
      <button disabled={isSubmitting}>{isSubmitting ? 'Signing in…' : <>Continue <ArrowRight /></>}</button>
      <em>Protected by the existing EsyGlob session and role permissions.</em>
    </form>
  </main>
}
