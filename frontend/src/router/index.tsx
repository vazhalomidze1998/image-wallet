import { lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import { AuthLayout } from '@/layouts/AuthLayout'
import { DashboardLayout } from '@/layouts/DashboardLayout'
import { ProtectedRoute, PublicOnlyRoute } from './ProtectedRoute'

// Each page is its own chunk, so the first load only downloads what it shows.
const Login = lazy(() => import('@/pages/Login'))
const Register = lazy(() => import('@/pages/Register'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const ImageGallery = lazy(() => import('@/pages/ImageGallery'))
const ImageUpload = lazy(() => import('@/pages/ImageUpload'))
const ImageDetails = lazy(() => import('@/pages/ImageDetails'))
const ImageEditor = lazy(() => import('@/pages/ImageEditor'))
const Wallet = lazy(() => import('@/pages/Wallet'))
const TopUp = lazy(() => import('@/pages/TopUp'))
const Transfer = lazy(() => import('@/pages/Transfer'))
const TransactionHistory = lazy(() => import('@/pages/TransactionHistory'))
const Analytics = lazy(() => import('@/pages/Analytics'))
const NotFound = lazy(() => import('@/pages/NotFound'))

const page = (element: ReactNode) => <Suspense fallback={<PageLoader />}>{element}</Suspense>

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/dashboard" replace /> },
  {
    element: <PublicOnlyRoute />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          { path: '/login', element: page(<Login />) },
          { path: '/register', element: page(<Register />) },
        ],
      },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <DashboardLayout />,
        children: [
          { path: '/dashboard', element: page(<Dashboard />) },
          { path: '/images', element: page(<ImageGallery />) },
          { path: '/images/upload', element: page(<ImageUpload />) },
          { path: '/images/:id', element: page(<ImageDetails />) },
          { path: '/images/:id/edit', element: page(<ImageEditor />) },
          { path: '/wallet', element: page(<Wallet />) },
          { path: '/wallet/top-up', element: page(<TopUp />) },
          { path: '/wallet/transfer', element: page(<Transfer />) },
          { path: '/wallet/transactions', element: page(<TransactionHistory />) },
          { path: '/wallet/analytics', element: page(<Analytics />) },
        ],
      },
    ],
  },
  { path: '*', element: page(<NotFound />) },
])
