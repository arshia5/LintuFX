import { Outlet, Navigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import { useAuth } from '../../contexts/AuthContext'

export default function Layout() {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-auto pt-16 md:pt-0">
        <div className="max-w-7xl mx-auto px-4 py-5 sm:px-6 sm:py-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
