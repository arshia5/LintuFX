import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import {
  ShoppingCart, ArrowLeftRight, BookOpen, Users,
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle,
  ChevronDown, ChevronUp, ChevronsUpDown,
} from 'lucide-react'
import { listOrders, listHouseExchanges, listJournalEntries, listUsers, getClientBalances, listWallets, listCurrencies } from '../api'
import { PageHeader, StatCard, Card, Badge, Modal } from '../components/ui'
import type { OrderRead, ClientBalanceReport, WalletRead, CurrencyRead, UserRead } from '../types'
import { fmtDateLabel } from '../utils/date'
import { formatCurrencyNumber } from '../utils/number'

const COLORS = ['#1a6ee8', '#0f9d58', '#f4b400', '#db4437', '#7b1fa2', '#00acc1']

const fmtDate = fmtDateLabel
type HoldingsSortKey = 'currency' | 'total' | 'house' | 'clients' | 'walletCount'
type HoldingsRow = {
  ticker: string
  total: number
  house: number
  clients: number
  walletCount: number
  currency?: CurrencyRead
}

export default function Dashboard() {
  const [holdingsSortKey, setHoldingsSortKey] = useState<HoldingsSortKey>('total')
  const [holdingsSortDir, setHoldingsSortDir] = useState<'asc' | 'desc'>('desc')
  const [selectedCurrency, setSelectedCurrency] = useState<string | null>(null)
  const { data: orders = [], isLoading: ordersLoading } = useQuery({ queryKey: ['orders'], queryFn: () => listOrders() })
  const { data: exchanges = [] } = useQuery({ queryKey: ['house-exchanges'], queryFn: () => listHouseExchanges() })
  const { data: journals = [] } = useQuery({ queryKey: ['journal-entries'], queryFn: () => listJournalEntries() })
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: () => listUsers() })
  const { data: balances = [] } = useQuery({ queryKey: ['client-balances-all'], queryFn: () => getClientBalances({ include_zero: false }) })
  const { data: wallets = [] } = useQuery({ queryKey: ['wallets'], queryFn: () => listWallets() })
  const { data: currencies = [] } = useQuery({ queryKey: ['currencies'], queryFn: () => listCurrencies() })

  const activeOrders = orders.filter((o: OrderRead) => !o.voided_at)
  const voidedOrders = orders.filter((o: OrderRead) => o.voided_at)
  const clientCount = users.filter((u: { role: string }) => u.role === 'CLIENT').length
  const houseCount = users.filter((u: { role: string }) => u.role === 'HOUSE').length

  // Orders by type
  const ordersByType = [
    { name: 'BUY', value: activeOrders.filter((o: OrderRead) => o.order_type === 'BUY').length },
    { name: 'SELL', value: activeOrders.filter((o: OrderRead) => o.order_type === 'SELL').length },
  ]

  // Currency pair distribution from orders
  const pairCounts: Record<string, number> = {}
  activeOrders.forEach((o: OrderRead) => {
    const pair = `${o.currency_in_id}/${o.currency_out_id}`
    pairCounts[pair] = (pairCounts[pair] || 0) + 1
  })
  const pairData = Object.entries(pairCounts).map(([name, value]) => ({ name, value })).slice(0, 6)

  // Recent orders (last 7)
  const recentOrders = [...activeOrders].sort((a: OrderRead, b: OrderRead) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  ).slice(0, 7)

  // Balance summary by direction
  const clientOwes = (balances as ClientBalanceReport[]).filter(b => b.position === 'client_owes_house')
  const houseOwes = (balances as ClientBalanceReport[]).filter(b => b.position === 'house_owes_client')

  // Activity by day (last 7 days)
  const activityMap: Record<string, number> = {}
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i))
    return d.toISOString().slice(0, 10)
  })
  days.forEach(d => { activityMap[d] = 0 })
  ;[...orders, ...exchanges, ...journals].forEach((r: { created_at: string }) => {
    const d = r.created_at.slice(0, 10)
    if (d in activityMap) activityMap[d]++
  })
  const activityData = days.map(d => ({
    date: fmtDate(d + 'T00:00:00'),
    transactions: activityMap[d],
  }))

  // ── Total holdings across ALL wallets, grouped by currency ────────────────
  const currMap: Record<string, CurrencyRead> = {}
  currencies.forEach((c: CurrencyRead) => { currMap[c.ticker] = c })

  const holdingsByCurrency: Record<string, { total: number; house: number; clients: number; walletCount: number }> = {}
  const userMap: Record<number, UserRead> = {}
  users.forEach((u: UserRead) => { userMap[u.id] = u })

  wallets.forEach((w: WalletRead) => {
    const bal = parseFloat(w.balance)
    if (!holdingsByCurrency[w.currency_id]) {
      holdingsByCurrency[w.currency_id] = { total: 0, house: 0, clients: 0, walletCount: 0 }
    }
    holdingsByCurrency[w.currency_id].total += bal
    holdingsByCurrency[w.currency_id].walletCount += 1
    const role = userMap[w.user_id]?.role
    if (role === 'HOUSE') holdingsByCurrency[w.currency_id].house += bal
    else holdingsByCurrency[w.currency_id].clients += bal
  })

  const holdingsRows: HoldingsRow[] = Object.entries(holdingsByCurrency)
    .map(([ticker, v]) => ({ ticker, ...v, currency: currMap[ticker] }))

  const sortedHoldingsRows = useMemo(() => {
    const getValue = (row: HoldingsRow) => {
      if (holdingsSortKey === 'currency') return (row.currency?.name || row.ticker).toLowerCase()
      return row[holdingsSortKey]
    }

    return [...holdingsRows].sort((a, b) => {
      const av = getValue(a)
      const bv = getValue(b)
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return holdingsSortDir === 'asc' ? cmp : -cmp
    })
  }, [holdingsRows, holdingsSortKey, holdingsSortDir])

  const selectedCurrencyInfo = selectedCurrency ? currMap[selectedCurrency] : undefined
  const selectedCurrencyWallets = selectedCurrency
    ? wallets
        .filter((w: WalletRead) => w.currency_id === selectedCurrency && parseFloat(w.balance) !== 0)
        .sort((a: WalletRead, b: WalletRead) => Math.abs(parseFloat(b.balance)) - Math.abs(parseFloat(a.balance)))
    : []

  const ownerName = (userId: number) => {
    const owner = userMap[userId]
    if (!owner) return `User #${userId}`
    return `${owner.name}${owner.surname ? ' ' + owner.surname : ''}`
  }

  const money = (value: string | number, currency?: CurrencyRead) => {
    const amount = formatCurrencyNumber(value, currency?.decimals)
    return currency?.symbol ? `${currency.symbol} ${amount}` : amount
  }

  const setHoldingsSort = (key: HoldingsSortKey) => {
    if (holdingsSortKey === key) setHoldingsSortDir(dir => dir === 'asc' ? 'desc' : 'asc')
    else {
      setHoldingsSortKey(key)
      setHoldingsSortDir(key === 'currency' ? 'asc' : 'desc')
    }
  }

  const sortIcon = (key: HoldingsSortKey) => {
    if (holdingsSortKey !== key) return <ChevronsUpDown size={13} className="text-gray-300" />
    return holdingsSortDir === 'asc'
      ? <ChevronUp size={13} className="text-[var(--color-primary)]" />
      : <ChevronDown size={13} className="text-[var(--color-primary)]" />
  }

  const SortHeader = ({ sortKey, children, align = 'left', className = '' }: {
    sortKey: HoldingsSortKey
    children: string
    align?: 'left' | 'right'
    className?: string
  }) => (
    <th className={`px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}>
      <button
        type="button"
        onClick={() => setHoldingsSort(sortKey)}
        className={`inline-flex items-center gap-1 transition hover:text-gray-900 ${align === 'right' ? 'justify-end' : 'justify-start'}`}
      >
        {children}
        {sortIcon(sortKey)}
      </button>
    </th>
  )

  return (
    <div>
      <PageHeader title="Dashboard" subtitle={`Overview of your FX ledger activity`} />

      {/* ── Total Holdings ─────────────────────────────────────────────────── */}
      <Card className="mb-6 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Total Holdings</h3>
            <p className="text-xs text-gray-400 mt-0.5">Sum of all wallet balances across house &amp; client accounts</p>
          </div>
          <span className="text-xs text-gray-400 bg-gray-50 px-2.5 py-1 rounded-full border border-gray-200">
            {wallets.length} wallets · {sortedHoldingsRows.length} currencies
          </span>
        </div>

        {sortedHoldingsRows.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">No wallets found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <SortHeader sortKey="currency">Currency</SortHeader>
                  <SortHeader sortKey="total" align="right">Total Balance</SortHeader>
                  <SortHeader sortKey="house" align="right" className="hidden md:table-cell">House</SortHeader>
                  <SortHeader sortKey="clients" align="right" className="hidden md:table-cell">Clients</SortHeader>
                  <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Distribution</th>
                  <SortHeader sortKey="walletCount" align="right" className="hidden sm:table-cell">Wallets</SortHeader>
                </tr>
              </thead>
              <tbody>
                {sortedHoldingsRows.map((row, idx) => {
                  const houseRatio  = row.total > 0 ? (row.house   / row.total) * 100 : 0
                  const clientRatio = row.total > 0 ? (row.clients / row.total) * 100 : 0
                  return (
                    <tr
                      key={row.ticker}
                      onClick={() => setSelectedCurrency(row.ticker)}
                      className={`cursor-pointer border-b border-gray-50 hover:bg-gray-50 transition ${idx % 2 === 1 ? 'bg-gray-50/50' : ''}`}
                    >
                      {/* Currency */}
                      <td className="px-5 py-3">
                        <p className="font-semibold text-gray-900">{row.currency?.name || row.ticker}</p>
                      </td>
                      {/* Total */}
                      <td className="px-5 py-3 text-right">
                        <p className="font-bold text-gray-900 text-base">{money(row.total, row.currency)}</p>
                      </td>
                      {/* House */}
                      <td className="px-5 py-3 text-right hidden md:table-cell">
                        <p className="text-sm font-medium text-purple-700">{money(row.house, row.currency)}</p>
                        <p className="text-xs text-gray-400">{houseRatio.toFixed(0)}%</p>
                      </td>
                      {/* Clients */}
                      <td className="px-5 py-3 text-right hidden md:table-cell">
                        <p className="text-sm font-medium text-blue-700">{money(row.clients, row.currency)}</p>
                        <p className="text-xs text-gray-400">{clientRatio.toFixed(0)}%</p>
                      </td>
                      {/* Distribution bar */}
                      <td className="px-5 py-3 hidden lg:table-cell">
                        <div className="flex items-center gap-2 min-w-[140px]">
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden flex">
                            <div className="h-full bg-purple-500 rounded-l-full transition-all" style={{ width: `${houseRatio}%` }} />
                            <div className="h-full bg-blue-400 rounded-r-full transition-all" style={{ width: `${clientRatio}%` }} />
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-gray-400 shrink-0">
                            <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />H
                            <span className="w-2 h-2 rounded-full bg-blue-400 inline-block ml-1" />C
                          </div>
                        </div>
                      </td>
                      {/* Wallet count */}
                      <td className="px-5 py-3 text-right hidden sm:table-cell">
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{row.walletCount}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={selectedCurrency !== null}
        onClose={() => setSelectedCurrency(null)}
        title={`${selectedCurrencyInfo?.name ?? selectedCurrency ?? 'Currency'} Wallets`}
        size="lg"
        mobilePosition="center"
      >
        {selectedCurrencyWallets.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">No non-zero wallets for this currency.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Owner</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Role</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Balance</th>
                </tr>
              </thead>
              <tbody>
                {selectedCurrencyWallets.map((wallet: WalletRead) => {
                  const owner = userMap[wallet.user_id]
                  const amount = parseFloat(wallet.balance)
                  return (
                    <tr key={wallet.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{ownerName(wallet.user_id)}</p>
                        <p className="text-xs text-gray-400">@{owner?.username ?? `user-${wallet.user_id}`}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={owner?.role === 'HOUSE' ? 'purple' : owner?.role === 'DEVELOPER' ? 'yellow' : 'blue'}>
                          {owner?.role ?? 'UNKNOWN'}
                        </Badge>
                      </td>
                      <td className={`px-4 py-3 text-right font-mono font-semibold ${amount < 0 ? 'text-red-700' : 'text-gray-900'}`}>
                        {money(amount, selectedCurrencyInfo)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Orders"
          value={activeOrders.length}
          sub="active orders"
          icon={<ShoppingCart size={20} />}
          color="blue"
        />
        <StatCard
          label="House Exchanges"
          value={exchanges.length}
          sub={`${exchanges.filter((e: { voided_at: string | null }) => !e.voided_at).length} active`}
          icon={<ArrowLeftRight size={20} />}
          color="purple"
        />
        <StatCard
          label="Journal Entries"
          value={journals.length}
          sub={`${journals.filter((j: { voided_at: string | null }) => !j.voided_at).length} active`}
          icon={<BookOpen size={20} />}
          color="green"
        />
        <StatCard
          label="Users"
          value={users.length}
          sub={`${clientCount} clients · ${houseCount} house`}
          icon={<Users size={20} />}
          color="yellow"
        />
      </div>

      {/* Second stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Clients Owe House"
          value={clientOwes.length}
          sub="open balances"
          icon={<TrendingUp size={20} />}
          color="red"
        />
        <StatCard
          label="House Owes Clients"
          value={houseOwes.length}
          sub="open balances"
          icon={<TrendingDown size={20} />}
          color="blue"
        />
        <StatCard
          label="Voided Orders"
          value={voidedOrders.length}
          sub="all time"
          icon={<AlertTriangle size={20} />}
          color="yellow"
        />
        <StatCard
          label="Active Pairs"
          value={pairData.length}
          sub="currency pairs traded"
          icon={<CheckCircle size={20} />}
          color="green"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Activity bar chart */}
        <Card className="p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Transaction Activity — Last 7 Days</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={activityData}>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="transactions" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Order type pie */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Orders by Type</h3>
          {ordersByType.every(d => d.value === 0) ? (
            <div className="flex items-center justify-center h-[180px] text-gray-400 text-sm">No orders yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={ordersByType} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" paddingAngle={3}>
                  {ordersByType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent orders */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Recent Orders</h3>
          {recentOrders.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No orders yet</p>
          ) : (
            <div className="space-y-2">
              {recentOrders.map((o: OrderRead) => (
                <div key={o.id} className="flex items-start justify-between gap-3 py-2 border-b border-gray-50 last:border-0">
                  <div className="flex min-w-0 items-center gap-3">
                    <Badge variant={o.order_type === 'BUY' ? 'green' : 'blue'}>{o.order_type}</Badge>
                    <span className="truncate text-sm text-gray-700">
                      {o.currency_in_id} → {o.currency_out_id}
                    </span>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-medium text-gray-800">{money(o.amount_in, currMap[o.currency_in_id])}</p>
                    <p className="text-xs text-gray-400">{fmtDate(o.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Currency pair distribution */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Top Currency Pairs</h3>
          {pairData.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No trades yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={pairData} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={90} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {pairData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>
    </div>
  )
}
