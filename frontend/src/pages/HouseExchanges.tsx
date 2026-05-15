import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Ban, Edit3, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { listHouseExchanges, createHouseExchange, voidHouseExchange, correctHouseExchange, deleteHouseExchange, listUsers, listCurrencies, listWallets } from '../api'
import { PageHeader, Button, Table, Modal, Input, Alert, ConfirmDialog, Card, SearchableSelect, VoidBadge, FilterBar, initFilters } from '../components/ui'
import type { FilterDef, FilterValues } from '../components/ui'
import { VoidModal } from './Orders'
import type { HouseExchangeRead, UserRead, CurrencyRead, WalletRead } from '../types'
import { fmtDateTimeShort } from '../utils/date'

function fmtAmt(s: string) {
  const n = parseFloat(s)
  return isNaN(n) ? s : new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(n)
}
const fmtDate = fmtDateTimeShort

export default function HouseExchanges() {
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [voidTarget, setVoidTarget] = useState<HouseExchangeRead | null>(null)
  const [correctTarget, setCorrectTarget] = useState<HouseExchangeRead | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<HouseExchangeRead | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [apiError, setApiError] = useState('')

  const { data: exchanges = [], isLoading } = useQuery({ queryKey: ['house-exchanges'], queryFn: () => listHouseExchanges() })
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: () => listUsers() })
  const { data: currencies = [] } = useQuery({ queryKey: ['currencies'], queryFn: () => listCurrencies() })
  const { data: wallets = [] } = useQuery({ queryKey: ['wallets'], queryFn: () => listWallets() })

  const userMap: Record<number, UserRead> = {}
  users.forEach((u: UserRead) => { userMap[u.id] = u })
  const houseUsers = users.filter((u: UserRead) => u.role === 'HOUSE')

  const createMut = useMutation({
    mutationFn: createHouseExchange,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['house-exchanges'] }); setCreateOpen(false) },
    onError: (e: { response?: { data?: { detail?: string } } }) => setApiError(e.response?.data?.detail || 'Failed'),
  })

  const voidMut = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => voidHouseExchange(id, { reason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['house-exchanges'] }); setVoidTarget(null) },
  })

  const deleteMut = useMutation({
    mutationFn: deleteHouseExchange,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['house-exchanges'] }); setDeleteTarget(null) },
  })

  const correctMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) => correctHouseExchange(id, data as unknown as Parameters<typeof correctHouseExchange>[1]),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['house-exchanges'] }); setCorrectTarget(null) },
    onError: (e: { response?: { data?: { detail?: string } } }) => setApiError(e.response?.data?.detail || 'Failed'),
  })

  const columns = [
    { key: 'id', header: '#', render: (r: HouseExchangeRead) => <span className="font-mono text-xs text-gray-400">#{r.id}</span>, sortValue: (r: HouseExchangeRead) => r.id },
    {
      key: 'house', header: 'House Account',
      render: (r: HouseExchangeRead) => {
        const u = userMap[r.house_id]
        return u ? <span className="text-sm font-medium">{u.name}</span> : <span className="text-gray-400 text-xs">#{r.house_id}</span>
      },
      sortValue: (r: HouseExchangeRead) => userMap[r.house_id]?.name ?? '',
    },
    { key: 'pair', header: 'From → To', render: (r: HouseExchangeRead) => <span className="font-mono font-semibold text-sm">{r.currency_from_id} → {r.currency_to_id}</span>, sortValue: (r: HouseExchangeRead) => `${r.currency_from_id}/${r.currency_to_id}` },
    { key: 'amount_from', header: 'Amount From', render: (r: HouseExchangeRead) => <span className="text-sm">{fmtAmt(r.amount_from)}</span>, sortValue: (r: HouseExchangeRead) => parseFloat(r.amount_from) },
    { key: 'amount_to', header: 'Amount To', render: (r: HouseExchangeRead) => <span className="text-sm">{fmtAmt(r.amount_to)}</span>, sortValue: (r: HouseExchangeRead) => parseFloat(r.amount_to) },
    { key: 'exchange_rate', header: 'Rate', render: (r: HouseExchangeRead) => <span className="font-mono text-xs text-gray-600">{r.exchange_rate}</span>, sortValue: (r: HouseExchangeRead) => parseFloat(r.exchange_rate) },
    { key: 'status', header: 'Status', render: (r: HouseExchangeRead) => <VoidBadge voidedAt={r.voided_at} />, sortValue: (r: HouseExchangeRead) => r.voided_at ?? '' },
    { key: 'created_at', header: 'Date', render: (r: HouseExchangeRead) => <span className="text-xs text-gray-400">{fmtDate(r.created_at)}</span>, sortValue: (r: HouseExchangeRead) => r.created_at },
    {
      key: 'actions', header: '', render: (r: HouseExchangeRead) => (
        <div className="flex gap-1 justify-end">
          <button onClick={e => { e.stopPropagation(); setExpanded(expanded === r.id ? null : r.id) }} className="p-1.5 rounded hover:bg-gray-100 text-gray-400">
            {expanded === r.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {!r.voided_at && <>
            <Button size="sm" variant="ghost" icon={<Edit3 size={13} />} onClick={e => { e.stopPropagation(); setCorrectTarget(r) }} />
            <Button size="sm" variant="ghost" icon={<Ban size={13} />} onClick={e => { e.stopPropagation(); setVoidTarget(r) }} className="text-orange-500 hover:bg-orange-50" />
          </>}
          <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={e => { e.stopPropagation(); setDeleteTarget(r) }} className="text-red-500 hover:bg-red-50" />
        </div>
      )
    },
  ]

  const expandedItem = exchanges.find((e: HouseExchangeRead) => e.id === expanded)

  // ── Filters ────────────────────────────────────────────────────────────────
  const filterDefs: FilterDef[] = useMemo(() => [
    { key: 'search', label: 'House Account', type: 'text', placeholder: 'Search house account name...' },
    { key: 'currency', label: 'Currency', type: 'text', placeholder: 'e.g. USD or EUR' },
    {
      key: 'status', label: 'Status', type: 'toggle',
      options: [{ value: 'active', label: 'Active' }, { value: 'voided', label: 'Voided' }],
    },
  ], [])

  const [filterVals, setFilterVals] = useState<FilterValues>(() => initFilters(filterDefs))

  const filtered = useMemo(() => {
    return exchanges.filter((e: HouseExchangeRead) => {
      const u = userMap[e.house_id]
      const houseName = u ? `${u.name} ${u.surname ?? ''} ${u.username}`.toLowerCase() : ''
      const search = (filterVals.search as string).toLowerCase()
      if (search && !houseName.includes(search)) return false

      const curr = (filterVals.currency as string).toLowerCase()
      if (curr) {
        const pair = `${e.currency_from_id} ${e.currency_to_id}`.toLowerCase()
        if (!pair.includes(curr)) return false
      }

      const st = filterVals.status as string
      if (st === 'active' && e.voided_at) return false
      if (st === 'voided' && !e.voided_at) return false

      return true
    })
  }, [exchanges, filterVals, userMap])

  return (
    <div>
      <PageHeader title="House Exchanges" subtitle="Treasury-only currency exchanges" action={<Button icon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>New Exchange</Button>} />

      {apiError && <div className="mb-4"><Alert type="error" message={apiError} onClose={() => setApiError('')} /></div>}

      <FilterBar filters={filterDefs} values={filterVals} onChange={setFilterVals} resultCount={filtered.length} />

      <Card>
        <Table columns={columns} data={filtered} keyFn={r => r.id} loading={isLoading} emptyMessage="No exchanges match your filters" defaultSortKey="created_at" defaultSortDir="desc" />
        {expandedItem && (
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 text-sm grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div><p className="text-xs text-gray-400">Description</p><p className="text-gray-700">{expandedItem.description || '—'}</p></div>
            <div><p className="text-xs text-gray-400">Created by</p><p className="text-gray-700">#{expandedItem.created_by_user_id}</p></div>
            {expandedItem.voided_at && <>
              <div><p className="text-xs text-gray-400">Voided at</p><p className="text-red-600">{fmtDate(expandedItem.voided_at)}</p></div>
              <div><p className="text-xs text-gray-400">Void reason</p><p className="text-red-600">{expandedItem.void_reason}</p></div>
            </>}
          </div>
        )}
      </Card>

      <ExchangeFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={data => createMut.mutate(data as unknown as Parameters<typeof createHouseExchange>[0])}
        loading={createMut.isPending}
        title="New House Exchange"
        houseUsers={houseUsers}
        currencies={currencies}
        wallets={wallets}
      />

      {correctTarget && (
        <ExchangeFormModal
          open
          onClose={() => setCorrectTarget(null)}
          onSubmit={data => correctMut.mutate({ id: correctTarget.id, data })}
          loading={correctMut.isPending}
          title={`Correct Exchange #${correctTarget.id}`}
          houseUsers={houseUsers}
          currencies={currencies}
          wallets={wallets}
          defaultValues={correctTarget}
          isCorrection
        />
      )}

      <VoidModal
        open={!!voidTarget}
        title={`Void Exchange #${voidTarget?.id}`}
        onClose={() => setVoidTarget(null)}
        onSubmit={reason => voidTarget && voidMut.mutate({ id: voidTarget.id, reason })}
        loading={voidMut.isPending}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
        title="Delete Exchange"
        message={`Delete exchange #${deleteTarget?.id}? This cannot be undone.`}
        confirmLabel="Delete"
        loading={deleteMut.isPending}
      />
    </div>
  )
}

function ExchangeFormModal({ open, onClose, onSubmit, loading, title, houseUsers, currencies, wallets, defaultValues, isCorrection }: {
  open: boolean; onClose: () => void; title: string; loading: boolean; houseUsers: UserRead[]; currencies: CurrencyRead[]
  wallets: WalletRead[]
  onSubmit: (d: Record<string, unknown>) => void; defaultValues?: HouseExchangeRead; isCorrection?: boolean
}) {
  const [houseId, setHouseId] = useState<number | null>(defaultValues?.house_id ?? null)
  const [currFrom, setCurrFrom] = useState(defaultValues?.currency_from_id ?? '')
  const [currTo, setCurrTo] = useState(defaultValues?.currency_to_id ?? '')
  const [amtFrom, setAmtFrom] = useState(defaultValues?.amount_from ?? '')
  const [amtTo, setAmtTo] = useState(defaultValues?.amount_to ?? '')
  const [rate, setRate] = useState(defaultValues?.exchange_rate ?? '')
  const [description, setDescription] = useState(defaultValues?.description ?? '')
  const [corrReason, setCorrReason] = useState('')
  const [err, setErr] = useState('')

  // Resolve wallets for the selected house account
  const houseWallets = wallets.filter(w => w.user_id === houseId)
  const walletFrom = houseWallets.find(w => w.currency_id === currFrom) ?? null
  const walletTo = houseWallets.find(w => w.currency_id === currTo) ?? null

  // Only show currencies the house account actually has wallets for
  const houseWalletCurrencies = new Set(houseWallets.map(w => w.currency_id))
  const currOpts = (houseId ? currencies.filter(c => houseWalletCurrencies.has(c.ticker)) : currencies)
    .map(c => ({ value: c.ticker, label: `${c.ticker} — ${c.name}` }))

  const houseOpts = houseUsers.map(u => ({ value: u.id, label: `${u.name}${u.surname ? ' ' + u.surname : ''}`, sublabel: `@${u.username}` }))

  const submit = () => {
    if (!houseId) { setErr('House account is required'); return }
    if (!currFrom || !currTo) { setErr('Both currencies are required'); return }
    if (!amtFrom || !amtTo || !rate) { setErr('Amounts and rate are required'); return }
    if (isCorrection && !corrReason) { setErr('Correction reason is required'); return }
    onSubmit({
      house_id: houseId, currency_from_id: currFrom, currency_to_id: currTo,
      amount_from: amtFrom, amount_to: amtTo, exchange_rate: rate, description: description || null,
      ...(isCorrection ? { correction_reason: corrReason } : {}),
    })
  }

  return (
    <Modal open={open} onClose={onClose} title={title} size="lg">
      <div className="space-y-4">
        {err && <Alert type="error" message={err} />}
        <SearchableSelect
          label="House Account *"
          options={houseOpts}
          value={houseId}
          onChange={v => { setHouseId(Number(v)); setCurrFrom(''); setCurrTo('') }}
          placeholder="Select house account..."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SearchableSelect
            label="Currency From *"
            options={currOpts}
            value={currFrom}
            onChange={v => setCurrFrom(String(v))}
            placeholder={houseId && currOpts.length === 0 ? 'No wallets found' : 'Select...'}
            disabled={!houseId}
          />
          <SearchableSelect
            label="Currency To *"
            options={currOpts}
            value={currTo}
            onChange={v => setCurrTo(String(v))}
            placeholder={houseId && currOpts.length === 0 ? 'No wallets found' : 'Select...'}
            disabled={!houseId}
          />
        </div>

        {/* Balance preview */}
        {houseId && (currFrom || currTo) && (
          <div className="bg-gray-50 rounded-lg px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="text-xs">
              <span className="text-gray-500 font-medium">From balance: </span>
              {currFrom
                ? walletFrom
                  ? <span className="text-green-700 font-semibold">{fmtAmt(walletFrom.balance)} {currFrom}</span>
                  : <span className="text-red-500">No {currFrom} wallet</span>
                : <span className="text-gray-400">— select currency</span>}
            </div>
            <div className="text-xs">
              <span className="text-gray-500 font-medium">To balance: </span>
              {currTo
                ? walletTo
                  ? <span className="text-green-700 font-semibold">{fmtAmt(walletTo.balance)} {currTo}</span>
                  : <span className="text-red-500">No {currTo} wallet</span>
                : <span className="text-gray-400">— select currency</span>}
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <Input label="Amount From *" type="number" step="any" value={amtFrom} onChange={e => setAmtFrom(e.target.value)} />
          <Input label="Amount To *" type="number" step="any" value={amtTo} onChange={e => setAmtTo(e.target.value)} />
          <Input label="Exchange Rate *" type="number" step="any" value={rate} onChange={e => setRate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Description</label>
          <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] resize-none" />
        </div>
        {isCorrection && (
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Correction Reason *</label>
            <textarea rows={2} value={corrReason} onChange={e => setCorrReason(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] resize-none" />
          </div>
        )}
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end sm:gap-3">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} loading={loading}>{isCorrection ? 'Apply Correction' : 'Create Exchange'}</Button>
        </div>
      </div>
    </Modal>
  )
}
