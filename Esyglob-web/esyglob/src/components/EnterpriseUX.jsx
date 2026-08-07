/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, CircleAlert, Info, LoaderCircle, X } from 'lucide-react'
import { useLocation } from 'react-router-dom'

const ToastContext = createContext(null)
const ConfirmContext = createContext(null)
let toastSequence = 0

const toastIcons = {
  success: CheckCircle2,
  error: CircleAlert,
  warning: AlertTriangle,
  info: Info,
  loading: LoaderCircle,
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts((current) => current.map((item) => item.id === id ? { ...item, leaving: true } : item))
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 180)
  }, [])

  const notify = useCallback((input) => {
    const item = typeof input === 'string' ? { message: input } : input
    const id = item.id || `toast-${Date.now()}-${toastSequence += 1}`
    const type = item.type || 'info'
    setToasts((current) => [
      ...current.filter((entry) => entry.id !== id),
      { ...item, id, type, createdAt: Date.now() },
    ].slice(-5))
    if (!item.persistent && type !== 'loading') {
      window.setTimeout(() => dismiss(id), item.duration || (type === 'error' ? 6500 : 4200))
    }
    return id
  }, [dismiss])

  const update = useCallback((id, changes) => {
    setToasts((current) => current.map((item) => item.id === id ? { ...item, ...changes } : item))
    if (!changes.persistent && changes.type !== 'loading') {
      window.setTimeout(() => dismiss(id), changes.duration || 4200)
    }
  }, [dismiss])

  useEffect(() => {
    const handler = (event) => notify(event.detail || {})
    window.addEventListener('esyglob:toast', handler)
    return () => window.removeEventListener('esyglob:toast', handler)
  }, [notify])

  const value = useMemo(() => ({
    notify,
    dismiss,
    update,
    success: (message, options) => notify({ ...options, message, type: 'success' }),
    error: (message, options) => notify({ ...options, message, type: 'error' }),
    warning: (message, options) => notify({ ...options, message, type: 'warning' }),
    info: (message, options) => notify({ ...options, message, type: 'info' }),
    loading: (message, options) => notify({ ...options, message, type: 'loading', persistent: true }),
  }), [dismiss, notify, update])

  return <ToastContext.Provider value={value}>{children}<div className="enterprise-toasts" aria-live="polite" aria-atomic="false">
    {toasts.map((item) => {
      const Icon = toastIcons[item.type] || Info
      return <article className={`enterprise-toast enterprise-toast--${item.type}${item.leaving ? ' is-leaving' : ''}`} key={item.id} role={item.type === 'error' ? 'alert' : 'status'}>
        <i><Icon /></i>
        <div><b>{item.title || toastTitle(item.type)}</b><p>{item.message}</p>{item.action && <button type="button" onClick={() => { item.action.onClick?.(); dismiss(item.id) }}>{item.action.label}</button>}</div>
        <button type="button" className="enterprise-toast__close" onClick={() => dismiss(item.id)} aria-label="Dismiss notification"><X /></button>
      </article>
    })}
  </div></ToastContext.Provider>
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used within ToastProvider')
  return context
}

