import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/api/auth.api'
import { SESSION_EXPIRED_EVENT, tokenStorage } from '@/api/client'
import type { AuthResult, User } from '@/types/api'

export interface AuthContextValue {
  user: User | null
  isAuthenticated: boolean
  /** True while a stored token is being validated on startup. */
  isLoading: boolean
  signIn: (result: AuthResult) => void
  signOut: () => void
  /** Replaces the cached current user (e.g. after verifying the phone). */
  updateUser: (user: User) => void
  /** Re-fetches the current user from the API. */
  refreshUser: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [token, setToken] = useState<string | null>(() => tokenStorage.get())

  const me = useQuery({
    queryKey: ['auth', 'me', token],
    queryFn: authApi.me,
    enabled: !!token,
    retry: false,
    staleTime: Infinity,
  })

  const signIn = useCallback(
    (result: AuthResult) => {
      tokenStorage.set(result.token)
      queryClient.setQueryData(['auth', 'me', result.token], result.user)
      setToken(result.token)
    },
    [queryClient],
  )

  const updateUser = useCallback(
    (user: User) => queryClient.setQueryData(['auth', 'me', token], user),
    [queryClient, token],
  )

  const refreshUser = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
  }, [queryClient])

  const signOut = useCallback(() => {
    tokenStorage.clear()
    setToken(null)
    // Never show the previous user's cached data to the next one.
    queryClient.clear()
  }, [queryClient])

  useEffect(() => {
    window.addEventListener(SESSION_EXPIRED_EVENT, signOut)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, signOut)
  }, [signOut])

  const value = useMemo<AuthContextValue>(
    () => ({
      user: token ? (me.data ?? null) : null,
      isAuthenticated: !!token && !!me.data,
      isLoading: !!token && me.isPending,
      signIn,
      signOut,
      updateUser,
      refreshUser,
    }),
    [token, me.data, me.isPending, signIn, signOut, updateUser, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
