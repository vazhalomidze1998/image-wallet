import { getErrorMessage } from '@/api/client'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import { PageHeader } from '@/components/ui/PageHeader'
import { AnalyticsCard } from '@/components/wallet/AnalyticsCard'
import { IncomeExpenseChart, MonthlyTrendChart, SERIES } from '@/components/wallet/Charts'
import { TransactionTable } from '@/components/wallet/TransactionTable'
import { useAnalytics } from '@/hooks/useWallet'
import { formatMoney, formatMonth } from '@/utils/format'

export default function Analytics() {
  const analytics = useAnalytics()

  if (analytics.isPending) return <PageLoader />
  if (analytics.isError) {
    return <ErrorState message={getErrorMessage(analytics.error)} onRetry={() => analytics.refetch()} />
  }

  const a = analytics.data
  const month = new Date(a.period.from).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const hasTrend = a.monthlyTrend.some((m) => m.transactionCount > 0)

  return (
    <>
      <PageHeader title="Analytics" description={`${month} · completed transactions only`} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AnalyticsCard label="Total income" icon="arrowDown" tone="blue" value={formatMoney(a.totalIncome, a.currency)} />
        <AnalyticsCard label="Total expense" icon="arrowUp" tone="orange" value={formatMoney(a.totalExpense, a.currency)} />
        <AnalyticsCard label="Current balance" icon="wallet" tone="indigo" value={formatMoney(a.balance, a.currency)} />
        <AnalyticsCard
          label="Transactions"
          icon="list"
          value={String(a.transactionCount)}
          hint={`Net this month: ${formatMoney(a.net, a.currency)}`}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader title="Income vs expense" description={month} />
          <CardBody>
            {a.transactionCount === 0 ? (
              <EmptyState icon="chart" title="No completed transactions this month" />
            ) : (
              <IncomeExpenseChart income={a.totalIncome} expense={a.totalExpense} currency={a.currency} />
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader title="Monthly trend" description="Last 6 months" />
          <CardBody>
            {!hasTrend ? (
              <EmptyState icon="chart" title="Not enough data yet" />
            ) : (
              <>
                <MonthlyTrendChart data={a.monthlyTrend} currency={a.currency} />
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-slate-500 hover:text-slate-700">Show as table</summary>
                  <table className="mt-2 w-full text-left">
                    <thead className="text-xs uppercase text-slate-500">
                      <tr>
                        <th scope="col" className="py-1.5">Month</th>
                        <th scope="col" className="py-1.5 text-right">
                          <span className="mr-1.5 inline-block h-2 w-2 rounded-sm" style={{ background: SERIES.income.color }} />
                          Income
                        </th>
                        <th scope="col" className="py-1.5 text-right">
                          <span className="mr-1.5 inline-block h-2 w-2 rounded-sm" style={{ background: SERIES.expense.color }} />
                          Expense
                        </th>
                        <th scope="col" className="py-1.5 text-right">Count</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 tabular-nums text-slate-700">
                      {a.monthlyTrend.map((m) => (
                        <tr key={m.month}>
                          <td className="py-1.5">{formatMonth(m.month)}</td>
                          <td className="py-1.5 text-right">{formatMoney(m.income, a.currency)}</td>
                          <td className="py-1.5 text-right">{formatMoney(m.expense, a.currency)}</td>
                          <td className="py-1.5 text-right">{m.transactionCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </>
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Top transactions" description="Largest completed transactions this month" />
        <CardBody>
          {a.topTransactions.length === 0 ? (
            <EmptyState icon="list" title="No transactions this month" />
          ) : (
            <TransactionTable transactions={a.topTransactions} currency={a.currency} compact />
          )}
        </CardBody>
      </Card>
    </>
  )
}
