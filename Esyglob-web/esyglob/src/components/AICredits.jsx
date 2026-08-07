/* eslint-disable react-refresh/only-export-components, react-hooks/set-state-in-effect */
import { AlertTriangle, ArrowUpRight, Check, Coins, LockKeyhole, Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchSubscription, fetchSubscriptionPlans } from '../api/verification'
import { Money } from './TradeUI'

const CREDIT_EVENT = 'esyglob:ai-credits-updated'

export function publishAICredits(credits) {
  if (credits) window.dispatchEvent(new CustomEvent(CREDIT_EVENT, { detail: credits }))
}

export function useAICredits(role = 'buyer') {
  const [credits, setCredits] = useState(null)
  const [loading, setLoading] = useState(true)
  const refresh = useCallback(async () => {
    const data = await fetchSubscription(role)
    setCredits(data?.credits || {
      allocated: Number(data?.plan?.aiCredits?.monthly ?? data?.plan?.aiCredits ?? 0),
      used: Number(data?.usage?.aiCreditsUsed || 0),
      remaining: Number(data?.usage?.aiCreditsRemaining || 0),
      todayUsed: Number(data?.usage?.aiCreditsToday || 0),
      resetAt: data?.subscription?.creditsResetAt || data?.subscription?.usageResetAt,
    })
    setLoading(false)
    return data
  }, [role])
  const apply = useCallback((next) => {
    if (!next) return
    setCredits(current => {
      const usedDelta = Math.max(0, Number(next.used || 0) - Number(current?.used || 0))
      return { ...current, ...next, todayUsed: next.todayUsed ?? Number(current?.todayUsed || 0) + usedDelta }
    })
    publishAICredits(next)
  }, [])
  useEffect(() => {
    let live = true
    refresh().catch(() => { if (live) setLoading(false) })
    const receive = event => { if (live && event.detail) setCredits(current => ({ ...current, ...event.detail })) }
    const refetch = () => { if (document.visibilityState === 'visible') refresh().catch(() => undefined) }
    window.addEventListener(CREDIT_EVENT, receive)
    window.addEventListener('focus', refetch)
    document.addEventListener('visibilitychange', refetch)
    const timer = window.setInterval(refetch, 60_000)
    return () => { live = false; window.removeEventListener(CREDIT_EVENT, receive); window.removeEventListener('focus', refetch); document.removeEventListener('visibilitychange', refetch); window.clearInterval(timer) }
  }, [refresh])
  return { credits, loading, refresh, apply, exhausted: Boolean(credits && Number(credits.remaining) <= 0) }
}

export function AICreditMeter({ state, role = 'buyer', compact = false, className = '' }) {
  const source = state || { credits: null, loading: true }
  const [dialogOpen, setDialogOpen] = useState(false)
  const credits = source.credits
  const allocated = Math.max(0, Number(credits?.allocated || 0))
  const remaining = Math.max(0, Number(credits?.remaining || 0))
  const used = Math.max(0, Number(credits?.used || 0))
  const percentage = allocated ? Math.min(100, Math.round((used / allocated) * 100)) : 100
  const low = allocated > 0 && remaining / allocated <= 0.2
  if (source.loading && !credits) return <div className={`ai-credit-meter is-loading ${className}`} aria-label="Loading AI credits" />
  return <>
    <section className={`ai-credit-meter ${compact ? 'is-compact' : ''} ${low ? 'is-low' : ''} ${remaining <= 0 ? 'is-empty' : ''} ${className}`} aria-label="AI credit balance">
      <div className="ai-credit-meter__heading"><span><Coins /><small>AI credits</small><b>{remaining.toLocaleString()} remaining</b></span>{!compact && <button type="button" onClick={() => setDialogOpen(true)}>View plans <ArrowUpRight /></button>}</div>
      <div className="ai-credit-meter__track"><i style={{ width: `${percentage}%` }} /></div>
      {!compact && <div className="ai-credit-meter__stats"><span><small>Today’s usage</small><b>{Number(credits?.todayUsed || 0)}</b></span><span><small>Credits consumed</small><b>{used}</b></span><span><small>Next renewal</small><b>{credits?.resetAt ? new Date(credits.resetAt).toLocaleDateString() : 'Plan based'}</b></span></div>}
      {compact && low && <button type="button" className="ai-credit-meter__upgrade" onClick={() => setDialogOpen(true)}>{remaining ? 'Running low' : 'Get credits'}</button>}
      {!compact && low && <p><AlertTriangle /> {remaining ? `Only ${remaining} credits remain. Upgrade now to avoid interruptions.` : 'Your AI credits are exhausted. Choose a plan to continue.'}</p>}
    </section>
    <AICreditDialog open={dialogOpen} onClose={() => setDialogOpen(false)} role={role} credits={credits} />
  </>
}

export function AICreditDialog({ open, onClose, role = 'buyer', credits }) {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!open || plans.length) return
    setLoading(true)
    fetchSubscriptionPlans(role).then(data => setPlans(data?.plans || data || [])).catch(() => setPlans([])).finally(() => setLoading(false))
  }, [open, plans.length, role])
  const paidPlans = useMemo(() => plans.filter(plan => Number(plan.prices?.monthly?.amount ?? plan.prices?.monthly ?? 0) > 0).slice(0, 3), [plans])
  if (!open) return null
  return <div className="ai-credit-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-credit-dialog-title">
    <button className="ai-credit-dialog__backdrop" aria-label="Close credit plans" onClick={onClose} />
    <section><header><i><Sparkles /></i><div><span>Instant activation</span><h2 id="ai-credit-dialog-title">Continue with EsyGlob AI</h2><p>Your current balance is <b>{Number(credits?.remaining || 0)} credits</b>. Choose a secure plan to continue without interruption.</p></div><button type="button" aria-label="Close" onClick={onClose}><X /></button></header>
      <div className="ai-credit-dialog__trust"><span><LockKeyhole /> Secure payment</span><span><Check /> Credits activate instantly</span><span><Check /> One account across devices</span></div>
      <div className="ai-credit-dialog__plans">{loading ? <p>Loading available plans…</p> : paidPlans.map((plan, index) => { const price = plan.prices?.monthly; const amount = price?.amount ?? price; const planCredits = Number(plan.aiCredits?.monthly ?? plan.aiCredits ?? 0); return <article className={index === 1 || plan.recommended ? 'recommended' : ''} key={plan.key}><span>{index === 1 || plan.recommended ? 'Best value' : 'AI plan'}</span><h3>{plan.name}</h3><strong>{planCredits.toLocaleString()} <small>credits / month</small></strong><p><Money value={amount} currency={price?.currency || 'INR'} /></p><small>Estimated {Math.max(1, Math.floor(planCredits))} AI requests</small></article> })}</div>
      <footer><Link className="button button--primary" to={`/subscriptions?role=${role}`}>Compare plans and purchase <ArrowUpRight /></Link><button type="button" className="button button--ghost" onClick={onClose}>Maybe later</button></footer>
    </section>
  </div>
}
