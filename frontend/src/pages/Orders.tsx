import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Ban, Edit3, ChevronDown, ChevronUp } from 'lucide-react'
import { listOrders, createOrder, voidOrder, correctOrder, listUsers, listCurrencies } from '../api'
import {
  PageHeader, Button, Table, Modal, Input, Select,
  Alert, Card, Badge, SearchableSelect, VoidBadge,
  FilterBar, initFilters,
} from '../components/ui'
import { RateCalculator } from '../components/ui/RateCalculator'
import type { FilterDef, FilterValues } from '../components/ui'
import type { OrderRead, UserRead, CurrencyRead, OrderCreate, OrderType } from '../types'
import { fmtDateTimeShort, nowIstanbulISO, istanbulLocalToUTC } from '../utils/date'
import { formatCurrencyNumber, formatNumber } from '../utils/number'
import { currencyOption, currencySearchText } from '../utils/currency'
const fmtDate = fmtDateTimeShort

export default function Orders() {
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [voidTarget, setVoidTarget] = useState<OrderRead | null>(null)
  const [correctTarget, setCorrectTarget] = useState<OrderRead | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [apiError, setApiError] = useState('')

  const { data: orders = [], isLoading } = useQuery({ queryKey: ['orders'], queryFn: () => listOrders() })
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: () => listUsers() })
  const { data: currencies = [] } = useQuery({ queryKey: ['currencies'], queryFn: () => listCurrencies() })

  const userMap: Record<number, UserRead> = {}
  users.forEach((u: UserRead) => { userMap[u.id] = u })
  const currMap: Record<string, CurrencyRead> = {}
  currencies.forEach((c: CurrencyRead) => { currMap[c.ticker] = c })

  const money = (value: string | number, currencyId: string) =>
    formatCurrencyNumber(value, currMap[currencyId]?.decimals)

  const userName = (userId: number | null) => {
    if (userId === null) return 'System'
    const user = userMap[userId]
    if (!user) return `User #${userId}`
    return `${user.name}${user.surname ? ` ${user.surname}` : ''}`
  }

  const createMut = useMutation({
    mutationFn: createOrder,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); setCreateOpen(false) },
    onError: (e: { response?: { data?: { detail?: string } } }) => setApiError(e.response?.data?.detail || 'Failed to create order'),
  })

  const voidMut = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => voidOrder(id, { reason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); setVoidTarget(null) },
    onError: (e: { response?: { data?: { detail?: string } } }) => setApiError(e.response?.data?.detail || 'Failed to void order'),
  })

  const correctMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: OrderCreate & { correction_reason: string } }) => correctOrder(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); setCorrectTarget(null) },
    onError: (e: { response?: { data?: { detail?: string } } }) => setApiError(e.response?.data?.detail || 'Failed to correct order'),
  })

  const clientUsers = users.filter((u: UserRead) => u.role === 'CLIENT')

  // ── Filters ────────────────────────────────────────────────────────────────
  const filterDefs: FilterDef[] = useMemo(() => [
    { key: 'search', label: 'Client', type: 'text', placeholder: 'Search by client name...' },
    { key: 'currency', label: 'Currency', type: 'text', placeholder: 'Search currency pair...' },
    {
      key: 'order_type', label: 'Type', type: 'toggle',
      options: [{ value: 'BUY', label: 'BUY' }, { value: 'SELL', label: 'SELL' }],
    },
    {
      key: 'status', label: 'Status', type: 'toggle',
      options: [{ value: 'active', label: 'Active' }, { value: 'voided', label: 'Voided' }],
    },
  ], [])

  const [filterVals, setFilterVals] = useState<FilterValues>(() => initFilters(filterDefs))

  const filtered = useMemo(() => {
    return orders.filter((o: OrderRead) => {
      const u = userMap[o.client_id]
      const clientName = u ? `${u.name} ${u.surname ?? ''} ${u.username}`.toLowerCase() : ''
      const search = (filterVals.search as string).toLowerCase()
      if (search && !clientName.includes(search)) return false

      const currency = (filterVals.currency as string).toLowerCase()
      if (currency) {
        const pair = `${o.currency_in_id}/${o.currency_out_id} ${currencySearchText(o.currency_in_id, currMap)} ${currencySearchText(o.currency_out_id, currMap)}`.toLowerCase()
        if (!pair.includes(currency)) return false
      }

      const ot = filterVals.order_type as string
      if (ot && o.order_type !== ot) return false

      const st = filterVals.status as string
      if (st === 'active' && o.voided_at) return false
      if (st === 'voided' && !o.voided_at) return false

      return true
    })
  }, [orders, filterVals, userMap, currMap])

  const columns = [
    { key: 'id', header: '#', render: (r: OrderRead) => <span className="font-mono text-xs text-gray-400">#{r.id}</span>, sortValue: (r: OrderRead) => r.id },
    {
      key: 'client', header: 'Client',
      render: (r: OrderRead) => {
        const u = userMap[r.client_id]
        return u ? <span className="text-sm font-medium">{u.name}{u.surname ? ` ${u.surname}` : ''}</span>
          : <span className="text-gray-400 text-xs">User #{r.client_id}</span>
      },
      sortValue: (r: OrderRead) => userMap[r.client_id]?.name ?? '',
    },
    { key: 'order_type', header: 'Type', render: (r: OrderRead) => <Badge variant={r.order_type === 'BUY' ? 'green' : 'blue'}>{r.order_type}</Badge>, sortValue: (r: OrderRead) => r.order_type },
    {
      key: 'pair', header: 'Pair',
      render: (r: OrderRead) => <span className="font-mono text-sm font-semibold text-gray-700">{r.currency_in_id}/{r.currency_out_id}</span>,
      sortValue: (r: OrderRead) => `${r.currency_in_id}/${r.currency_out_id}`,
    },
    {
      key: 'amount', header: 'Amount In → Out',
      render: (r: OrderRead) => <span className="text-sm">{money(r.amount_in, r.currency_in_id)} → {money(r.amount_out, r.currency_out_id)}</span>,
      sortValue: (r: OrderRead) => parseFloat(r.amount_in),
    },
    { key: 'exchange_rate', header: 'Rate', render: (r: OrderRead) => <span className="font-mono text-xs text-gray-600">{formatNumber(r.exchange_rate, 8)}</span>, sortValue: (r: OrderRead) => parseFloat(r.exchange_rate) },
    { key: 'status', header: 'Status', render: (r: OrderRead) => <VoidBadge voidedAt={r.voided_at} />, sortValue: (r: OrderRead) => r.voided_at ?? '' },
    { key: 'created_at', header: 'Date', render: (r: OrderRead) => <span className="text-xs text-gray-400">{fmtDate(r.created_at)}</span>, sortValue: (r: OrderRead) => r.created_at },
    {
      key: 'actions', header: '', render: (r: OrderRead) => (
        <div className="flex gap-1 justify-end">
          <button onClick={e => { e.stopPropagation(); setExpanded(expanded === r.id ? null : r.id) }} className="p-1.5 rounded hover:bg-gray-100 text-gray-400">
            {expanded === r.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {!r.voided_at && <>
            <Button size="sm" variant="ghost" icon={<Edit3 size={13} />} onClick={e => { e.stopPropagation(); setCorrectTarget(r) }} />
            <Button size="sm" variant="ghost" icon={<Ban size={13} />} onClick={e => { e.stopPropagation(); setVoidTarget(r) }} className="text-orange-500 hover:bg-orange-50" />
          </>}
        </div>
      )
    },
  ]

  return (
    <div>
      <PageHeader title="Orders" subtitle="FX obligation orders" action={<Button icon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>New Order</Button>} />

      {apiError && <div className="mb-4"><Alert type="error" message={apiError} onClose={() => setApiError('')} /></div>}

      <FilterBar filters={filterDefs} values={filterVals} onChange={setFilterVals} resultCount={filtered.length} />

      <Card>
        <Table
          columns={columns}
          data={filtered}
          keyFn={r => r.id}
          loading={isLoading}
          emptyMessage="No orders match your filters"
          defaultSortKey="created_at"
          defaultSortDir="desc"
          pagination
          onRowClick={row => setExpanded(expanded === row.id ? null : row.id)}
          expandedRowKey={expanded}
          renderExpandedRow={expandedOrder => (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div><p className="text-xs text-gray-400">Description</p><p className="text-gray-700">{expandedOrder.description || '—'}</p></div>
              <div><p className="text-xs text-gray-400">Created by</p><p className="text-gray-700">{userName(expandedOrder.created_by_user_id)}</p></div>
              {expandedOrder.voided_at && <>
                <div><p className="text-xs text-gray-400">Voided at</p><p className="text-red-600">{fmtDate(expandedOrder.voided_at)}</p></div>
                <div><p className="text-xs text-gray-400">Voided by</p><p className="text-red-600">{userName(expandedOrder.voided_by_user_id)}</p></div>
                <div><p className="text-xs text-gray-400">Void reason</p><p className="text-red-600">{expandedOrder.void_reason}</p></div>
              </>}
            </div>
          )}
        />
      </Card>

      {/* Create Order */}
      <OrderFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={data => createMut.mutate(data as unknown as OrderCreate)}
        loading={createMut.isPending}
        title="New Order"
        clients={clientUsers}
        currencies={currencies}
      />

      {/* Correct Order */}
      {correctTarget && (
        <OrderFormModal
          open
          onClose={() => setCorrectTarget(null)}
          onSubmit={data => correctMut.mutate({ id: correctTarget.id, data: data as unknown as OrderCreate & { correction_reason: string } })}
          loading={correctMut.isPending}
          title={`Correct Order #${correctTarget.id}`}
          clients={clientUsers}
          currencies={currencies}
          defaultValues={correctTarget}
          isCorrection
        />
      )}

      {/* Void */}
      <VoidModal
        open={!!voidTarget}
        title={`Void Order #${voidTarget?.id}`}
        onClose={() => setVoidTarget(null)}
        onSubmit={reason => voidTarget && voidMut.mutate({ id: voidTarget.id, reason })}
        loading={voidMut.isPending}
      />

    </div>
  )
}

function OrderFormModal({ open, onClose, onSubmit, loading, title, clients, currencies, defaultValues, isCorrection }: {
  open: boolean; onClose: () => void; title: string; loading: boolean; clients: UserRead[]; currencies: CurrencyRead[]
  onSubmit: (d: Record<string, unknown>) => void; defaultValues?: OrderRead; isCorrection?: boolean
}) {
  const [clientId, setClientId] = useState<number | null>(defaultValues?.client_id ?? null)
  const [currIn, setCurrIn] = useState(defaultValues?.currency_in_id ?? '')
  const [currOut, setCurrOut] = useState(defaultValues?.currency_out_id ?? '')
  const [orderType, setOrderType] = useState<OrderType>(defaultValues?.order_type ?? 'BUY')
  const [amountIn, setAmountIn] = useState(defaultValues?.amount_in ?? '')
  const [amountOut, setAmountOut] = useState(defaultValues?.amount_out ?? '')
  const [rate, setRate] = useState(defaultValues?.exchange_rate ?? '')
  const [description, setDescription] = useState(defaultValues?.description ?? '')
  const [createdAt, setCreatedAt] = useState(() => nowIstanbulISO())
  const [corrReason, setCorrReason] = useState('')
  const [err, setErr] = useState('')

  const clientOpts = clients.map(u => ({ value: u.id, label: `${u.name}${u.surname ? ' ' + u.surname : ''}`, sublabel: `@${u.username}` }))
  const currOpts = currencies.map(currencyOption)
  const currencyMap: Record<string, CurrencyRead> = {}
  currencies.forEach(c => { currencyMap[c.ticker] = c })

  const submit = () => {
    if (!clientId) { setErr('Client is required'); return }
    if (!currIn) { setErr('Currency in is required'); return }
    if (!currOut) { setErr('Currency out is required'); return }
    if (!amountIn || !amountOut || !rate) { setErr('Amounts and rate are required'); return }
    if (isCorrection && !corrReason) { setErr('Correction reason is required'); return }
    onSubmit({
      client_id: clientId, order_type: orderType, currency_in_id: currIn, currency_out_id: currOut,
      amount_in: amountIn, amount_out: amountOut, exchange_rate: rate, description: description || null,
      created_at: istanbulLocalToUTC(createdAt),
      ...(isCorrection ? { correction_reason: corrReason } : {}),
    })
  }

  const close = () => { setErr(''); onClose() }

  return (
    <Modal open={open} onClose={close} title={title} size="lg">
      <div className="space-y-4">
        {err && <Alert type="error" message={err} />}
        <SearchableSelect label="Client *" options={clientOpts} value={clientId} onChange={v => setClientId(Number(v))} placeholder="Select client..." />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Order Type *</label>
            <div className="flex gap-2">
              {(['BUY', 'SELL'] as const).map(t => (
                <button key={t} type="button" onClick={() => setOrderType(t)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${orderType === t ? (t === 'BUY' ? 'bg-green-500 text-white' : 'bg-blue-500 text-white') : 'bg-gray-100 text-gray-600'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <RateCalculator
            rate={rate}
            setRate={setRate}
            amountIn={amountIn}
            setAmountIn={setAmountIn}
            amountOut={amountOut}
            setAmountOut={setAmountOut}
            amountInDecimals={currencyMap[currIn]?.decimals}
            amountOutDecimals={currencyMap[currOut]?.decimals}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SearchableSelect label="Currency In *" options={currOpts} value={currIn} onChange={v => setCurrIn(String(v))} placeholder="Select..." />
          <SearchableSelect label="Currency Out *" options={currOpts} value={currOut} onChange={v => setCurrOut(String(v))} placeholder="Select..." />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Amount In *" type="number" step="any" value={amountIn} onChange={e => setAmountIn(e.target.value)} />
          <Input label="Amount Out *" type="number" step="any" value={amountOut} onChange={e => setAmountOut(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Description</label>
            <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional note..." className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] resize-none" />
          </div>
          <Input
            label="Date & Time"
            type="datetime-local"
            value={createdAt}
            onChange={e => setCreatedAt(e.target.value)}
          />
        </div>
        {isCorrection && (
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Correction Reason *</label>
            <textarea rows={2} value={corrReason} onChange={e => setCorrReason(e.target.value)} placeholder="Why is this correction needed?" className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] resize-none" />
          </div>
        )}
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end sm:gap-3">
          <Button variant="secondary" size="sm" onClick={close} className="justify-center">Cancel</Button>
          <Button size="sm" onClick={submit} loading={loading} className="justify-center">{isCorrection ? 'Apply Correction' : 'Create Order'}</Button>
        </div>
      </div>
    </Modal>
  )
}

function VoidModal({ open, title, onClose, onSubmit, loading }: {
  open: boolean; title: string; onClose: () => void; onSubmit: (reason: string) => void; loading: boolean
}) {
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  const submit = () => {
    if (!reason.trim()) { setErr('Reason is required'); return }
    onSubmit(reason)
  }
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <div className="space-y-4">
        {err && <Alert type="error" message={err} />}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Void Reason *</label>
          <textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="Why are you voiding this record?" className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] resize-none" />
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <Button variant="secondary" size="sm" onClick={onClose} className="justify-center">Cancel</Button>
          <Button variant="danger" size="sm" onClick={submit} loading={loading} className="justify-center">Void</Button>
        </div>
      </div>
    </Modal>
  )
}

export { VoidModal }
