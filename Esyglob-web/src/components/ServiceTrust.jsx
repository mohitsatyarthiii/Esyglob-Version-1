import { BadgeCheck, Globe2, Headphones, LockKeyhole, ShieldCheck } from 'lucide-react'

const trustItems = [
  { icon: BadgeCheck, title: 'Verified workflow', text: 'Structured checks at every service milestone.' },
  { icon: Globe2, title: 'Global network', text: 'Support designed for domestic and cross-border trade.' },
  { icon: LockKeyhole, title: 'Secure process', text: 'Commercial details remain protected in your account.' },
  { icon: Headphones, title: 'Professional support', text: 'Track progress with an accountable operations team.' },
]

const benefitsByCategory = {
  Logistics: [
    ['Coordinated execution', 'Routes, documents and milestones stay connected in one workflow.'],
    ['Operational visibility', 'Follow service progress without fragmented email threads.'],
    ['Trade-ready support', 'Requirements are captured before provider coordination begins.'],
  ],
  'Trade Finance': [
    ['Structured review', 'Submit commercial context and supporting records securely.'],
    ['Clear milestones', 'Understand each stage from request through decision.'],
    ['Account protection', 'Sensitive financial information remains access-controlled.'],
  ],
  Inspection: [
    ['Defined inspection scope', 'Select product, factory, shipment or loading checks.'],
    ['Evidence-led reporting', 'Capture standards, schedules and required proof upfront.'],
    ['Recognized network', 'Coordinate with established quality and inspection organizations.'],
  ],
  Protection: [
    ['Risk-aware workflow', 'Capture transaction context before protection is recommended.'],
    ['Documented decisions', 'Keep evidence, milestones and outcomes in one place.'],
    ['Secure handling', 'Commercial records remain protected within your account.'],
  ],
  Verification: [
    ['Business checks', 'Organize company credentials and registration records.'],
    ['Buyer confidence', 'Build a more complete and trustworthy supplier profile.'],
    ['Clear review status', 'Follow verification progress and required corrections.'],
  ],
  Advisory: [
    ['Specialist context', 'Share the sourcing, compliance or market-entry challenge.'],
    ['Practical direction', 'Receive an actionable plan aligned to your trade goal.'],
    ['Continued support', 'Keep recommendations connected to your service request.'],
  ],
}

export function ServiceTrustGrid() {
  return <div className="service-trust-grid">{trustItems.map(({ icon: Icon, title, text }) =>
    <article key={title}><i><Icon /></i><div><b>{title}</b><p>{text}</p></div></article>,
  )}</div>
}

export function ServiceBenefits({ category }) {
  const benefits = benefitsByCategory[category] || benefitsByCategory.Advisory
  return <div className="service-benefit-grid">{benefits.map(([title, text], index) =>
    <article key={title}><span>0{index + 1}</span><ShieldCheck /><h3>{title}</h3><p>{text}</p></article>,
  )}</div>
}
