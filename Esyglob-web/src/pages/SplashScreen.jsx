import Brand from '../components/Brand'

export default function SplashScreen({ compact = false }) {
  return (
    <div className={`splash ${compact ? 'splash--compact' : ''}`} role="status" aria-live="polite">
      <div className="splash__orb splash__orb--one" /><div className="splash__orb splash__orb--two" />
      <Brand />
      <p>Connecting global trade</p>
      <span className="loading-line"><i /></span>
    </div>
  )
}
