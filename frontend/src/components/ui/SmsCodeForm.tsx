import { useState, type ReactNode } from 'react'
import { useNow } from '@/hooks/useNow'
import { Button } from './Button'
import { OtpInput } from './OtpInput'

const CODE_LENGTH = 6

interface SmsCodeFormProps {
  /** Masked number the code was sent to. */
  phone: string | null
  codeExpiresAt: string | null
  /** When a new code may be requested; null when no more codes can be sent. */
  resendAvailableAt: string | null
  /** Shown when the backend has no SMS provider (development). */
  devCode?: string
  /** Error from the last attempt, shown under the boxes. */
  error: string | null
  onErrorClear: () => void
  /** Rejecting clears the entered digits. */
  onSubmit: (code: string) => Promise<unknown>
  onResend: () => void
  submitting: boolean
  resending: boolean
  submitLabel: string
  /** Extra actions next to the buttons (e.g. cancel). */
  children?: ReactNode
}

function secondsUntil(iso: string | null, now: number) {
  return iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 1000)) : 0
}

function formatCountdown(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/** 6-digit SMS code entry with an expiry countdown and a resend button. */
export function SmsCodeForm({
  phone,
  codeExpiresAt,
  resendAvailableAt,
  devCode,
  error,
  onErrorClear,
  onSubmit,
  onResend,
  submitting,
  resending,
  submitLabel,
  children,
}: SmsCodeFormProps) {
  const [code, setCode] = useState('')
  const now = useNow()
  const expiresIn = secondsUntil(codeExpiresAt, now)
  const resendIn = secondsUntil(resendAvailableAt, now)
  const expired = !!codeExpiresAt && expiresIn === 0

  const submit = (value: string) => {
    if (submitting || expired || value.length !== CODE_LENGTH) return
    onErrorClear()
    onSubmit(value).catch(() => setCode(''))
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        submit(code)
      }}
    >
      <div>
        <p className="mb-3 text-sm text-slate-600">
          Enter the {CODE_LENGTH}-digit code we sent to <span className="font-medium text-slate-900">{phone}</span>.
        </p>
        <OtpInput
          value={code}
          onChange={(v) => {
            setCode(v)
            if (error) onErrorClear()
          }}
          onComplete={submit}
          length={CODE_LENGTH}
          disabled={submitting || expired}
          invalid={!!error}
          autoFocus
        />
        {error ? (
          <p className="mt-2 text-xs text-rose-600">{error}</p>
        ) : (
          <p className="mt-2 text-xs text-slate-500">
            {expired ? 'The code has expired. Request a new one.' : `Code expires in ${formatCountdown(expiresIn)}.`}
          </p>
        )}
      </div>

      {devCode && (
        <p className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          SMS is not configured on this server. Your code is{' '}
          <span className="font-mono font-semibold tracking-widest">{devCode}</span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" loading={submitting} disabled={code.length !== CODE_LENGTH || expired}>
          {submitLabel}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setCode('')
            onResend()
          }}
          loading={resending}
          disabled={!resendAvailableAt || resendIn > 0 || submitting}
        >
          {!resendAvailableAt ? 'No more codes' : resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
        </Button>
        {children}
      </div>
    </form>
  )
}
