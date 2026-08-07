// components/PageHead.jsx
export function PageHead({ eyebrow, title, description }) {
  return (
    <header className="mb-6 md:mb-8">
      <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-blue-600 md:text-xs">
        {eyebrow}
      </span>
      <h1 className="mt-1.5 text-2xl font-extrabold text-gray-900 md:text-3xl lg:text-4xl">
        {title}
      </h1>
      {description && (
        <p className="mt-2 text-sm text-gray-500 md:text-base">
          {description}
        </p>
      )}
    </header>
  );
}