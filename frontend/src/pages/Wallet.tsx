import { Link } from 'react-router-dom'
import { getErrorMessage } from '@/api/client'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import { PageHeader } from '@/components/ui/PageHeader'
import { AnalyticsCard } from '@/components/wallet/AnalyticsCard'
import { TransactionTable } from '@/components/wallet/TransactionTable'
import { WalletCard } from '@/components/wallet/WalletCard'
import { useAnalytics, useTransactions, useWallet } from '@/hooks/useWallet'
import { formatMoney } from '@/utils/format'

export default function Wallet() {
  const wallet = useWallet()
  const analytics = useAnalytics()
  const recent = useTransactions({ page: 1, limit: 10 })
  const currency = wallet.data?.currency ?? 'USD'

  if (wallet.isError) {
    return <ErrorState message={getErrorMessage(wallet.error)} onRetry={() => wallet.refetch()} />
  }

  return (
    <>
      <PageHeader title="Wallet" description="Your balance and latest activity." />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <WalletCard wallet={wallet.data} isLoading={wallet.isPending} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
          <AnalyticsCard
            label="Income this month"
            icon="arrowDown"
            tone="blue"
            isLoading={analytics.isPending}
            value={analytics.data && formatMoney(analytics.data.totalIncome, currency)}
            hint="Completed top-ups and received transfers"
          />
          <AnalyticsCard
            label="Expenses this month"
            icon="arrowUp"
            tone="orange"
            isLoading={analytics.isPending}
            value={analytics.data && formatMoney(analytics.data.totalExpense, currency)}
            hint="Sent transfers"
          />
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Recent transactions"
          action={
            <Link to="/wallet/transactions" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
              Full history →
            </Link>
          }
        />
        <CardBody>
          {recent.isPending ? (
            <PageLoader />
          ) : recent.isError ? (
            <ErrorState message={getErrorMessage(recent.error)} onRetry={() => recent.refetch()} />
          ) : recent.data.data.length === 0 ? (
            <EmptyState icon="wallet" title="No transactions yet" description="Top up your wallet or receive a transfer." />
          ) : (
            <TransactionTable transactions={recent.data.data} currency={currency} />
          )}
        </CardBody>
      </Card>
    </>
  )
}
