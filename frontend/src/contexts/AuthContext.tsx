import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { login as apiLogin, refreshToken as apiRefresh } from '../api'
import type { UserRead } from '../types'

interface AuthContextType {
  token: string | null
  user: UserRead | null
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

// Silently renew the access token while the app is open so active staff are not
// bounced to the login screen when the token expires.
const REFRESH_INTERVAL_MS = 20 * 60 * 1000 // 20 minutes

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('fx_token'))
  const [user, setUser] = useState<UserRead | null>(() => {
    const u = localStorage.getItem('fx_user')
    return u ? JSON.parse(u) : null
  })

  const applySession = useCallback((accessToken: string, u: UserRead) => {
    setToken(accessToken)
    localStorage.setItem('fx_token', accessToken)
    setUser(u)
    localStorage.setItem('fx_user', JSON.stringify(u))
  }, [])

  const login = async (username: string, password: string) => {
    const data = await apiLogin(username, password)
    applySession(data.access_token, data.user)
  }

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
    localStorage.removeItem('fx_token')
    localStorage.removeItem('fx_user')
  }, [])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    const doRefresh = async () => {
      try {
        const data = await apiRefresh()
        if (!cancelled) applySession(data.access_token, data.user)
      } catch {
        // Expired-token 401s are handled by the axios interceptor (redirect to
        // login). Ignore transient/other failures and try again next tick.
      }
    }
    const intervalId = window.setInterval(doRefresh, REFRESH_INTERVAL_MS)
    const onFocus = () => doRefresh()
    window.addEventListener('focus', onFocus)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      window.removeEventListener('focus', onFocus)
    }
  }, [token, applySession])

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
