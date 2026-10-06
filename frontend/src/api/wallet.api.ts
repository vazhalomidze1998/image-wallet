import { apiClient } from './client'
import type { ApiSuccess, Paginated } from '@/types/api'
import type { Analytics, Transaction, TransactionFilters, TransferResult, Wallet } from '@/types/wallet'

export interface TransferPayload {
  receiver_email: string
  amount: string
  description?: string
}

/** Drops empty values so they are not sent as "?type=&from=". */
function cleanParams(filters: TransactionFilters) {
  return Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined && v !== ''))
}

function filenameFrom(disposition: string | undefined, fallback: string) {
  return disposition?.match(/filename="([^"]+)"/)?.[1] ?? fallback
}

export const walletApi = {
  async get() {
    const { data } = await apiClient.get<ApiSuccess<Wallet>>('/wallet')
    return data.data
  },

  async transfer(payload: TransferPayload) {
    const { data } = await apiClient.post<ApiSuccess<TransferResult>>('/wallet/transfer', payload)
    return data.data
  },

  async transactions(filters: TransactionFilters) {
    const { data } = await apiClient.get<Paginated<Transaction>>('/wallet/transactions', {
      params: cleanParams(filters),
    })
    return data
  },

  async analytics() {
    const { data } = await apiClient.get<ApiSuccess<Analytics>>('/wallet/analytics')
    return data.data
  },

  /** Downloads the CSV through axios (so the JWT is attached) and saves it. */
  async exportCsv(filters: Omit<TransactionFilters, 'page' | 'limit'>) {
    const response = await apiClient.get<Blob>('/wallet/transactions/export', {
      params: { format: 'csv', ...cleanParams(filters) },
      responseType: 'blob',
    })
    const filename = filenameFrom(response.headers['content-disposition'] as string | undefined, 'transactions.csv')

    const url = URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  },
}
