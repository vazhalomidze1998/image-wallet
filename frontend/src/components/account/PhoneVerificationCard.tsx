import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { authApi } from '@/api/auth.api'
import { getErrorMessage } from '@/api/client'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { Input } from '@/components/ui/Input'
import { SmsCodeForm } from '@/components/ui/SmsCodeForm'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { phoneSchema, type PhoneForm, type PhoneValues } from '@/schemas/wallet.schema'
import type { PhoneVerification } from '@/types/api'
import { applyApiFieldErrors } from '@/utils/formErrors'

interface PhoneVerificationCardProps {
  /** Shown when replacing an already verified number. */
  onCancel?: () => void
  onVerified?: () => void
}

/** Two steps: enter a number, then the SMS code sent to it. Saves the number on the account. */
export function PhoneVerificationCard({ onCancel, onVerified }: PhoneVerificationCardProps) {
  const toast = useToast()
  const { user, updateUser } = useAuth()
  const [sent, setSent] = useState<(PhoneVerification & { number: string }) | null>(null)
  const [codeError, setCodeError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<PhoneForm, unknown, PhoneValues>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone: '' },
  })

  const sendCode = useMutation({
    mutationFn: (phone: string) => authApi.sendPhoneCode(phone),
    onSuccess: (v, number) => {
      setSent({ ...v, number })
      setCodeError(null)
      toast.info(`We sent a 6-digit code to ${v.phone}.`)
    },
    onError: (error) => {
      if (!applyApiFieldErrors(error, setError)) {
        if (sent) toast.error(getErrorMessage(error))
        else setError('phone', { type: 'server', message: getErrorMessage(error) })
      }
    },
  })

  const verify = useMutation({
    mutationFn: (code: string) => authApi.verifyPhone(code),
    onSuccess: (u) => {
      updateUser(u)
      toast.success(`Phone ${u.phone} verified.`)
      onVerified?.()
    },
    onError: (error) => setCodeError(getErrorMessage(error)),
  })

  return (
    <Card>
      <CardHeader
        title={user?.phoneVerified ? 'Change phone number' : 'Verify your phone'}
        description="Top-ups are confirmed with a code we text to this number."
      />
      <CardBody>
        {!sent ? (
          <form onSubmit={handleSubmit((v) => sendCode.mutate(v.phone))} className="space-y-4" noValidate>
            <Input
              label="Phone number"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+995 555 12 34 56"
              leading={<Icon name="phone" className="h-4 w-4" />}
              hint={user?.phone ? `Currently verified: ${user.phone}` : 'International format, or a Georgian mobile number.'}
              error={errors.phone?.message}
              {...register('phone')}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={sendCode.isPending}>
                Send verification code
              </Button>
              {onCancel && (
                <Button variant="ghost" onClick={onCancel}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        ) : (
          <SmsCodeForm
            key={sent.codeExpiresAt}
            phone={sent.phone}
            codeExpiresAt={sent.codeExpiresAt}
            resendAvailableAt={sent.resendAvailableAt}
            devCode={sent.devCode}
            error={codeError}
            onErrorClear={() => setCodeError(null)}
            onSubmit={(code) => verify.mutateAsync(code)}
            onResend={() => sendCode.mutate(sent.number)}
            submitting={verify.isPending}
            resending={sendCode.isPending}
            submitLabel="Verify phone"
          >
            <Button variant="ghost" onClick={() => setSent(null)} disabled={verify.isPending}>
              Use another number
            </Button>
          </SmsCodeForm>
        )}
      </CardBody>
    </Card>
  )
}
