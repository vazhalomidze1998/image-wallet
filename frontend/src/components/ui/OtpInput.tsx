import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react'

interface OtpInputProps {
  value: string
  onChange: (value: string) => void
  /** Called once all digits are filled in. */
  onComplete?: (value: string) => void
  length?: number
  disabled?: boolean
  invalid?: boolean
  autoFocus?: boolean
}

/** One box per digit; supports typing, backspace, arrow keys and pasting the whole code. */
export function OtpInput({ value, onChange, onComplete, length = 6, disabled, invalid, autoFocus }: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const digits = Array.from({ length }, (_, i) => value[i] ?? '')

  const focus = (i: number) => refs.current[Math.max(0, Math.min(length - 1, i))]?.focus()

  const update = (next: string) => {
    const clean = next.replace(/\D/g, '').slice(0, length)
    onChange(clean)
    if (clean.length === length) onComplete?.(clean)
  }

  const setDigit = (i: number, digit: string) => {
    const chars = digits.slice()
    chars[i] = digit
    update(chars.join(''))
  }

  const onKeyDown = (i: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault()
      if (digits[i]) setDigit(i, '')
      else if (i > 0) {
        setDigit(i - 1, '')
        focus(i - 1)
      }
    } else if (e.key === 'ArrowLeft') focus(i - 1)
    else if (e.key === 'ArrowRight') focus(i + 1)
  }

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    if (!pasted) return
    update(pasted)
    focus(pasted.length)
  }

  return (
    <div className="flex gap-2 sm:gap-3" role="group" aria-label="Confirmation code">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          value={d}
          onChange={(e) => {
            const digit = e.target.value.replace(/\D/g, '').slice(-1)
            if (!digit) return
            // Keep the code contiguous: typing into a later box fills the first empty one.
            const target = Math.min(i, value.length)
            setDigit(target, digit)
            focus(target + 1)
          }}
          onKeyDown={onKeyDown(i)}
          onPaste={onPaste}
          onFocus={(e) => e.target.select()}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          aria-label={`Digit ${i + 1}`}
          aria-invalid={invalid}
          className={`h-12 w-11 rounded-xl border-0 bg-surface text-center text-xl font-semibold tabular-nums text-slate-900 shadow-sm ring-1 ring-inset transition focus:ring-2 focus:ring-inset disabled:opacity-60 sm:h-14 sm:w-12 ${
            invalid ? 'ring-rose-400 focus:ring-rose-500' : d ? 'ring-indigo-300 focus:ring-indigo-600' : 'ring-slate-300 focus:ring-indigo-600'
          }`}
        />
      ))}
    </div>
  )
}
