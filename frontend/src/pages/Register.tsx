import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { authApi } from '@/api/auth.api'
import { ApiError, getErrorMessage } from '@/api/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { registerSchema, type RegisterForm } from '@/schemas/auth.schema'
import { applyApiFieldErrors } from '@/utils/formErrors'

export default function Register() {
  const { signIn } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) })

  const signUp = useMutation({
    mutationFn: ({ username, email, password }: RegisterForm) => authApi.register({ username, email, password }),
    onSuccess: (result) => {
      signIn(result)
      toast.success('Account created. Your wallet is ready!')
      navigate('/dashboard', { replace: true })
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'EMAIL_TAKEN') {
        setError('email', { message: error.message })
      } else if (error instanceof ApiError && error.code === 'USERNAME_TAKEN') {
        setError('username', { message: error.message })
      } else {
        applyApiFieldErrors(error, setError)
      }
    },
  })

  const conflictHandled =
    signUp.error instanceof ApiError && ['EMAIL_TAKEN', 'USERNAME_TAKEN', 'VALIDATION_ERROR'].includes(signUp.error.code)

  return (
    <>
      <h1 className="text-xl font-semibold text-slate-900">Create account</h1>
      <p className="mt-1 text-sm text-slate-500">A wallet is created for you automatically.</p>

      <form onSubmit={handleSubmit((values) => signUp.mutate(values))} className="mt-6 space-y-4" noValidate>
        {signUp.isError && !conflictHandled && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {getErrorMessage(signUp.error)}
          </p>
        )}
        <Input label="Username" autoComplete="username" error={errors.username?.message} {...register('username')} />
        <Input label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters"
          error={errors.password?.message}
          {...register('password')}
        />
        <Input
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
        <Button type="submit" className="w-full" loading={signUp.isPending}>
          Create account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        Already registered?{' '}
        <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
          Sign in
        </Link>
      </p>
    </>
  )
}
