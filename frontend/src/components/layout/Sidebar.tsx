import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Users, Wallet, ShoppingCart,
  ArrowLeftRight, BookOpen, BarChart3, Settings,
  Coins, ChevronLeft, ChevronRight, LogOut, ScrollText,
  Menu, X,
} from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { useEffect, useState } from 'react'

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/orders', label: 'Orders', icon: ShoppingCart },
  { to: '/journal-entries', label: 'Journal Entries', icon: BookOpen },
  { to: '/house-exchanges', label: 'House Exchanges', icon: ArrowLeftRight },
  { to: '/wallets', label: 'Wallets', icon: Wallet },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/currencies', label: 'Currencies', icon: Coins },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/event-logs', label: 'Event Logs', icon: ScrollText },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export default function Sidebar() {
  const { theme } = useTheme()
  const { user, logout } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!mobileOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false)
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [mobileOpen])

  const activeItem = nav.find(item =>
    item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to)
  )

  const handleLogout = () => {
    setMobileOpen(false)
    logout()
  }

  const navItems = (isMobile = false) => (
    <nav className="flex-1 py-3 overflow-y-auto">
      {nav.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm transition-all mb-0.5 ${
              isActive
                ? 'bg-white/15 text-white font-medium'
                : 'text-white/60 hover:bg-white/10 hover:text-white'
            } ${isMobile ? 'min-h-11' : ''}`
          }
          title={!isMobile && collapsed ? label : undefined}
        >
          <Icon size={17} className="shrink-0" />
          {(isMobile || !collapsed) && <span className="truncate">{label}</span>}
        </NavLink>
      ))}
    </nav>
  )

  return (
    <>
      <header
        className="fixed inset-x-0 top-0 z-[60] flex h-16 items-center justify-between border-b border-white/10 px-4 shadow-lg md:hidden"
        style={{ background: theme.sidebarColor }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[var(--color-primary)] flex items-center justify-center text-white font-bold text-sm shrink-0">
            FX
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{theme.appName}</p>
            <p className="truncate text-xs text-white/55">{activeItem?.label ?? 'Menu'}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-white/80 transition hover:bg-white/10 hover:text-white"
          aria-label="Open navigation menu"
        >
          <Menu size={22} />
        </button>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-[70] md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/45 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation menu"
          />
          <aside
            className="absolute inset-y-0 left-0 flex w-[min(86vw,320px)] flex-col shadow-2xl"
            style={{ background: theme.sidebarColor }}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-4 border-b border-white/10">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-[var(--color-primary)] flex items-center justify-center text-white font-bold text-sm shrink-0">
                  FX
                </div>
                <span className="truncate text-white font-semibold text-sm">{theme.appName}</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white"
                aria-label="Close navigation menu"
              >
                <X size={20} />
              </button>
            </div>

            {navItems(true)}

            <div className="border-t border-white/10 p-3 space-y-1">
              {user && (
                <div className="px-3 py-2 text-xs text-white/50 truncate">
                  Signed in as <span className="text-white/80 font-medium">{user.username}</span>
                </div>
              )}
              <button
                onClick={handleLogout}
                className="flex min-h-11 items-center gap-3 w-full px-3 py-2 rounded-lg text-white/60 hover:bg-white/10 hover:text-white transition text-sm"
              >
                <LogOut size={16} className="shrink-0" />
                Log out
              </button>
            </div>
          </aside>
        </div>
      )}

      <aside
        className="hidden md:flex flex-col h-screen sticky top-0 shrink-0 transition-all duration-200"
        style={{ width: collapsed ? 60 : 220, background: theme.sidebarColor }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-5 border-b border-white/10">
          <div className="w-8 h-8 rounded-lg bg-[var(--color-primary)] flex items-center justify-center text-white font-bold text-sm shrink-0">
            FX
          </div>
          {!collapsed && (
            <span className="text-white font-semibold text-sm truncate">{theme.appName}</span>
          )}
        </div>

        {/* Nav */}
        {navItems()}

        {/* Footer */}
        <div className="border-t border-white/10 p-3 space-y-1">
          {!collapsed && user && (
            <div className="px-3 py-2 text-xs text-white/50 truncate">
              Signed in as <span className="text-white/80 font-medium">{user.username}</span>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-white/60 hover:bg-white/10 hover:text-white transition text-sm"
            title={collapsed ? 'Logout' : undefined}
          >
            <LogOut size={16} className="shrink-0" />
            {!collapsed && 'Log out'}
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-white/40 hover:bg-white/10 hover:text-white/70 transition text-sm"
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            {!collapsed && <span className="text-xs">Collapse</span>}
          </button>
        </div>
      </aside>
    </>
  )
}
