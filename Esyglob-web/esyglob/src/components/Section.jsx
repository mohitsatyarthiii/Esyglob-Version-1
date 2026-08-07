import { ArrowRight } from 'lucide-react'

export default function Section({ id, eyebrow, title, description, action, children, tone = '' }) {
  return (
    <section id={id} className={`home-section ${tone ? `home-section--${tone}` : ''}`}>
      <div className="container">
        <header className="section-heading">
          <div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2>{description && <p>{description}</p>}</div>
          {action && <button onClick={action.onClick}>{action.label}<ArrowRight /></button>}
        </header>
        {children}
      </div>
    </section>
  )
}
