import { useId, type InputHTMLAttributes, type ReactNode, type Ref, type SelectHTMLAttributes } from 'react'

const FIELD =
  'block w-full rounded-lg border-0 px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset placeholder:text-slate-400 focus:ring-2 focus:ring-inset disabled:bg-slate-50 disabled:text-slate-500'

function fieldClasses(error?: string) {
  return `${FIELD} ${error ? 'ring-rose-400 focus:ring-rose-500' : 'ring-slate-300 focus:ring-indigo-600'}`
}

interface FieldWrapperProps {
  id: string
  label?: string
  error?: string
  hint?: ReactNode
  children: ReactNode
}

function FieldWrapper({ id, label, error, hint, children }: FieldWrapperProps) {
  return (
    <div>
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-rose-600">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
      )}
    </div>
  )
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: ReactNode
  /** Decorative element shown inside the field on the left (e.g. an icon). */
  leading?: ReactNode
  /** Element shown inside the field on the right (e.g. a show-password toggle). */
  trailing?: ReactNode
  ref?: Ref<HTMLInputElement>
}

export function Input({ label, error, hint, leading, trailing, id, className = '', ref, ...props }: InputProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <FieldWrapper id={inputId} label={label} error={error} hint={hint}>
      <div className="relative">
        {leading && (
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
            {leading}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={`${fieldClasses(error)} ${leading ? 'pl-10' : ''} ${trailing ? 'pr-10' : ''} ${className}`}
          {...props}
        />
        {trailing && <span className="absolute inset-y-0 right-0 flex items-center pr-2">{trailing}</span>}
      </div>
    </FieldWrapper>
  )
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  ref?: Ref<HTMLSelectElement>
}

export function Select({ label, error, id, className = '', children, ref, ...props }: SelectProps) {
  const autoId = useId()
  const selectId = id ?? autoId
  return (
    <FieldWrapper id={selectId} label={label} error={error}>
      <select ref={ref} id={selectId} aria-invalid={!!error} className={`${fieldClasses(error)} ${className}`} {...props}>
        {children}
      </select>
    </FieldWrapper>
  )
}

export interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  ref?: Ref<HTMLInputElement>
}

export function Checkbox({ label, id, ref, ...props }: CheckboxProps) {
  const autoId = useId()
  const checkboxId = id ?? autoId
  return (
    <label htmlFor={checkboxId} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
      <input
        ref={ref}
        id={checkboxId}
        type="checkbox"
        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
        {...props}
      />
      {label}
    </label>
  )
}
