import { Card } from '@/components/ui/Card'
import { Icon, type IconName } from '@/components/ui/Icon'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

const TONES = {
  indigo: 'bg-indigo-50 text-indigo-600',
  blue: 'bg-blue-50 text-blue-600',
  orange: 'bg-orange-50 text-orange-600',
  slate: 'bg-slate-100 text-slate-600',
}

/** Stat tile: one headline number with a label. */
export function AnalyticsCard({
  label,
  value,
  hint,
  icon,
  tone = 'slate',
  isLoading,
}: {
  label: string
  value?: string
  hint?: string
  icon: IconName
  tone?: keyof typeof TONES
  isLoading?: boolean
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className={`rounded-lg p-2 ${TONES[tone]}`}>
          <Icon name={icon} className="h-5 w-5" />
        </span>
      </div>
      <div className="mt-2 min-h-8">
        {isLoading ? (
          <LoadingSpinner size="sm" />
        ) : (
          <p className="text-2xl font-semibold tracking-tight text-slate-900">{value ?? '—'}</p>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </Card>
  )
}
