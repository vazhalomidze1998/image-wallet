import axios, { AxiosError } from 'axios'
import type { ApiErrorBody } from '@/types/api'

const TOKEN_KEY = 'iw_token'

/** localStorage can throw (private mode, blocked storage), so every access is guarded. */
export const tokenStorage = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set(token: string) {
    try {
      localStorage.setItem(TOKEN_KEY, token)
    } catch {
      /* session will just not survive a reload */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* ignore */
    }
  },
}

/** Fired when the API rejects the stored token; AuthProvider listens and logs out. */
export const SESSION_EXPIRED_EVENT = 'auth:session-expired'

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: { field: string; message: string }[]

  constructor(status: number, code: string, message: string, details?: ApiError['details']) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export const apiClient = axios.create({
  // "/api" works both with the Vite dev proxy and behind nginx in Docker.
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  timeout: 60_000,
})

apiClient.interceptors.request.use((config) => {
  const token = tokenStorage.get()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorBody | Blob>) => {
    const apiError = await toApiError(error)

    if (apiError.status === 401 && tokenStorage.get()) {
      tokenStorage.clear()
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
    }
    return Promise.reject(apiError)
  },
)

async function toApiError(error: AxiosError<ApiErrorBody | Blob>): Promise<ApiError> {
  if (!error.response) {
    return new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection.')
  }

  let body = error.response.data
  // Blob requests (CSV export) receive JSON errors as a Blob.
  if (body instanceof Blob) {
    try {
      body = JSON.parse(await body.text()) as ApiErrorBody
    } catch {
      body = undefined as unknown as ApiErrorBody
    }
  }

  const err = (body as ApiErrorBody | undefined)?.error
  return new ApiError(
    error.response.status,
    err?.code ?? 'UNKNOWN_ERROR',
    err?.message ?? 'Something went wrong. Please try again.',
    err?.details,
  )
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return 'Something went wrong. Please try again.'
}
