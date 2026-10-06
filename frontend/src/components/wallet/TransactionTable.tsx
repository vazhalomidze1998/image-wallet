import { Badge } from '@/components/ui/Badge'
import type { Transaction, TransactionStatus } from '@/types/wallet'
import { formatDateTime, formatMoney } from '@/utils/format'

const STATUS_TONE: Record<TransactionStatus, 'green' | 'yellow' | 'red'> = {
  COMPLETED: 'green',
  PENDING: 'yellow',
  FAILED: 'red',
}

function describe(tx: Transaction) {
  if (tx.description) return tx.description
  if (tx.category === 'TOP_UP') return 'Wallet top-up'
  if (tx.counterparty) return tx.type === 'EXPENSE' ? `To ${tx.counterparty.username}` : `From ${tx.counterparty.username}`
  return '—'
}

/**
 * Columns: Date, Transaction ID, Type, Amount, Description, Status.
 * `compact` hides the ID and description columns (dashboard widgets).
 */
export function TransactionTable({
  transactions,
  currency = 'USD',
  compact = false,
}: {
  transactions: Transaction[]
  currency?: string
  compact?: boolean
}) {
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead>
          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <th scope="col" className="px-5 py-3">Date</th>
            {!compact && <th scope="col" className="hidden px-3 py-3 md:table-cell">Transaction ID</th>}
            <th scope="col" className="px-3 py-3">Type</th>
            <th scope="col" className="px-3 py-3 text-right">Amount</th>
            <th scope="col" className={`px-3 py-3 ${compact ? 'hidden sm:table-cell' : ''}`}>Description</th>
            <th scope="col" className="px-5 py-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {transactions.map((tx) => {
            const income = tx.type === 'INCOME'
            return (
              <tr key={tx.id} className="hover:bg-slate-50">
                <td className="whitespace-nowrap px-5 py-3 text-slate-600">{formatDateTime(tx.createdAt)}</td>
                {!compact && (
                  <td className="hidden whitespace-nowrap px-3 py-3 font-mono text-xs text-slate-500 md:table-cell" title={tx.transactionId}>
                    {tx.transactionId.length > 18 ? `${tx.transactionId.slice(0, 18)}…` : tx.transactionId}
                  </td>
                )}
                <td className="whitespace-nowrap px-3 py-3">
                  <Badge tone={income ? 'indigo' : 'gray'}>{income ? 'Income' : 'Expense'}</Badge>
                </td>
                <td
                  className={`whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums ${
                    income ? 'text-emerald-700' : 'text-slate-900'
                  }`}
                >
                  {income ? '+' : '−'}
                  {formatMoney(tx.amount, currency)}
                </td>
                <td className={`max-w-56 truncate px-3 py-3 text-slate-600 ${compact ? 'hidden sm:table-cell' : ''}`}>
                  {describe(tx)}
                </td>
                <td className="whitespace-nowrap px-5 py-3">
                  <Badge tone={STATUS_TONE[tx.status]}>{tx.status.toLowerCase()}</Badge>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
