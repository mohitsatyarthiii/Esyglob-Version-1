// components/Brand.jsx
import { Link } from 'react-router-dom';

export default function Brand({ compact = false, inverse = false, asLink = true }) {
  const content = (
    <div
      className={`flex items-center gap-2.5 ${compact ? 'scale-90' : ''}`}
      aria-label="EsyGlob"
    >
      {/* Logo Image */}
      <div
        className={`overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200/50 ${
          compact ? 'h-8 w-8 rounded-lg' : 'h-10 w-10'
        }`}
      >
        <img
          src="/favicon-logo.jpeg"
          alt="EsyGlob"
          className="h-full w-full object-cover"
        />
      </div>

      {/* Brand Name */}
      <span
        className={`font-manrope text-xl font-extrabold tracking-tight ${
          inverse ? 'text-white' : 'text-gray-900'
        } ${compact ? 'text-lg' : ''}`}
      >
        <span className={inverse ? 'text-orange-400' : 'text-orange-500'}>Esy</span>
        <span className={inverse ? 'text-white' : 'text-gray-900'}>Glob</span>
      </span>
    </div>
  );

  if (asLink) {
    return (
      <Link to="/" className="inline-flex flex-shrink-0">
        {content}
      </Link>
    );
  }

  return <div className="inline-flex flex-shrink-0">{content}</div>;
}