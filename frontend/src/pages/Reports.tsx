import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileSpreadsheet } from 'lucide-react'
import { getClientBalances, listUsers, listCurrencies, downloadFullActivityReport } from '../api'
import { PageHeader, Card, Table, Badge, SearchableSelect, Input, Button, Alert } from '../components/ui'
import type { ClientBalanceReport, UserRead, CurrencyRead } from '../types'
import { saveBlobResponse } from '../utils/download'
import { formatCurrencyNumber } from '../utils/number'

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
  const [positionTab, setPositionTab] = useState<'client_owes' | 'house_owes'>('client_owes')
  const [clientId, setClientId] = useState<number | null>(null)
  const [currencyId, setCurrencyId] = useState<string | null>(null)
  const today = new Date().toISOString().slice(0, 10)
  const monthAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  const [activityAllTime, setActivityAllTime] = useState(true)
  const [activityFrom, setActivityFrom] = useState(monthAgo)
  const [activityTo, setActivityTo] = useState(today)
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState('')

  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: () => listUsers() })
  const { data: currencies = [] } = useQuery({ queryKey: ['currencies'], queryFn: () => listCurrencies() })
  const currMap: Record<string, CurrencyRead> = {}
  currencies.forEach((c: CurrencyRead) => { currMap[c.ticker] = c })
  const money = (value: string | number, currencyId: string) =>
    formatCurrencyNumber(Math.abs(Number(value)), currMap[currencyId]?.decimals)

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
    ...currencies.map((c: CurrencyRead) => ({ value: c.ticker, label: c.name || c.ticker }))
  ]

  const balancesQuery = useQuery({
    queryKey: ['client-balances', positionTab, clientId, currencyId],
    queryFn: () => getClientBalances({
      direction: positionTab,
      ...(clientId ? { client_id: clientId } : {}),
      ...(currencyId ? { currency_id: currencyId } : {}),
      include_zero: false,
    }),
  })

  const data: ClientBalanceReport[] = balancesQuery.data ?? []
  const isLoading = balancesQuery.isLoading

  const handleActivityExport = async () => {
    if (!activityAllTime && (!activityFrom || !activityTo)) {
      setActivityError('Both dates are required')
      return
    }
    if (!activityAllTime && activityFrom > activityTo) {
      setActivityError('Start date must be before end date')
      return
    }
    setActivityError('')
    setActivityLoading(true)
    try {
      const response = await downloadFullActivityReport(
        activityAllTime ? undefined : { from: activityFrom, to: activityTo }
      )
      saveBlobResponse(
        response,
        activityAllTime
          ? 'full_activity_report_all_time.xlsx'
          : `full_activity_report_${activityFrom}_to_${activityTo}.xlsx`
      )
    } catch {
      setActivityError('Could not generate the full activity report. Please try again.')
    } finally {
      setActivityLoading(false)
    }
  }

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
            {isNeg ? '−' : '+'}{money(r.balance, r.currency_id)}
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

      <Card className="p-5 mb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Full Activity Export</h2>
            <p className="text-xs text-gray-500 mt-1">Download an Excel timeline of all FX orders, house exchanges, and transfers, including voided records.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex items-center gap-2 text-sm text-gray-700 pb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={activityAllTime}
                onChange={e => setActivityAllTime(e.target.checked)}
                className="rounded"
              />
              All time
            </label>
            <Input
              label="From"
              type="date"
              value={activityFrom}
              disabled={activityAllTime}
              onChange={e => setActivityFrom(e.target.value)}
            />
            <Input
              label="To"
              type="date"
              value={activityTo}
              disabled={activityAllTime}
              onChange={e => setActivityTo(e.target.value)}
            />
            <Button
              icon={<FileSpreadsheet size={15} />}
              onClick={handleActivityExport}
              loading={activityLoading}
            >
              Download Excel
            </Button>
          </div>
        </div>
        {activityError && <div className="mt-4"><Alert type="error" message={activityError} /></div>}
      </Card>

      <div className="mb-6">
        <div className="flex w-full gap-1 rounded-lg bg-gray-100 p-1 sm:w-fit">
          {([
            ['client_owes', 'Client owes house'],
            ['house_owes', 'House owes client'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setPositionTab(key)}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition sm:flex-none ${positionTab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 gap-3 mb-5 sm:grid-cols-2">
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
      </div>

      <Card className="mb-6 p-4">
        <p className="text-xs text-gray-500 mb-1">
          {positionTab === 'client_owes' ? 'Client owes house' : 'House owes client'}
        </p>
        <p className={`text-2xl font-bold ${positionTab === 'client_owes' ? 'text-red-600' : 'text-green-600'}`}>{data.length}</p>
        <p className="text-xs text-gray-400 mt-0.5">open positions</p>
      </Card>

      <Card>
        <Table columns={columns} data={data} keyFn={r => `${r.client_id}-${r.currency_id}`} loading={isLoading} emptyMessage="No balance data found" />
      </Card>
    </div>
  )
}
