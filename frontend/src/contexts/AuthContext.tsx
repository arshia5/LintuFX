import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { login as apiLogin } from '../api'
import type { UserRead } from '../types'

interface AuthContextType {
  token: string | null
  user: UserRead | null
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('fx_token'))
  const [user, setUser] = useState<UserRead | null>(() => {
    const u = localStorage.getItem('fx_user')
    return u ? JSON.parse(u) : null
  })

  const login = async (username: string, password: string) => {
    const data = await apiLogin(username, password)
    setToken(data.access_token)
    localStorage.setItem('fx_token', data.access_token)
    setUser(data.user)
    localStorage.setItem('fx_user', JSON.stringify(data.user))
  }

  const logout = () => {
    setToken(null)
    setUser(null)
    localStorage.removeItem('fx_token')
    localStorage.removeItem('fx_user')
  }

  return (
    <AuthContext.Provider value={{ token, user, isAuthenticated: !!token, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
