import { apiClient } from './client'
import type { ApiSuccess } from '@/types/api'
import type { Payment } from '@/types/wallet'

export const paymentsApi = {
  /** Creates a pending top-up and texts a 6-digit confirmation code to the account's verified phone. */
  async checkout(amount: string) {
    const { data } = await apiClient.post<ApiSuccess<Payment>>('/payments/checkout', { amount })
    return data.data
  },

  /** Confirms the top-up with the SMS code; the wallet is credited on success. */
  async verify(transactionId: string, code: string) {
    const { data } = await apiClient.post<ApiSuccess<Payment>>(`/payments/${transactionId}/verify`, { code })
    return data.data
  },

  async resendCode(transactionId: string) {
    const { data } = await apiClient.post<ApiSuccess<Payment>>(`/payments/${transactionId}/resend-code`)
    return data.data
  },
}
