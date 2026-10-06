import type { User } from './api'

export type TransactionType = 'INCOME' | 'EXPENSE'
export type TransactionStatus = 'PENDING' | 'COMPLETED' | 'FAILED'
export type TransactionCategory = 'TOP_UP' | 'TRANSFER'

export interface Wallet {
  walletId: string
  /** Decimal string, e.g. "100.00". */
  balance: string
  currency: string
  user: Pick<User, 'id' | 'username' | 'email'>
}

export interface Transaction {
  id: string
  transactionId: string
  type: TransactionType
  category: TransactionCategory
  status: TransactionStatus
  amount: string
  description: string | null
  counterparty: { username: string; email: string } | null
  createdAt: string
}

export interface TransactionFilters {
  page?: number
  limit?: number
  type?: TransactionType
  from?: string
  to?: string
}

export interface MonthlyTrendPoint {
  month: string
  income: string
  expense: string
  transactionCount: number
}

export interface Analytics {
  period: { from: string; to: string }
  currency: string
  totalIncome: string
  totalExpense: string
  net: string
  balance: string
  transactionCount: number
  topTransactions: Transaction[]
  monthlyTrend: MonthlyTrendPoint[]
}

export interface Payment {
  transaction_id: string
  amount: string
  currency: string
  status: TransactionStatus
  createdAt: string
  processedAt: string | null
  /** Masked number the confirmation code was sent to, e.g. "+995 ••• ••• 456". */
  phone: string | null
  codeExpiresAt: string | null
  /** When a new code may be requested; null once no more codes can be sent. */
  resendAvailableAt: string | null
  /** Only returned when the backend runs without an SMS provider (development). */
  devCode?: string
  alreadyProcessed?: boolean
}

export interface TransferResult {
  transferId: string
  amount: string
  currency: string
  description: string | null
  receiver: { username: string; email: string }
  balance: string
  status: 'COMPLETED'
}
