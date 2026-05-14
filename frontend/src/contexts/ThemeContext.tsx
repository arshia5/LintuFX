import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import type { Theme } from '../types'

const defaultTheme: Theme = {
  primaryColor: '#1a6ee8',
  accentColor: '#0f9d58',
  sidebarColor: '#1e2640',
  fontFamily: 'Inter, sans-serif',
  borderRadius: '8px',
  compactMode: false,
  appName: 'FX Ledger',
}

interface ThemeContextType {
  theme: Theme
  setTheme: (t: Partial<Theme>) => void
}

const ThemeContext = createContext<ThemeContextType | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem('fx_theme')
    return saved ? { ...defaultTheme, ...JSON.parse(saved) } : defaultTheme
  })

  const setTheme = (partial: Partial<Theme>) => {
    setThemeState(prev => {
      const next = { ...prev, ...partial }
      localStorage.setItem('fx_theme', JSON.stringify(next))
      return next
    })
  }

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--color-primary', theme.primaryColor)
    root.style.setProperty('--color-accent', theme.accentColor)
    root.style.setProperty('--color-sidebar', theme.sidebarColor)
    root.style.setProperty('--font-family', theme.fontFamily)
    root.style.setProperty('--border-radius', theme.borderRadius)
    document.body.style.fontFamily = theme.fontFamily
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
