import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { ApiError } from '@/api/client'

/**
 * Shows API validation errors next to the matching form fields
 * (backend reports them as "body.email", "body.amount", ...).
 * Returns true if at least one field error was applied.
 */
export function applyApiFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fieldMap: Partial<Record<string, Path<T>>> = {},
): boolean {
  if (!(error instanceof ApiError) || !error.details?.length) return false
  let applied = false
  for (const detail of error.details) {
    const apiField = detail.field.replace(/^body\./, '')
    const field = fieldMap[apiField] ?? (apiField as Path<T>)
    setError(field, { type: 'server', message: detail.message })
    applied = true
  }
  return applied
}
