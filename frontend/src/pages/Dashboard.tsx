import { Link } from 'react-router-dom'
import { getErrorMessage } from '@/api/client'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { Icon } from '@/components/ui/Icon'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import { PageHeader } from '@/components/ui/PageHeader'
import { AnalyticsCard } from '@/components/wallet/AnalyticsCard'
import { TransactionTable } from '@/components/wallet/TransactionTable'
import { useAuth } from '@/hooks/useAuth'
import { useImages } from '@/hooks/useImages'
import { useAnalytics, useTransactions, useWallet } from '@/hooks/useWallet'
import { formatMoney } from '@/utils/format'

export default function Dashboard() {
  const { user } = useAuth()
  const wallet = useWallet()
  const analytics = useAnalytics()
  const images = useImages(1, 1)
  const recent = useTransactions({ page: 1, limit: 5 })

  const currency = wallet.data?.currency ?? 'USD'
  const month = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  return (
    <>
      <PageHeader title={`Hello, ${user?.username ?? ''}`} description={`Here's your overview for ${month}.`} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AnalyticsCard
          label="Wallet balance"
          icon="wallet"
          tone="indigo"
          isLoading={wallet.isPending}
          value={wallet.data && formatMoney(wallet.data.balance, currency)}
        />
        <AnalyticsCard
          label="Income this month"
          icon="arrowDown"
          tone="blue"
          isLoading={analytics.isPending}
          value={analytics.data && formatMoney(analytics.data.totalIncome, currency)}
        />
        <AnalyticsCard
          label="Expenses this month"
          icon="arrowUp"
          tone="orange"
          isLoading={analytics.isPending}
          value={analytics.data && formatMoney(analytics.data.totalExpense, currency)}
        />
        <AnalyticsCard
          label="Uploaded images"
          icon="image"
          isLoading={images.isPending}
          value={images.data ? String(images.data.pagination.total) : undefined}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Recent transactions"
            action={
              <Link to="/wallet/transactions" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
                View all
              </Link>
            }
          />
          <CardBody>
            {recent.isPending ? (
              <PageLoader />
            ) : recent.isError ? (
              <ErrorState message={getErrorMessage(recent.error)} onRetry={() => recent.refetch()} />
            ) : recent.data.data.length === 0 ? (
              <EmptyState
                icon="list"
                title="No transactions yet"
                description="Top up your wallet to get started."
                action={
                  <Link to="/wallet/top-up" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
                    Top up now →
                  </Link>
                }
              />
            ) : (
              <TransactionTable transactions={recent.data.data} currency={currency} compact />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Quick actions" />
          <CardBody className="grid gap-2">
            {[
              { to: '/images/upload', icon: 'upload' as const, label: 'Upload an image' },
              { to: '/images', icon: 'image' as const, label: 'Open gallery' },
              { to: '/wallet/top-up', icon: 'plus' as const, label: 'Top up wallet' },
              { to: '/wallet/transfer', icon: 'send' as const, label: 'Send money' },
              { to: '/wallet/analytics', icon: 'chart' as const, label: 'View analytics' },
            ].map((a) => (
              <Link
                key={a.to}
                to={a.to}
                className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
              >
                <Icon name={a.icon} className="h-5 w-5" />
                {a.label}
              </Link>
            ))}
          </CardBody>
        </Card>
      </div>
    </>
  )
}
