import { RouterProvider } from 'react-router-dom'
import { router } from '@/router'
import { AuthProvider } from '@/store/AuthContext'
import { ToastProvider } from '@/store/ToastContext'

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ToastProvider>
  )
}
