import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { walletApi } from '@/api/wallet.api'
import type { TransactionFilters } from '@/types/wallet'

export const walletKeys = {
  all: ['wallet'] as const,
  wallet: () => [...walletKeys.all, 'summary'] as const,
  transactions: (filters: TransactionFilters) => [...walletKeys.all, 'transactions', filters] as const,
  analytics: () => [...walletKeys.all, 'analytics'] as const,
}

export function useWallet() {
  return useQuery({ queryKey: walletKeys.wallet(), queryFn: walletApi.get })
}

export function useTransactions(filters: TransactionFilters) {
  return useQuery({
    queryKey: walletKeys.transactions(filters),
    queryFn: () => walletApi.transactions(filters),
    // Keep the current page visible while the next one loads.
    placeholderData: keepPreviousData,
  })
}

export function useAnalytics() {
  return useQuery({ queryKey: walletKeys.analytics(), queryFn: walletApi.analytics })
}

/** After any money movement: balance, history and analytics are all stale. */
export function useInvalidateWallet() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: walletKeys.all })
}
