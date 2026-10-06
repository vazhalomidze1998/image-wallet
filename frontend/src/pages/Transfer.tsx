import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { ApiError, getErrorMessage } from '@/api/client'
import { walletApi } from '@/api/wallet.api'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { ConfirmDialog } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { WalletCard } from '@/components/wallet/WalletCard'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { useInvalidateWallet, useWallet } from '@/hooks/useWallet'
import { makeTransferSchema, type TransferForm } from '@/schemas/wallet.schema'
import type { TransferResult } from '@/types/wallet'
import { formatMoney } from '@/utils/format'
import { applyApiFieldErrors } from '@/utils/formErrors'

export default function Transfer() {
  const { user } = useAuth()
  const toast = useToast()
  const wallet = useWallet()
  const invalidateWallet = useInvalidateWallet()
  const [pending, setPending] = useState<TransferForm | null>(null)
  const [result, setResult] = useState<TransferResult | null>(null)

  const schema = useMemo(() => makeTransferSchema(user?.email), [user?.email])
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<TransferForm>({
    resolver: zodResolver(schema),
    defaultValues: { receiver_email: '', amount: '', description: '' },
  })

  const currency = wallet.data?.currency ?? 'USD'

  const transfer = useMutation({
    mutationFn: (values: TransferForm) =>
      walletApi.transfer({
        receiver_email: values.receiver_email,
        amount: values.amount,
        description: values.description || undefined,
      }),
    onSuccess: (res) => {
      setPending(null)
      setResult(res)
      reset()
      invalidateWallet()
      toast.success(`Sent ${formatMoney(res.amount, res.currency)} to ${res.receiver.username}.`)
    },
    onError: (error) => {
      setPending(null)
      if (error instanceof ApiError) {
        if (error.code === 'INSUFFICIENT_FUNDS') return setError('amount', { message: 'Insufficient balance' })
        if (error.code === 'RECEIVER_NOT_FOUND')
          return setError('receiver_email', { message: 'No user with this email' })
        if (error.code === 'SELF_TRANSFER') return setError('receiver_email', { message: error.message })
      }
      if (!applyApiFieldErrors(error, setError)) toast.error(getErrorMessage(error))
    },
  })

  return (
    <>
      <PageHeader title="Transfer" description="Send money to another user instantly." />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          {result && (
            <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <p className="font-medium">
                {formatMoney(result.amount, result.currency)} sent to {result.receiver.username} ({result.receiver.email}).
              </p>
              <p className="mt-1">
                New balance: <span className="font-semibold">{formatMoney(result.balance, result.currency)}</span> · Reference{' '}
                <span className="font-mono text-xs">{result.transferId}</span>
              </p>
            </div>
          )}

          <Card>
            <CardHeader title="Transfer details" />
            <CardBody>
              <form onSubmit={handleSubmit((values) => setPending(values))} className="space-y-4" noValidate>
                <Input
                  label="Receiver email"
                  type="email"
                  placeholder="user2@example.com"
                  error={errors.receiver_email?.message}
                  {...register('receiver_email')}
                />
                <Input
                  label={`Amount (${currency})`}
                  inputMode="decimal"
                  placeholder="50.00"
                  error={errors.amount?.message}
                  hint={wallet.data && `Available: ${formatMoney(wallet.data.balance, currency)}`}
                  {...register('amount')}
                />
                <Input
                  label="Description (optional)"
                  placeholder="Dinner repayment"
                  maxLength={255}
                  error={errors.description?.message}
                  {...register('description')}
                />
                <Button type="submit">Review transfer</Button>
              </form>
            </CardBody>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <WalletCard wallet={wallet.data} isLoading={wallet.isPending} />
        </div>
      </div>

      <ConfirmDialog
        open={!!pending}
        title="Confirm transfer"
        confirmLabel="Send money"
        loading={transfer.isPending}
        onCancel={() => setPending(null)}
        onConfirm={() => pending && transfer.mutate(pending)}
        message={
          pending && (
            <dl className="space-y-2">
              <div className="flex justify-between gap-4">
                <dt>To</dt>
                <dd className="font-medium text-slate-900">{pending.receiver_email}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Amount</dt>
                <dd className="font-semibold text-slate-900">{formatMoney(pending.amount, currency)}</dd>
              </div>
              {pending.description && (
                <div className="flex justify-between gap-4">
                  <dt>Description</dt>
                  <dd className="text-right text-slate-900">{pending.description}</dd>
                </div>
              )}
            </dl>
          )
        }
      />
    </>
  )
}
