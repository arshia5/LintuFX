import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Ban, Edit3, Trash2 } from 'lucide-react'
import { listJournalEntries, createJournalEntry, voidJournalEntry, correctJournalEntry, deleteJournalEntry, listWallets, listCurrencies, listUsers } from '../api'
import { PageHeader, Button, Table, Modal, Input, Alert, ConfirmDialog, Card, SearchableSelect, VoidBadge, FilterBar, initFilters } from '../components/ui'
import type { FilterDef, FilterValues } from '../components/ui'
import { VoidModal } from './Orders'
import type { JournalEntryRead, WalletRead, CurrencyRead, UserRead } from '../types'

import { fmtDateTimeShort, nowIstanbulISO, istanbulLocalToUTC } from '../utils/date'

function fmtAmt(s: string) {
  const n = parseFloat(s)
  return isNaN(n) ? s : new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(n)
}
const fmtDate = fmtDateTimeShort

export default function JournalEntries() {
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [voidTarget, setVoidTarget] = useState<JournalEntryRead | null>(null)
  const [correctTarget, setCorrectTarget] = useState<JournalEntryRead | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<JournalEntryRead | null>(null)
  const [apiError, setApiError] = useState('')

  const { data: entries = [], isLoading } = useQuery({ queryKey: ['journal-entries'], queryFn: () => listJournalEntries() })
  const { data: wallets = [] } = useQuery({ queryKey: ['wallets'], queryFn: () => listWallets() })
  const { data: currencies = [] } = useQuery({ queryKey: ['currencies'], queryFn: () => listCurrencies() })
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: () => listUsers() })

  const userMap: Record<number, UserRead> = {}
  users.forEach((u: UserRead) => { userMap[u.id] = u })

  const walletMap: Record<number, WalletRead> = {}
  wallets.forEach((w: WalletRead) => { walletMap[w.id] = w })

  const currMap: Record<string, CurrencyRead> = {}
  currencies.forEach((c: CurrencyRead) => { currMap[c.ticker] = c })

  function walletUser(id: number): UserRead | null {
    const w = walletMap[id]
    return w ? (userMap[w.user_id] ?? null) : null
  }

  const createMut = useMutation({
    mutationFn: createJournalEntry,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['journal-entries'] }); setCreateOpen(false) },
    onError: (e: { response?: { data?: { detail?: string } } }) => setApiError(e.response?.data?.detail || 'Failed'),
  })

  const voidMut = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => voidJournalEntry(id, { reason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['journal-entries'] }); setVoidTarget(null) },
  })

  const deleteMut = useMutation({
    mutationFn: deleteJournalEntry,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['journal-entries'] }); setDeleteTarget(null) },
  })

  const correctMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) => correctJournalEntry(id, data as unknown as Parameters<typeof correctJournalEntry>[1]),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['journal-entries'] }); setCorrectTarget(null) },
    onError: (e: { response?: { data?: { detail?: string } } }) => setApiError(e.response?.data?.detail || 'Failed'),
  })

  // ── Filters ────────────────────────────────────────────────────────────────
  const filterDefs: FilterDef[] = useMemo(() => [
    { key: 'from', label: 'From', type: 'text', placeholder: 'Search sender name...' },
    { key: 'to', label: 'To', type: 'text', placeholder: 'Search receiver name...' },
    { key: 'currency', label: 'Currency', type: 'text', placeholder: 'e.g. USD' },
    {
      key: 'status', label: 'Status', type: 'toggle',
      options: [{ value: 'active', label: 'Active' }, { value: 'voided', label: 'Voided' }],
    },
  ], [])

  const [filterVals, setFilterVals] = useState<FilterValues>(() => initFilters(filterDefs))

  const filtered = useMemo(() => {
    return entries.filter((e: JournalEntryRead) => {
      const fromU = walletUser(e.from_wallet_id)
      const toU = walletUser(e.to_wallet_id)
      const fromName = fromU ? `${fromU.name} ${fromU.surname ?? ''} ${fromU.username}`.toLowerCase() : ''
      const toName = toU ? `${toU.name} ${toU.surname ?? ''} ${toU.username}`.toLowerCase() : ''

      const fromSearch = (filterVals.from as string).toLowerCase()
      if (fromSearch && !fromName.includes(fromSearch)) return false

      const toSearch = (filterVals.to as string).toLowerCase()
      if (toSearch && !toName.includes(toSearch)) return false

      const curr = (filterVals.currency as string).toLowerCase()
      if (curr && !e.currency_id.toLowerCase().includes(curr)) return false

      const st = filterVals.status as string
      if (st === 'active' && e.voided_at) return false
      if (st === 'voided' && !e.voided_at) return false

      return true
    })
  }, [entries, filterVals, walletMap, userMap])

  const columns = [
    { key: 'id', header: '#', render: (r: JournalEntryRead) => <span className="font-mono text-xs text-gray-400">#{r.id}</span>, sortValue: (r: JournalEntryRead) => r.id },
    {
      key: 'from', header: 'From',
      render: (r: JournalEntryRead) => {
        const u = walletUser(r.from_wallet_id)
        return u ? (
          <div>
            <p className="text-sm font-medium text-gray-900">{u.name}{u.surname ? ` ${u.surname}` : ''}</p>
            <p className="text-xs text-gray-400">@{u.username}</p>
          </div>
        ) : <span className="text-xs text-gray-400">Wallet #{r.from_wallet_id}</span>
      },
      sortValue: (r: JournalEntryRead) => walletUser(r.from_wallet_id)?.name ?? '',
    },
    { key: 'arrow', header: '', render: () => <span className="text-gray-300 font-bold">→</span> },
    {
      key: 'to', header: 'To',
      render: (r: JournalEntryRead) => {
        const u = walletUser(r.to_wallet_id)
        return u ? (
          <div>
            <p className="text-sm font-medium text-gray-900">{u.name}{u.surname ? ` ${u.surname}` : ''}</p>
            <p className="text-xs text-gray-400">@{u.username}</p>
          </div>
        ) : <span className="text-xs text-gray-400">Wallet #{r.to_wallet_id}</span>
      },
      sortValue: (r: JournalEntryRead) => walletUser(r.to_wallet_id)?.name ?? '',
    },
    {
      key: 'transfer', header: 'Transfer',
      render: (r: JournalEntryRead) => {
        const c = currMap[r.currency_id]
        const symbol = c?.symbol ?? r.currency_id
        return (
          <div>
            <span className="font-semibold text-[var(--color-primary)] text-sm">{symbol}</span>
            <span className="font-semibold text-gray-900 ml-0.5">{fmtAmt(r.amount)}</span>
          </div>
        )
      },
      sortValue: (r: JournalEntryRead) => parseFloat(r.amount),
    },
    { key: 'description', header: 'Note', render: (r: JournalEntryRead) => <span className="text-xs text-gray-500 max-w-[140px] block truncate">{r.description || '—'}</span> },
    { key: 'status', header: 'Status', render: (r: JournalEntryRead) => <VoidBadge voidedAt={r.voided_at} />, sortValue: (r: JournalEntryRead) => r.voided_at ?? '' },
    { key: 'created_at', header: 'Date', render: (r: JournalEntryRead) => <span className="text-xs text-gray-400">{fmtDate(r.created_at)}</span>, sortValue: (r: JournalEntryRead) => r.created_at },
    {
      key: 'actions', header: '', render: (r: JournalEntryRead) => (
        <div className="flex gap-1 justify-end">
          {!r.voided_at && <>
            <Button size="sm" variant="ghost" icon={<Edit3 size={13} />} onClick={e => { e.stopPropagation(); setCorrectTarget(r) }} />
            <Button size="sm" variant="ghost" icon={<Ban size={13} />} onClick={e => { e.stopPropagation(); setVoidTarget(r) }} className="text-orange-500 hover:bg-orange-50" />
          </>}
          <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={e => { e.stopPropagation(); setDeleteTarget(r) }} className="text-red-500 hover:bg-red-50" />
        </div>
      )
    },
  ]

  return (
    <div>
      <PageHeader title="Journal Entries" subtitle="Record actual money movements between wallets" action={<Button icon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>New Entry</Button>} />

      {apiError && <div className="mb-4"><Alert type="error" message={apiError} onClose={() => setApiError('')} /></div>}

      <FilterBar filters={filterDefs} values={filterVals} onChange={setFilterVals} resultCount={filtered.length} />

      <Card>
        <Table columns={columns} data={filtered} keyFn={r => r.id} loading={isLoading} emptyMessage="No journal entries match your filters" defaultSortKey="created_at" defaultSortDir="desc" />
      </Card>

      <JournalFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={data => createMut.mutate(data as unknown as Parameters<typeof createJournalEntry>[0])}
        loading={createMut.isPending}
        title="New Journal Entry"
        wallets={wallets}
        currencies={currencies}
        userMap={userMap}
      />

      {correctTarget && (
        <JournalFormModal
          open
          onClose={() => setCorrectTarget(null)}
          onSubmit={data => correctMut.mutate({ id: correctTarget.id, data })}
          loading={correctMut.isPending}
          title={`Correct Entry #${correctTarget.id}`}
          wallets={wallets}
          currencies={currencies}
          userMap={userMap}
          defaultValues={correctTarget}
          isCorrection
        />
      )}

      <VoidModal
        open={!!voidTarget}
        title={`Void Entry #${voidTarget?.id}`}
        onClose={() => setVoidTarget(null)}
        onSubmit={reason => voidTarget && voidMut.mutate({ id: voidTarget.id, reason })}
        loading={voidMut.isPending}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
        title="Delete Journal Entry"
        message={`Delete entry #${deleteTarget?.id}? This cannot be undone.`}
        confirmLabel="Delete"
        loading={deleteMut.isPending}
      />
    </div>
  )
}

