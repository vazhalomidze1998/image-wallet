import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ApiError, getErrorMessage } from '@/api/client'
import { paymentsApi } from '@/api/payments.api'
import { PhoneVerificationCard } from '@/components/account/PhoneVerificationCard'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { Input } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/PageHeader'
import { SmsCodeForm } from '@/components/ui/SmsCodeForm'
import { WalletCard } from '@/components/wallet/WalletCard'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { useInvalidateWallet, useWallet } from '@/hooks/useWallet'
import { topUpSchema, type TopUpForm } from '@/schemas/wallet.schema'
import type { Payment } from '@/types/wallet'
import { formatDateTime, formatMoney } from '@/utils/format'
import { applyApiFieldErrors } from '@/utils/formErrors'

const PRESETS = ['10', '25', '50', '100']

/** Error codes after which the payment can no longer be confirmed. */
const TERMINAL_OTP_ERRORS = new Set(['OTP_TOO_MANY_ATTEMPTS', 'PAYMENT_NOT_PENDING'])

export default function TopUp() {
  const toast = useToast()
  const { user, refreshUser } = useAuth()
  const wallet = useWallet()
  const invalidateWallet = useInvalidateWallet()
  const [payment, setPayment] = useState<Payment | null>(null)
  const [codeError, setCodeError] = useState<string | null>(null)
  const [changingPhone, setChangingPhone] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    reset,
    formState: { errors },
  } = useForm<TopUpForm>({ resolver: zodResolver(topUpSchema), defaultValues: { amount: '' } })

  const checkout = useMutation({
    mutationFn: ({ amount }: TopUpForm) => paymentsApi.checkout(amount),
    onSuccess: (p) => {
      setPayment(p)
      setCodeError(null)
      invalidateWallet()
      toast.info(`We sent a 6-digit code to ${p.phone}.`)
    },
    onError: (error) => {
      // The phone was unlinked elsewhere: reload the user so the verification step shows.
      if (error instanceof ApiError && error.code === 'PHONE_NOT_VERIFIED') refreshUser()
      if (!applyApiFieldErrors(error, setError)) toast.error(getErrorMessage(error))
    },
  })

  const verify = useMutation({
    mutationFn: (code: string) => paymentsApi.verify(payment!.transaction_id, code),
    onSuccess: (p) => {
      setPayment(p)
      invalidateWallet()
      if (p.status === 'COMPLETED') toast.success(`${formatMoney(p.amount, p.currency)} added to your wallet.`)
      else toast.error('The payment was not completed. Your balance did not change.')
    },
    onError: (error) => {
      const message = getErrorMessage(error)
      if (error instanceof ApiError && TERMINAL_OTP_ERRORS.has(error.code)) {
        setPayment((p) => (p ? { ...p, status: 'FAILED', codeExpiresAt: null, resendAvailableAt: null } : p))
        invalidateWallet()
        toast.error(message)
      } else {
        setCodeError(message)
      }
    },
  })

  const resend = useMutation({
    mutationFn: () => paymentsApi.resendCode(payment!.transaction_id),
    onSuccess: (p) => {
      setPayment(p)
      setCodeError(null)
      toast.info(`A new code was sent to ${p.phone}.`)
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const startOver = () => {
    setPayment(null)
    setCodeError(null)
    reset({ amount: '' })
  }

  const needsPhone = !user?.phoneVerified || changingPhone

  return (
    <>
      <PageHeader title="Top up" description="Add money to your wallet." />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          {!payment && needsPhone ? (
            <PhoneVerificationCard
              onCancel={user?.phoneVerified ? () => setChangingPhone(false) : undefined}
              onVerified={() => setChangingPhone(false)}
            />
          ) : !payment ? (
            <Card>
              <CardHeader
                title="Amount"
                description="We will text you a code to confirm the payment. Your balance changes only after that."
              />
              <CardBody>
                <form onSubmit={handleSubmit((v) => checkout.mutate(v))} className="space-y-4" noValidate>
                  <Input
                    label={`Amount (${wallet.data?.currency ?? 'USD'})`}
                    inputMode="decimal"
                    placeholder="100.00"
                    error={errors.amount?.message}
                    {...register('amount')}
                  />
                  <div className="flex flex-wrap gap-2">
                    {PRESETS.map((p) => (
                      <Button
                        key={p}
                        variant="secondary"
                        size="sm"
                        onClick={() => setValue('amount', p, { shouldValidate: true })}
                      >
                        ${p}
                      </Button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    <Icon name="phone" className="h-4 w-4 text-slate-400" />
                    <span>
                      Code goes to <span className="font-mono text-slate-900">{user?.phone}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setChangingPhone(true)}
                      className="ml-auto font-medium text-indigo-600 hover:text-indigo-500"
                    >
                      Change
                    </button>
                  </div>
                  <Button type="submit" loading={checkout.isPending}>
                    Send confirmation code
                  </Button>
                </form>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardHeader
                title={payment.status === 'PENDING' ? 'Confirm with SMS code' : 'Payment'}
                action={
                  <Badge tone={payment.status === 'COMPLETED' ? 'green' : payment.status === 'FAILED' ? 'red' : 'yellow'}>
                    {payment.status.toLowerCase()}
                  </Badge>
                }
              />
              <CardBody className="space-y-5">
                <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-slate-500">Amount</dt>
                    <dd className="font-semibold text-slate-900">{formatMoney(payment.amount, payment.currency)}</dd>
                  </div>
                  {payment.phone && (
                    <div>
                      <dt className="text-slate-500">Phone</dt>
                      <dd className="font-mono text-slate-700">{payment.phone}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-slate-500">Transaction ID</dt>
                    <dd className="break-all font-mono text-xs text-slate-700">{payment.transaction_id}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Created</dt>
                    <dd className="text-slate-700">{formatDateTime(payment.createdAt)}</dd>
                  </div>
                  {payment.processedAt && (
                    <div>
                      <dt className="text-slate-500">Processed</dt>
                      <dd className="text-slate-700">{formatDateTime(payment.processedAt)}</dd>
                    </div>
                  )}
                </dl>

                {payment.status === 'PENDING' ? (
                  <SmsCodeForm
                    key={payment.codeExpiresAt}
                    phone={payment.phone}
                    codeExpiresAt={payment.codeExpiresAt}
                    resendAvailableAt={payment.resendAvailableAt}
                    devCode={payment.devCode}
                    error={codeError}
                    onErrorClear={() => setCodeError(null)}
                    onSubmit={(code) => verify.mutateAsync(code)}
                    onResend={() => resend.mutate()}
                    submitting={verify.isPending}
                    resending={resend.isPending}
                    submitLabel="Confirm payment"
                  >
                    <Button variant="ghost" onClick={startOver} disabled={verify.isPending}>
                      Cancel
                    </Button>
                  </SmsCodeForm>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={startOver}>New top-up</Button>
                    <Link
                      to="/wallet/transactions"
                      className="inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50"
                    >
                      View transactions
                    </Link>
                  </div>
                )}
              </CardBody>
            </Card>
          )}
        </div>

        <div className="lg:col-span-2">
          <WalletCard wallet={wallet.data} isLoading={wallet.isPending} />
        </div>
      </div>
    </>
  )
}
