import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getErrorMessage } from '@/api/client'
import { walletApi } from '@/api/wallet.api'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { Icon } from '@/components/ui/Icon'
import { Input } from '@/components/ui/Input'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import { PageHeader } from '@/components/ui/PageHeader'
import { Pagination } from '@/components/ui/Pagination'
import { TransactionTable } from '@/components/wallet/TransactionTable'
import { useToast } from '@/hooks/useToast'
import { useTransactions, useWallet } from '@/hooks/useWallet'
import type { TransactionType } from '@/types/wallet'

const PAGE_SIZE = 10
const TYPE_OPTIONS: { value: '' | TransactionType; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'INCOME', label: 'Income' },
  { value: 'EXPENSE', label: 'Expense' },
]

export default function TransactionHistory() {
  const toast = useToast()
  const wallet = useWallet()
  // Filters live in the URL, so they survive reloads and can be shared.
  const [params, setParams] = useSearchParams()
  const [exporting, setExporting] = useState(false)

  const type = (params.get('type') ?? '') as '' | TransactionType
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  const rangeInvalid = !!from && !!to && from > to

  const filters = { type: type || undefined, from: from || undefined, to: to || undefined }
  const query = useTransactions({ ...filters, page, limit: PAGE_SIZE })

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    // Any filter change starts again from the first page.
    if (!('page' in changes)) next.delete('page')
    setParams(next, { replace: true })
  }

  const exportCsv = async () => {
    setExporting(true)
    try {
      await walletApi.exportCsv(filters)
      toast.success('CSV downloaded.')
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setExporting(false)
    }
  }

  const hasFilters = !!(type || from || to)

  return (
    <>
      <PageHeader
        title="Transaction history"
        description="All top-ups and transfers of your wallet."
        actions={
          <Button variant="secondary" onClick={exportCsv} loading={exporting} disabled={rangeInvalid}>
            <Icon name="download" className="h-4 w-4" /> Export CSV
          </Button>
        }
      />

      <Card>
        <CardBody>
          <div className="flex flex-wrap items-end gap-4 border-b border-slate-100 pb-4">
            <div role="radiogroup" aria-label="Transaction type" className="inline-flex rounded-lg bg-slate-100 p-1">
              {TYPE_OPTIONS.map((o) => (
                <button
                  key={o.label}
                  type="button"
                  role="radio"
                  aria-checked={type === o.value}
                  onClick={() => update({ type: o.value })}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    type === o.value ? 'bg-surface text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <div className="w-40">
              <Input label="From" type="date" value={from} max={to || undefined} onChange={(e) => update({ from: e.target.value })} />
            </div>
            <div className="w-40">
              <Input
                label="To"
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => update({ to: e.target.value })}
                error={rangeInvalid ? '"To" must be after "From"' : undefined}
              />
            </div>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={() => setParams({}, { replace: true })}>
                Clear filters
              </Button>
            )}
          </div>

          <div className="pt-2">
            {rangeInvalid ? (
              <EmptyState icon="alert" title="Invalid date range" description="Choose a start date before the end date." />
            ) : query.isPending ? (
              <PageLoader />
            ) : query.isError ? (
              <ErrorState message={getErrorMessage(query.error)} onRetry={() => query.refetch()} />
            ) : query.data.data.length === 0 ? (
              <EmptyState
                icon="list"
                title={hasFilters ? 'No matching transactions' : 'No transactions yet'}
                description={hasFilters ? 'Try different filters.' : 'Top up your wallet or receive a transfer.'}
              />
            ) : (
              <>
                <div className={query.isPlaceholderData ? 'opacity-60 transition-opacity' : ''}>
                  <TransactionTable transactions={query.data.data} currency={wallet.data?.currency} />
                </div>
                <Pagination pagination={query.data.pagination} onPageChange={(p) => update({ page: String(p) })} />
              </>
            )}
          </div>
        </CardBody>
      </Card>
    </>
  )
}
