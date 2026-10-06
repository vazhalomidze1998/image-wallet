import type { Pagination as PaginationData } from '@/types/api'
import { Button } from './Button'

export function Pagination({
  pagination,
  onPageChange,
}: {
  pagination: PaginationData
  onPageChange: (page: number) => void
}) {
  const { page, totalPages, total, limit } = pagination
  if (total === 0) return null

  const first = (page - 1) * limit + 1
  const last = Math.min(page * limit, total)

  return (
    <nav className="flex items-center justify-between gap-3 pt-4" aria-label="Pagination">
      <p className="text-sm text-slate-500">
        <span className="font-medium text-slate-700">{first}</span>–<span className="font-medium text-slate-700">{last}</span>{' '}
        of <span className="font-medium text-slate-700">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Previous
        </Button>
        <span className="text-sm text-slate-600">
          {page} / {Math.max(totalPages, 1)}
        </span>
        <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Next
        </Button>
      </div>
    </nav>
  )
}
