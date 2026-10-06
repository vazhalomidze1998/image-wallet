import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-16 text-center">
      <p className="text-sm font-semibold text-indigo-600">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Page not found</h1>
      <p className="mt-2 text-sm text-slate-500">The page you are looking for does not exist.</p>
      <Link to="/dashboard" className="mt-6 text-sm font-medium text-indigo-600 hover:text-indigo-500">
        Go to dashboard →
      </Link>
    </div>
  )
}