export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null)
  const cancelRef = useRef(null)
  const dialogRef = useRef(null)

  const confirm = useCallback((options = {}) => new Promise((resolve) => {
    setDialog({
      title: options.title || 'Confirm this action',
      message: options.message || 'Are you sure you want to continue?',
      confirmLabel: options.confirmLabel || 'Confirm',
      cancelLabel: options.cancelLabel || 'Cancel',
      tone: options.tone || 'danger',
      resolve,
    })
  }), [])

  const close = useCallback((answer) => {
    setDialog((current) => {
      current?.resolve(answer)
      return null
    })
  }, [])

  useEffect(() => {
    if (!dialog) return undefined
    const previous = document.activeElement
    cancelRef.current?.focus()
    const keydown = (event) => {
      if (event.key === 'Escape') close(false)
      if (event.key === 'Tab') {
        const controls = [...(dialogRef.current?.querySelectorAll('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])') || [])]
        if (!controls.length) return
        const first = controls[0]
        const last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', keydown)
    return () => {
      document.removeEventListener('keydown', keydown)
      previous?.focus?.()
    }
  }, [close, dialog])

  return <ConfirmContext.Provider value={confirm}>{children}{dialog && <div className="enterprise-dialog-backdrop" onMouseDown={() => close(false)}>
    <section ref={dialogRef} className="enterprise-dialog" role="alertdialog" aria-modal="true" aria-labelledby="enterprise-dialog-title" aria-describedby="enterprise-dialog-message" onMouseDown={(event) => event.stopPropagation()}>
      <i className={`enterprise-dialog__icon enterprise-dialog__icon--${dialog.tone}`}><AlertTriangle /></i>
      <div><h2 id="enterprise-dialog-title">{dialog.title}</h2><p id="enterprise-dialog-message">{dialog.message}</p></div>
      <footer><button type="button" ref={cancelRef} className="button button--secondary" onClick={() => close(false)}>{dialog.cancelLabel}</button><button type="button" className={`button ${dialog.tone === 'danger' ? 'danger-button' : 'button--primary'}`} onClick={() => close(true)}>{dialog.confirmLabel}</button></footer>
    </section>
  </div>}</ConfirmContext.Provider>
}

export function useConfirm() {
  const context = useContext(ConfirmContext)
  if (!context) throw new Error('useConfirm must be used within ConfirmProvider')
  return context
}

export function GlobalFormUX() {
  useEffect(() => {
    const selector = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select'

    const clearError = (field) => {
      field.removeAttribute('aria-invalid')
      const errorId = field.getAttribute('aria-errormessage')
      if (errorId) document.getElementById(errorId)?.remove()
      field.removeAttribute('aria-errormessage')
    }

    const showError = (field) => {
      if (!field.matches?.(selector) || field.disabled) return
      clearError(field)
      const error = document.createElement('small')
      const id = `field-error-${Date.now()}-${toastSequence += 1}`
      error.id = id
      error.className = 'enterprise-field-error'
      error.textContent = field.dataset.error || validationMessage(field)
      field.setAttribute('aria-invalid', 'true')
      field.setAttribute('aria-errormessage', id)
      const control = field.closest('.field__control')
      ;(control || field).insertAdjacentElement('afterend', error)
    }

    const invalid = (event) => showError(event.target)
    const input = (event) => {
      const field = event.target
      if (!field.matches?.(selector)) return
      if (field.validity?.valid) clearError(field)
      else if (field.getAttribute('aria-invalid') === 'true') showError(field)
    }
    const submit = (event) => {
      const form = event.target
      if (!(form instanceof HTMLFormElement)) return
      if (!form.checkValidity()) {
        event.preventDefault()
        const invalidFields = [...form.querySelectorAll(selector)].filter((field) => !field.disabled && !field.validity.valid)
        invalidFields.forEach(showError)
        const first = invalidFields[0]
        window.dispatchEvent(new CustomEvent('esyglob:toast', {
          detail: {
            type: 'warning',
            title: 'Required information missing',
            message: `Please correct ${invalidFields.length === 1 ? 'the highlighted field' : `${invalidFields.length} highlighted fields`}.`,
          },
        }))
        first?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        window.setTimeout(() => first?.focus({ preventScroll: true }), 250)
        return
      }
      const now = Date.now()
      if (now - Number(form.dataset.lastEnterpriseSubmit || 0) < 900) {
        event.preventDefault()
        return
      }
      form.dataset.lastEnterpriseSubmit = String(now)
    }

    document.addEventListener('invalid', invalid, true)
    document.addEventListener('input', input, true)
    document.addEventListener('change', input, true)
    document.addEventListener('submit', submit, true)
    return () => {
      document.removeEventListener('invalid', invalid, true)
      document.removeEventListener('input', input, true)
      document.removeEventListener('change', input, true)
      document.removeEventListener('submit', submit, true)
    }
  }, [])
  return null
}

export function NavigationUX() {
  const location = useLocation()

  useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual'
    if (!isScrollPreserved(location.pathname)) window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [location.key, location.pathname])

  return <div key={location.key} className="route-progress is-active" aria-hidden="true"><i /></div>
}

function validationMessage(field) {
  const label = field.closest('label')?.textContent?.trim().replace(/\s*\(optional\)\s*$/i, '') || field.getAttribute('aria-label') || field.name || 'This field'
  if (field.validity.valueMissing) return `${label} is required.`
  if (field.validity.typeMismatch) return `Enter a valid ${field.type === 'email' ? 'email address' : field.type === 'url' ? 'URL' : 'value'}.`
  if (field.validity.tooShort) return `${label} must be at least ${field.minLength} characters.`
  if (field.validity.tooLong) return `${label} must be no more than ${field.maxLength} characters.`
  if (field.validity.rangeUnderflow) return `${label} must be at least ${field.min}.`
  if (field.validity.rangeOverflow) return `${label} must be no more than ${field.max}.`
  if (field.validity.patternMismatch) return field.title || `Check the format of ${label.toLowerCase()}.`
  return field.validationMessage || `Check ${label.toLowerCase()}.`
}

function toastTitle(type) {
  return ({ success: 'Success', error: 'Something went wrong', warning: 'Please review', loading: 'Working…', info: 'Update' })[type] || 'Update'
}

function isScrollPreserved(pathname) {
  return /^\/(?:messages\/[^/]+|ai-chat)(?:\/|$)/.test(pathname)
}
