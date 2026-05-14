import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Users, Wallet, ShoppingCart,
  ArrowLeftRight, BookOpen, BarChart3, Settings,
  Coins, ChevronLeft, ChevronRight, LogOut, ScrollText,
} from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { useState } from 'react'

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

  return (
    <aside
      className="flex flex-col h-screen sticky top-0 shrink-0 transition-all duration-200"
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
              }`
            }
            title={collapsed ? label : undefined}
          >
            <Icon size={17} className="shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/10 p-3 space-y-1">
        {!collapsed && user && (
          <div className="px-3 py-2 text-xs text-white/50 truncate">
            Signed in as <span className="text-white/80 font-medium">{user.username}</span>
          </div>
        )}
        <button
          onClick={logout}
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
  )
}
