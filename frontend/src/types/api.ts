export interface ApiSuccess<T> {
  success: true
  data: T
}

export interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface Paginated<T> {
  success: true
  data: T[]
  pagination: Pagination
}

export interface ApiErrorBody {
  success: false
  error: {
    code: string
    message: string
    details?: { field: string; message: string }[]
  }
}

export interface User {
  id: string
  username: string
  email: string
  /** Masked verified number, e.g. "+995 ••• ••• 456"; null until verified. */
  phone: string | null
  phoneVerified: boolean
  createdAt: string
}

/** A code sent to a number that is not verified yet. */
export interface PhoneVerification {
  /** Masked number the code was sent to. */
  phone: string
  codeExpiresAt: string
  resendAvailableAt: string
  /** Only returned when the backend runs without an SMS provider (development). */
  devCode?: string
}

export interface AuthResult {
  user: User
  token: string
}