function JournalFormModal({ open, onClose, onSubmit, loading, title, wallets, currencies, userMap, defaultValues, isCorrection }: {
  open: boolean; onClose: () => void; title: string; loading: boolean
  wallets: WalletRead[]; currencies: CurrencyRead[]; userMap: Record<number, UserRead>
  onSubmit: (d: Record<string, unknown>) => void; defaultValues?: JournalEntryRead; isCorrection?: boolean
}) {
  // Derive default user IDs from wallet IDs when correcting
  const defaultFromUser = defaultValues ? (wallets.find(w => w.id === defaultValues.from_wallet_id)?.user_id ?? null) : null
  const defaultToUser = defaultValues ? (wallets.find(w => w.id === defaultValues.to_wallet_id)?.user_id ?? null) : null

  const [fromUser, setFromUser] = useState<number | null>(defaultFromUser)
  const [toUser, setToUser] = useState<number | null>(defaultToUser)
  const [currencyId, setCurrencyId] = useState(defaultValues?.currency_id ?? '')
  const [amount, setAmount] = useState(defaultValues?.amount ?? '')
  const [description, setDescription] = useState(defaultValues?.description ?? '')
  const [corrReason, setCorrReason] = useState('')
  const [createdAt, setCreatedAt] = useState(() => nowIstanbulISO())
  const [err, setErr] = useState('')

  const userOpts = Object.values(userMap).map(u => ({
    value: u.id,
    label: `${u.name}${u.surname ? ' ' + u.surname : ''}`,
    sublabel: `@${u.username} · ${u.role}`,
  }))

  // Currencies available for the selected pair of users (intersection of both users' wallet currencies)
  const fromCurrencies = new Set(wallets.filter(w => w.user_id === fromUser).map(w => w.currency_id))
  const toCurrencies = new Set(wallets.filter(w => w.user_id === toUser).map(w => w.currency_id))
  const sharedCurrencies = currencies.filter(c => fromCurrencies.has(c.ticker) && toCurrencies.has(c.ticker))
  const allCurrencies = currencies // fallback when one side not yet picked

  const currOpts = (fromUser && toUser ? sharedCurrencies : allCurrencies).map(c => ({
    value: c.ticker,
    label: `${c.ticker} — ${c.name}`,
  }))

  // Resolve wallet IDs from user + currency
  const resolvedFromWallet = wallets.find(w => w.user_id === fromUser && w.currency_id === currencyId)
  const resolvedToWallet = wallets.find(w => w.user_id === toUser && w.currency_id === currencyId)

  const submit = () => {
    if (!fromUser || !toUser) { setErr('Both people are required'); return }
    if (!currencyId) { setErr('Currency is required'); return }
    if (!amount) { setErr('Amount is required'); return }
    if (!resolvedFromWallet) { setErr(`${userMap[fromUser]?.name ?? 'From user'} has no ${currencyId} wallet`); return }
    if (!resolvedToWallet) { setErr(`${userMap[toUser]?.name ?? 'To user'} has no ${currencyId} wallet`); return }
    if (isCorrection && !corrReason) { setErr('Correction reason is required'); return }
    onSubmit({
      from_wallet_id: resolvedFromWallet.id,
      to_wallet_id: resolvedToWallet.id,
      currency_id: currencyId,
      amount,
      description: description || null,
      created_at: istanbulLocalToUTC(createdAt),
      ...(isCorrection ? { correction_reason: corrReason } : {}),
    })
  }

  return (
    <Modal open={open} onClose={onClose} title={title} size="lg">
      <div className="space-y-4">
        {err && <Alert type="error" message={err} />}

        <div className="grid grid-cols-2 gap-3">
          <SearchableSelect
            label="From (sender) *"
            options={userOpts}
            value={fromUser}
            onChange={v => { setFromUser(Number(v)); setCurrencyId('') }}
            placeholder="Select person..."
          />
          <SearchableSelect
            label="To (receiver) *"
            options={userOpts}
            value={toUser}
            onChange={v => { setToUser(Number(v)); setCurrencyId('') }}
            placeholder="Select person..."
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <SearchableSelect
            label="Currency *"
            options={currOpts}
            value={currencyId}
            onChange={v => setCurrencyId(String(v))}
            placeholder={fromUser && toUser && sharedCurrencies.length === 0 ? 'No shared wallets' : 'Select currency...'}
            disabled={!fromUser || !toUser}
          />
          <Input label="Amount *" type="number" step="any" value={amount} onChange={e => setAmount(e.target.value)} disabled={!currencyId} />
        </div>

        {/* Resolved wallet preview */}
        {currencyId && (fromUser || toUser) && (
          <div className="bg-gray-50 rounded-lg px-4 py-3 text-xs text-gray-500 grid grid-cols-2 gap-2">
            <div>
              <span className="font-medium text-gray-600">From wallet: </span>
              {resolvedFromWallet
                ? <span className="text-green-700">#{resolvedFromWallet.id} · balance {fmtAmt(resolvedFromWallet.balance)}</span>
                : <span className="text-red-500">No {currencyId} wallet found</span>}
            </div>
            <div>
              <span className="font-medium text-gray-600">To wallet: </span>
              {resolvedToWallet
                ? <span className="text-green-700">#{resolvedToWallet.id} · balance {fmtAmt(resolvedToWallet.balance)}</span>
                : <span className="text-red-500">No {currencyId} wallet found</span>}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Description</label>
            <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] resize-none" />
          </div>
          <Input label="Date & Time" type="datetime-local" value={createdAt} onChange={e => setCreatedAt(e.target.value)} />
        </div>
        {isCorrection && (
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Correction Reason *</label>
            <textarea rows={2} value={corrReason} onChange={e => setCorrReason(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] resize-none" />
          </div>
        )}
        <div className="flex gap-3 justify-end pt-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} loading={loading}>{isCorrection ? 'Apply Correction' : 'Create Entry'}</Button>
        </div>
      </div>
    </Modal>
  )
}
