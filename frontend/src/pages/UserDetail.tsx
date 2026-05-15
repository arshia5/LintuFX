import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, FileSpreadsheet, Wallet, ShoppingCart, BookOpen, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { getUser, listWallets, listOrders, listJournalEntries, listCurrencies, downloadClientStatement } from '../api'
import { Card, Button, Table, Badge, VoidBadge, Modal, Input, Alert } from '../components/ui'
import type { OrderRead, JournalEntryRead, WalletRead, CurrencyRead } from '../types'
import { fmtDate, fmtDateTimeShort } from '../utils/date'
import { saveBlobResponse } from '../utils/download'
import { formatNumber } from '../utils/number'

function fmtAmt(s: string | number, decimals = 4) {
  return formatNumber(s, decimals)
}

// ── Export Modal ──────────────────────────────────────────────────────────────
function ExportModal({ open, onClose, userId, orders, journals }: {
  open: boolean
  onClose: () => void
  userId: number
  orders: OrderRead[]
  journals: JournalEntryRead[]
}) {
  const today = new Date().toISOString().slice(0, 10)
  const monthAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  const [from, setFrom] = useState(monthAgo)
  const [to, setTo] = useState(today)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const filteredOrders = useMemo(() =>
    orders.filter(o => !o.voided_at && o.created_at.slice(0, 10) >= from && o.created_at.slice(0, 10) <= to),
    [orders, from, to]
  )
  const filteredJournals = useMemo(() =>
    journals.filter(j => !j.voided_at && j.created_at.slice(0, 10) >= from && j.created_at.slice(0, 10) <= to),
    [journals, from, to]
  )

  const handleExport = async () => {
    if (!from || !to) { setErr('Both dates are required'); return }
    if (from > to) { setErr('Start date must be before end date'); return }
    setErr('')
    setLoading(true)
    try {
      const response = await downloadClientStatement(userId, { from, to })
      saveBlobResponse(response, `client_statement_${from}_to_${to}.xlsx`)
      onClose()
    } catch {
      setErr('Could not generate the report. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Export Client Statement" size="sm">
      <div className="space-y-4">
        {err && <Alert type="error" message={err} />}
        <p className="text-sm text-gray-500">
          Select the report period. Orders and transfers will be combined in one table, sorted by date.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="From date" type="date" value={from} onChange={e => setFrom(e.target.value)} />
          <Input label="To date" type="date" value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <div className="bg-blue-50 rounded-lg px-4 py-3 text-xs text-blue-700">
          <span className="font-medium">{filteredOrders.length}</span> orders &nbsp;·&nbsp;
          <span className="font-medium">{filteredJournals.length}</span> transfers in period
          &nbsp;·&nbsp; <span className="font-medium">{filteredOrders.length + filteredJournals.length}</span> total rows
        </div>
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end sm:gap-3">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" icon={<FileSpreadsheet size={15} />} onClick={handleExport} loading={loading}>
            Download Excel
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function UserDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const userId = Number(id)
  const [exportOpen, setExportOpen] = useState(false)
  const [tab, setTab] = useState<'orders' | 'journals' | 'wallets'>('orders')

  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['user', userId],
    queryFn: () => getUser(userId),
    enabled: !!userId,
  })

  const { data: allWallets = [] } = useQuery({ queryKey: ['wallets'], queryFn: () => listWallets() })
  const { data: currencies = [] } = useQuery({ queryKey: ['currencies'], queryFn: () => listCurrencies() })
  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['orders', userId],
    queryFn: () => listOrders({ client_id: userId }),
    enabled: !!userId,
  })
  const { data: allJournals = [], isLoading: journalsLoading } = useQuery({
    queryKey: ['journal-entries'],
    queryFn: () => listJournalEntries(),
  })

  const currMap: Record<string, CurrencyRead> = {}
  currencies.forEach((c: CurrencyRead) => { currMap[c.ticker] = c })

  const walletMap: Record<number, WalletRead> = {}
  allWallets.forEach((w: WalletRead) => { walletMap[w.id] = w })

  // Wallets belonging to this user
  const userWallets: WalletRead[] = allWallets.filter((w: WalletRead) => w.user_id === userId)

  // Wallet IDs belonging to this user
  const userWalletIds = new Set(userWallets.map((w: WalletRead) => w.id))

  // Journal entries where this user is sender or receiver
  const userJournals: JournalEntryRead[] = allJournals.filter((j: JournalEntryRead) =>
    userWalletIds.has(j.from_wallet_id) || userWalletIds.has(j.to_wallet_id)
  )

  // ── Stats ──────────────────────────────────────────────────────────────────
  const activeOrders = orders.filter((o: OrderRead) => !o.voided_at).length
  const activeJournals = userJournals.filter((j: JournalEntryRead) => !j.voided_at).length

  // Position per currency (from active orders)
  const netPosition: Record<string, number> = {}
  orders.filter((o: OrderRead) => !o.voided_at).forEach((o: OrderRead) => {
    if (o.order_type === 'BUY') {
      netPosition[o.currency_in_id] = (netPosition[o.currency_in_id] ?? 0) - parseFloat(o.amount_in)
      netPosition[o.currency_out_id] = (netPosition[o.currency_out_id] ?? 0) + parseFloat(o.amount_out)
    } else {
      netPosition[o.currency_out_id] = (netPosition[o.currency_out_id] ?? 0) - parseFloat(o.amount_out)
      netPosition[o.currency_in_id] = (netPosition[o.currency_in_id] ?? 0) + parseFloat(o.amount_in)
    }
  })

  // ── Columns ────────────────────────────────────────────────────────────────
  const orderColumns = [
    { key: 'id', header: '#', render: (r: OrderRead) => <span className="font-mono text-xs text-gray-400">#{r.id}</span>, sortValue: (r: OrderRead) => r.id },
    { key: 'type', header: 'Type', render: (r: OrderRead) => <Badge variant={r.order_type === 'BUY' ? 'green' : 'blue'}>{r.order_type}</Badge>, sortValue: (r: OrderRead) => r.order_type },
    { key: 'pair', header: 'Pair', render: (r: OrderRead) => <span className="font-mono text-sm font-semibold">{r.currency_in_id}/{r.currency_out_id}</span>, sortValue: (r: OrderRead) => `${r.currency_in_id}/${r.currency_out_id}` },
    {
      key: 'amount', header: 'In → Out',
      render: (r: OrderRead) => <span className="text-sm">{fmtAmt(r.amount_in)} <span className="text-gray-400">→</span> {fmtAmt(r.amount_out)}</span>,
      sortValue: (r: OrderRead) => parseFloat(r.amount_in),
    },
    { key: 'rate', header: 'Rate', render: (r: OrderRead) => <span className="font-mono text-xs text-gray-600">{formatNumber(r.exchange_rate, 8)}</span>, sortValue: (r: OrderRead) => parseFloat(r.exchange_rate) },
    { key: 'status', header: 'Status', render: (r: OrderRead) => <VoidBadge voidedAt={r.voided_at} />, sortValue: (r: OrderRead) => r.voided_at ?? '' },
    { key: 'date', header: 'Date', render: (r: OrderRead) => <span className="text-xs text-gray-400">{fmtDateTimeShort(r.created_at)}</span>, sortValue: (r: OrderRead) => r.created_at },
  ]

  const journalColumns = [
    { key: 'id', header: '#', render: (r: JournalEntryRead) => <span className="font-mono text-xs text-gray-400">#{r.id}</span>, sortValue: (r: JournalEntryRead) => r.id },
    {
      key: 'direction', header: 'Direction',
      render: (r: JournalEntryRead) => {
        const isOut = userWalletIds.has(r.from_wallet_id)
        return isOut
          ? <Badge variant="red">Sent</Badge>
          : <Badge variant="green">Received</Badge>
      },
      sortValue: (r: JournalEntryRead) => userWalletIds.has(r.from_wallet_id) ? 'sent' : 'received',
    },
    {
      key: 'other', header: 'Other Party',
      render: (r: JournalEntryRead) => {
        const isOut = userWalletIds.has(r.from_wallet_id)
        const otherWalletId = isOut ? r.to_wallet_id : r.from_wallet_id
        const otherWallet = walletMap[otherWalletId]
        return <span className="text-xs text-gray-500">Wallet #{otherWalletId}{otherWallet ? ` (${otherWallet.currency_id})` : ''}</span>
      },
    },
    {
      key: 'transfer', header: 'Amount',
      render: (r: JournalEntryRead) => {
        const c = currMap[r.currency_id]
        const symbol = c?.symbol ?? r.currency_id
        const isOut = userWalletIds.has(r.from_wallet_id)
        return (
          <span className={`font-semibold text-sm ${isOut ? 'text-red-600' : 'text-green-600'}`}>
            {isOut ? '−' : '+'}{symbol} {fmtAmt(r.amount)}
          </span>
        )
      },
      sortValue: (r: JournalEntryRead) => parseFloat(r.amount),
    },
    { key: 'note', header: 'Note', render: (r: JournalEntryRead) => <span className="text-xs text-gray-500 max-w-[160px] block truncate">{r.description || '—'}</span> },
    { key: 'status', header: 'Status', render: (r: JournalEntryRead) => <VoidBadge voidedAt={r.voided_at} />, sortValue: (r: JournalEntryRead) => r.voided_at ?? '' },
    { key: 'date', header: 'Date', render: (r: JournalEntryRead) => <span className="text-xs text-gray-400">{fmtDateTimeShort(r.created_at)}</span>, sortValue: (r: JournalEntryRead) => r.created_at },
  ]

  if (userLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">Loading…</div>
    )
  }

  if (!user) {
    return (
      <div className="text-center py-20 text-gray-400">User not found.</div>
    )
  }

  const fullName = `${user.name}${user.surname ? ' ' + user.surname : ''}`

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={() => navigate('/users')}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="break-words text-xl font-bold text-gray-900">{fullName}</h1>
              <Badge variant={user.role === 'CLIENT' ? 'blue' : 'purple'}>{user.role}</Badge>
            </div>
            <p className="text-sm text-gray-400 mt-0.5">@{user.username} · Member since {fmtDate(user.created_at)}</p>
          </div>
        </div>
        <Button icon={<FileSpreadsheet size={16} />} onClick={() => setExportOpen(true)} className="justify-center sm:shrink-0">
          Export Statement
        </Button>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg"><Wallet size={18} className="text-blue-600" /></div>
            <div>
              <p className="text-xs text-gray-500">Wallets</p>
              <p className="text-xl font-bold text-gray-900">{userWallets.length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-lg"><ShoppingCart size={18} className="text-green-600" /></div>
            <div>
              <p className="text-xs text-gray-500">Active Orders</p>
              <p className="text-xl font-bold text-gray-900">{activeOrders}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-50 rounded-lg"><BookOpen size={18} className="text-purple-600" /></div>
            <div>
              <p className="text-xs text-gray-500">Journal Entries</p>
              <p className="text-xl font-bold text-gray-900">{activeJournals}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-50 rounded-lg"><TrendingUp size={18} className="text-yellow-600" /></div>
            <div>
              <p className="text-xs text-gray-500">Currencies held</p>
              <p className="text-xl font-bold text-gray-900">{userWallets.length}</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Wallet balances */}
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><Wallet size={15} /> Wallet Balances</h2>
          {userWallets.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No wallets</p>
          ) : (
            <div className="space-y-2">
              {userWallets.map((w: WalletRead) => {
                const c = currMap[w.currency_id]
                return (
                  <div key={w.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                    <div>
                      <span className="text-sm font-medium text-gray-800">{w.currency_id}</span>
                      {c && <span className="text-xs text-gray-400 ml-1.5">{c.name}</span>}
                    </div>
                    <span className="font-mono text-sm font-semibold text-gray-900">
                      {c?.symbol ? `${c.symbol} ` : ''}{fmtAmt(w.balance, 2)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* Net position */}
        <Card className="p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <TrendingUp size={15} /> Net Position (from all active orders)
          </h2>
          {Object.keys(netPosition).length === 0 ? (
            <p className="text-xs text-gray-400 italic">No active orders</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {Object.entries(netPosition).map(([curr, net]) => {
                const c = currMap[curr]
                const isPos = net > 0
                const isNeg = net < 0
                return (
                  <div key={curr} className={`rounded-lg px-4 py-3 flex items-center justify-between ${isPos ? 'bg-green-50' : isNeg ? 'bg-red-50' : 'bg-gray-50'}`}>
                    <div>
                      <p className="text-xs font-medium text-gray-500">{curr}</p>
                      <p className="text-xs text-gray-400">{c?.name ?? curr}</p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1">
                        {isPos ? <TrendingUp size={13} className="text-green-600" /> : isNeg ? <TrendingDown size={13} className="text-red-600" /> : <Minus size={13} className="text-gray-400" />}
                        <span className={`font-mono font-semibold text-sm ${isPos ? 'text-green-700' : isNeg ? 'text-red-700' : 'text-gray-600'}`}>
                          {net > 0 ? '+' : ''}{fmtAmt(String(net), 2)}
                        </span>
                      </div>
                      <p className={`text-xs mt-0.5 ${isPos ? 'text-green-600' : isNeg ? 'text-red-600' : 'text-gray-400'}`}>
                        {isPos ? 'House owes client' : isNeg ? 'Client owes house' : 'Settled'}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Tabs */}
      <Card>
        <div className="border-b border-gray-100 px-4 pt-4">
          <div className="flex gap-0">
            {([
              { key: 'orders', label: 'Orders', count: orders.length },
              { key: 'journals', label: 'Journal Entries', count: userJournals.length },
              { key: 'wallets', label: 'Wallets', count: userWallets.length },
            ] as const).map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${
                  tab === t.key
                    ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${tab === t.key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {tab === 'orders' && (
          <Table
            columns={orderColumns}
            data={orders as OrderRead[]}
            keyFn={r => r.id}
            loading={ordersLoading}
            emptyMessage="No orders for this client"
            defaultSortKey="date"
            defaultSortDir="desc"
          />
        )}

        {tab === 'journals' && (
          <Table
            columns={journalColumns}
            data={userJournals}
            keyFn={r => r.id}
            loading={journalsLoading}
            emptyMessage="No journal entries for this client"
            defaultSortKey="date"
            defaultSortDir="desc"
          />
        )}

        {tab === 'wallets' && (
          <div className="p-6">
            {userWallets.length === 0 ? (
              <p className="text-sm text-gray-400 italic text-center py-8">No wallets found.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {userWallets.map((w: WalletRead) => {
                  const c = currMap[w.currency_id]
                  return (
                    <div key={w.id} className="border border-gray-200 rounded-xl p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-semibold text-gray-900">{w.currency_id}</p>
                          {c && <p className="text-xs text-gray-400">{c.name}</p>}
                        </div>
                        <span className="text-xs font-mono text-gray-400 bg-gray-50 px-2 py-0.5 rounded">#{w.id}</span>
                      </div>
                      <p className="text-2xl font-bold text-gray-900 mt-1">
                        <span className="text-base font-normal text-gray-500 mr-1">{c?.symbol ?? ''}</span>
                        {fmtAmt(w.balance, 2)}
                      </p>
                      <p className="text-xs text-gray-400 mt-2">Created {fmtDate(w.created_at)}</p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </Card>

      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        userId={userId}
        orders={orders as OrderRead[]}
        journals={userJournals}
      />
    </div>
  )
}
