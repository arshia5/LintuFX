import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getClientBalances, getClientDebts, listUsers, listCurrencies } from '../api'
import { PageHeader, Card, Table, Badge, SearchableSelect, Select } from '../components/ui'
import type { ClientBalanceReport, UserRead, CurrencyRead } from '../types'

function fmtAmt(s: string) {
  const n = parseFloat(s)
  return isNaN(n) ? s : new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(Math.abs(n))
}

const positionColors: Record<string, 'red' | 'green' | 'gray'> = {
  client_owes_house: 'red',
  house_owes_client: 'green',
  settled: 'gray',
}
const positionLabels: Record<string, string> = {
  client_owes_house: 'Client owes house',
  house_owes_client: 'House owes client',
  settled: 'Settled',
}

export default function Reports() {
  const [tab, setTab] = useState<'balances' | 'debts'>('balances')
  const [direction, setDirection] = useState('all')
  const [clientId, setClientId] = useState<number | null>(null)
  const [currencyId, setCurrencyId] = useState<string | null>(null)
  const [includeZero, setIncludeZero] = useState(false)

  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: () => listUsers() })
  const { data: currencies = [] } = useQuery({ queryKey: ['currencies'], queryFn: () => listCurrencies() })

  const clientOpts = [
    { value: '', label: 'All Clients' },
    ...users.filter((u: UserRead) => u.role === 'CLIENT').map((u: UserRead) => ({
      value: u.id,
      label: `${u.name}${u.surname ? ' ' + u.surname : ''}`,
      sublabel: `@${u.username}`,
    }))
  ]
  const currOpts = [
    { value: '', label: 'All Currencies' },
    ...currencies.map((c: CurrencyRead) => ({ value: c.ticker, label: `${c.ticker} — ${c.name}` }))
  ]

  const balancesQuery = useQuery({
    queryKey: ['client-balances', direction, clientId, currencyId, includeZero],
    queryFn: () => getClientBalances({
      direction,
      ...(clientId ? { client_id: clientId } : {}),
      ...(currencyId ? { currency_id: currencyId } : {}),
      include_zero: includeZero,
    }),
    enabled: tab === 'balances',
  })

  const debtsQuery = useQuery({
    queryKey: ['client-debts', clientId, currencyId],
    queryFn: () => getClientDebts({
      ...(clientId ? { client_id: clientId } : {}),
      ...(currencyId ? { currency_id: currencyId } : {}),
    }),
    enabled: tab === 'debts',
  })

  const data: ClientBalanceReport[] = tab === 'balances' ? (balancesQuery.data ?? []) : (debtsQuery.data ?? [])
  const isLoading = tab === 'balances' ? balancesQuery.isLoading : debtsQuery.isLoading

  // Summary stats
  const owesHouse = data.filter(r => r.position === 'client_owes_house')
  const owesClient = data.filter(r => r.position === 'house_owes_client')
  const settled = data.filter(r => r.position === 'settled')

  const columns = [
    {
      key: 'client', header: 'Client', render: (r: ClientBalanceReport) => (
        <div>
          <p className="text-sm font-medium text-gray-900">{r.name}{r.surname ? ` ${r.surname}` : ''}</p>
          <p className="text-xs text-gray-400">@{r.username}</p>
        </div>
      )
    },
    {
      key: 'currency', header: 'Currency', render: (r: ClientBalanceReport) => (
        <div>
          <span className="font-mono font-semibold text-[var(--color-primary)]">{r.currency_id}</span>
          <span className="text-gray-400 text-xs ml-1">{r.currency_name}</span>
        </div>
      )
    },
    {
      key: 'balance', header: 'Balance', render: (r: ClientBalanceReport) => {
        const n = parseFloat(r.balance)
        const isNeg = n < 0
        return (
          <span className={`font-semibold text-sm ${isNeg ? 'text-red-600' : 'text-green-600'}`}>
            {isNeg ? '−' : '+'}{fmtAmt(r.balance)}
          </span>
        )
      }
    },
    {
      key: 'position', header: 'Position', render: (r: ClientBalanceReport) => (
        <Badge variant={positionColors[r.position] ?? 'gray'}>{positionLabels[r.position] ?? r.position}</Badge>
      )
    },
  ]

  return (
    <div>
      <PageHeader title="Reports" subtitle="Client balance and debt positions" />

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        {(['balances', 'debts'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
          >
            {t === 'balances' ? 'Client Balances' : 'Client Debts'}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <SearchableSelect
          options={clientOpts as { value: string | number; label: string; sublabel?: string }[]}
          value={clientId ?? ''}
          onChange={v => setClientId(v ? Number(v) : null)}
          placeholder="All Clients"
          label="Filter by Client"
        />
        <SearchableSelect
          options={currOpts}
          value={currencyId ?? ''}
          onChange={v => setCurrencyId(v ? String(v) : null)}
          placeholder="All Currencies"
          label="Filter by Currency"
        />
        {tab === 'balances' && (
          <Select
            label="Direction"
            options={[
              { value: 'all', label: 'All' },
              { value: 'client_owes', label: 'Client owes house' },
              { value: 'house_owes', label: 'House owes client' },
              { value: 'settled', label: 'Settled' },
            ]}
            value={direction}
            onChange={e => setDirection(e.target.value)}
          />
        )}
        {tab === 'balances' && (
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={includeZero} onChange={e => setIncludeZero(e.target.checked)} className="rounded" />
              Include zero balances
            </label>
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card className="p-4">
          <p className="text-xs text-gray-500 mb-1">Client owes house</p>
          <p className="text-2xl font-bold text-red-600">{owesHouse.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">open positions</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-500 mb-1">House owes client</p>
          <p className="text-2xl font-bold text-green-600">{owesClient.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">open positions</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-500 mb-1">Settled</p>
          <p className="text-2xl font-bold text-gray-600">{settled.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">positions</p>
        </Card>
      </div>

      <Card>
        <Table columns={columns} data={data} keyFn={r => `${r.client_id}-${r.currency_id}`} loading={isLoading} emptyMessage="No balance data found" />
      </Card>
    </div>
  )
}
