const SIZES = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-10 w-10' }

export function LoadingSpinner({
  size = 'md',
  className = 'text-indigo-600',
  label,
}: {
  size?: keyof typeof SIZES
  className?: string
  label?: string
}) {
  return (
    <span role="status" className="inline-flex items-center gap-2">
      <svg className={`animate-spin ${SIZES[size]} ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4Z" />
      </svg>
      {label ? <span className="text-sm text-slate-500">{label}</span> : <span className="sr-only">Loading</span>}
    </span>
  )
}

/** Centered spinner for whole-page / whole-section loading states. */
export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-48 items-center justify-center">
      <LoadingSpinner size="lg" label={label} />
    </div>
  )
}
