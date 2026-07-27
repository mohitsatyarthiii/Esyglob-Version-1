import { AlertTriangle } from 'lucide-react'

export default function ConfirmDialog({ state, close }) {
  if (!state) return null
  return <div className="dialog-backdrop" onMouseDown={() => close(false)}><section className="confirm-dialog" role="alertdialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><i><AlertTriangle /></i><div><h2>{state.title}</h2><p>{state.message}</p></div><footer><button onClick={() => close(false)}>Cancel</button><button className="danger" onClick={() => close(true)}>{state.action || 'Delete'}</button></footer></section></div>
}
