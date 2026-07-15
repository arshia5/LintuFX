import { StrictMode } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import Layout from './components/layout/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Currencies from './pages/Currencies'
import Users from './pages/Users'
import Wallets from './pages/Wallets'
import Orders from './pages/Orders'
import UserDetail from './pages/UserDetail'
import HouseExchanges from './pages/HouseExchanges'
import Expenses from './pages/Expenses'
import JournalEntries from './pages/JournalEntries'
import Reports from './pages/Reports'
import EventLogs from './pages/EventLogs'
import Settings from './pages/Settings'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
})

function DeveloperOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  if (user?.role !== 'DEVELOPER') return <Navigate to="/" replace />
  return <>{children}</>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route element={<Layout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/currencies" element={<Currencies />} />
                <Route path="/users" element={<Users />} />
                <Route path="/users/:id" element={<UserDetail />} />
                <Route path="/wallets" element={<Wallets />} />
                <Route path="/orders" element={<Orders />} />
                <Route path="/house-exchanges" element={<HouseExchanges />} />
                <Route path="/expenses" element={<Expenses />} />
                <Route path="/journal-entries" element={<JournalEntries />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/event-logs" element={<DeveloperOnly><EventLogs /></DeveloperOnly>} />
                <Route path="/settings" element={<DeveloperOnly><Settings /></DeveloperOnly>} />
              </Route>
            </Routes>
          </BrowserRouter>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>
)
