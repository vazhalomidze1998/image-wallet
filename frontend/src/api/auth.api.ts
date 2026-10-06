import { apiClient } from './client'
import type { ApiSuccess, AuthResult, PhoneVerification, User } from '@/types/api'

export interface RegisterPayload {
  username: string
  email: string
  password: string
}

export interface LoginPayload {
  email: string
  password: string
}

export const authApi = {
  async register(payload: RegisterPayload) {
    const { data } = await apiClient.post<ApiSuccess<AuthResult>>('/auth/register', payload)
    return data.data
  },

  async login(payload: LoginPayload) {
    const { data } = await apiClient.post<ApiSuccess<AuthResult>>('/auth/login', payload)
    return data.data
  },

  async me() {
    const { data } = await apiClient.get<ApiSuccess<{ user: User }>>('/auth/me')
    return data.data.user
  },

  /** Texts a 6-digit code to `phone`; the number is saved on the account once verified. */
  async sendPhoneCode(phone: string) {
    const { data } = await apiClient.post<ApiSuccess<PhoneVerification>>('/auth/phone', { phone })
    return data.data
  },

  async verifyPhone(code: string) {
    const { data } = await apiClient.post<ApiSuccess<{ user: User }>>('/auth/phone/verify', { code })
    return data.data.user
  },
}
