import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { authApi } from '@/api/auth.api'
import { getErrorMessage } from '@/api/client'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/hooks/useAuth'
import { loginSchema, type LoginForm } from '@/schemas/auth.schema'

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [showPassword, setShowPassword] = useState(false)
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/dashboard'

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })

  const login = useMutation({
    mutationFn: authApi.login,
    onSuccess: (result) => {
      signIn(result)
      navigate(from, { replace: true })
    },
  })

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Welcome back</h1>
      <p className="mt-1.5 text-sm text-slate-500">Sign in to your account to continue.</p>

      <form onSubmit={handleSubmit((values) => login.mutate(values))} className="mt-8 space-y-5" noValidate>
        {login.isError && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700 ring-1 ring-rose-100">
            <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
            {getErrorMessage(login.error)}
          </p>
        )}
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          leading={<Icon name="mail" className="h-5 w-5" />}
          className="py-2.5"
          error={errors.email?.message}
          {...register('email')}
        />
        <Input
          label="Password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          placeholder="••••••••"
          leading={<Icon name="lock" className="h-5 w-5" />}
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              <Icon name={showPassword ? 'eyeSlash' : 'eye'} className="h-5 w-5" />
            </button>
          }
          className="py-2.5"
          error={errors.password?.message}
          {...register('password')}
        />
        <Button
          type="submit"
          className="group w-full bg-gradient-to-r from-indigo-600 to-violet-600 py-2.5 shadow-lg shadow-indigo-500/25 hover:from-indigo-500 hover:to-violet-500"
          loading={login.isPending}
        >
          Sign in
          {!login.isPending && <Icon name="arrowRight" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        New to ImageWallet?
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <Link
        to="/register"
        className="flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-300 transition-colors hover:bg-slate-50"
      >
        Create an account
      </Link>
    </>
  )
}
