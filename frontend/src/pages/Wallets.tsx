import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Plus, Trash2, SlidersHorizontal, History } from 'lucide-react'
import { listWallets, createWallet, deleteWallet, adjustWalletBalance, listWalletAdjustments, listUsers, listCurrencies } from '../api'
import { PageHeader, Button, Table, Modal, Input, Alert, ConfirmDialog, Card, SearchableSelect, Textarea, Badge, FilterBar, initFilters } from '../components/ui'
import type { FilterDef, FilterValues } from '../components/ui'
import type { WalletRead, WalletAdjustmentRead, UserRead, CurrencyRead, WalletCreate } from '../types'
import { fmtDateTimeShort } from '../utils/date'
import { formatCurrencyNumber } from '../utils/number'
const fmtDate = fmtDateTimeShort
const ALL_CURRENCIES = '__ALL_CURRENCIES__'

type CreateWalletFormData = {
  user_id: number
  currency_id: string
  balance?: string
}

export default function Wallets() {
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [adjustTarget, setAdjustTarget] = useState<WalletRead | null>(null)
  const [historyTarget, setHistoryTarget] = useState<WalletRead | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<WalletRead | null>(null)
  const [apiError, setApiError] = useState('')

  const { data: wallets = [], isLoading } = useQuery({ queryKey: ['wallets'], queryFn: () => listWallets() })
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: () => listUsers() })
  const { data: currencies = [] } = useQuery({ queryKey: ['currencies'], queryFn: () => listCurrencies() })

  const userMap: Record<number, UserRead> = {}
  users.forEach((u: UserRead) => { userMap[u.id] = u })

  const currMap: Record<string, CurrencyRead> = {}
  currencies.forEach((c: CurrencyRead) => { currMap[c.ticker] = c })
  const money = (value: string | number, currencyId: string) =>
    formatCurrencyNumber(value, currMap[currencyId]?.decimals)

  const createMut = useMutation({
    mutationFn: async (data: CreateWalletFormData) => {
      if (data.currency_id !== ALL_CURRENCIES) {
        return createWallet(data as WalletCreate)
      }

      const existing = new Set(
        wallets
          .filter((wallet: WalletRead) => wallet.user_id === data.user_id)
          .map((wallet: WalletRead) => wallet.currency_id)
      )
      const missingCurrencies = currencies.filter((currency: CurrencyRead) => !existing.has(currency.ticker))

      if (missingCurrencies.length === 0) {
        throw new Error('This user already has wallets for every currency')
      }

      return Promise.all(
        missingCurrencies.map((currency: CurrencyRead) =>
          createWallet({ user_id: data.user_id, currency_id: currency.ticker, balance: data.balance })
        )
      )
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['wallets'] }); setCreateOpen(false) },
    onError: (e: { response?: { data?: { detail?: string } }; message?: string }) => setApiError(e.response?.data?.detail || e.message || 'Failed to create wallet'),
  })

  const deleteMut = useMutation({
    mutationFn: deleteWallet,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['wallets'] }); setDeleteTarget(null) },
  })

  const adjustMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { balance_after?: number | null; amount_delta?: number | null; reason: string } }) =>
      adjustWalletBalance(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['wallets'] }); setAdjustTarget(null) },
    onError: (e: { response?: { data?: { detail?: string } } }) => setApiError(e.response?.data?.detail || 'Failed to adjust balance'),
  })

  const columns = [
    {
      key: 'user', header: 'Owner', render: (r: WalletRead) => {
        const u = userMap[r.user_id]
        return u ? (
          <div>
            <p className="text-sm font-medium">{u.name}{u.surname ? ` ${u.surname}` : ''}</p>
            <p className="text-xs text-gray-400">@{u.username}</p>
          </div>
        ) : <span className="text-gray-400 font-mono text-xs">User #{r.user_id}</span>
      }
    },
    {
      key: 'currency', header: 'Currency', render: (r: WalletRead) => {
        const c = currMap[r.currency_id]
        return <span className="text-sm font-medium text-gray-800">{c?.name || r.currency_id}</span>
      }
    },
    {
      key: 'balance', header: 'Balance', render: (r: WalletRead) => {
        const n = parseFloat(r.balance)
        return (
          <span className={`font-semibold ${n < 0 ? 'text-red-600' : n > 0 ? 'text-green-600' : 'text-gray-500'}`}>
            {money(r.balance, r.currency_id)}
          </span>
        )
      }
    },
    { key: 'id', header: 'ID', render: (r: WalletRead) => <span className="text-gray-400 text-xs font-mono">#{r.id}</span> },
    { key: 'created_at', header: 'Created', render: (r: WalletRead) => <span className="text-gray-400 text-xs">{fmtDate(r.created_at)}</span> },
    {
      key: 'actions', header: '', render: (r: WalletRead) => (
        <div className="flex gap-1.5 justify-end">
          <Button size="sm" variant="ghost" icon={<SlidersHorizontal size={14} />} onClick={e => { e.stopPropagation(); setAdjustTarget(r) }}>Adjust</Button>
          <Button size="sm" variant="ghost" icon={<History size={14} />} onClick={e => { e.stopPropagation(); setHistoryTarget(r) }}>History</Button>
          <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={e => { e.stopPropagation(); setDeleteTarget(r) }} className="text-red-500 hover:bg-red-50" />
        </div>
      )
    },
  ]

  // ── Filters ────────────────────────────────────────────────────────────────
  const filterDefs: FilterDef[] = useMemo(() => [
    { key: 'owner', label: 'Owner', type: 'text', placeholder: 'Search by owner name...' },
    { key: 'currency', label: 'Currency', type: 'text', placeholder: 'e.g. USD' },
    {
      key: 'balance', label: 'Balance', type: 'toggle',
      options: [
        { value: 'positive', label: 'Positive' },
        { value: 'negative', label: 'Negative' },
        { value: 'zero', label: 'Zero' },
      ],
    },
    {
      key: 'role', label: 'Owner Role', type: 'toggle',
      options: [
        { value: 'CLIENT', label: 'Client' },
        { value: 'HOUSE', label: 'House' },
        { value: 'DEVELOPER', label: 'Developer' },
      ],
    },
  ], [])

  const [filterVals, setFilterVals] = useState<FilterValues>(() => initFilters(filterDefs))

  const filtered = useMemo(() => {
    return wallets.filter((w: WalletRead) => {
      const u = userMap[w.user_id]
      const ownerName = u ? `${u.name} ${u.surname ?? ''} ${u.username}`.toLowerCase() : ''
      const ownerSearch = (filterVals.owner as string).toLowerCase()
      if (ownerSearch && !ownerName.includes(ownerSearch)) return false

      const curr = (filterVals.currency as string).toLowerCase()
      if (curr && !w.currency_id.toLowerCase().includes(curr)) return false

      const bal = filterVals.balance as string
      const n = parseFloat(w.balance)
      if (bal === 'positive' && n <= 0) return false
      if (bal === 'negative' && n >= 0) return false
      if (bal === 'zero' && n !== 0) return false

      const role = filterVals.role as string
      if (role && u?.role !== role) return false

      return true
    })
  }, [wallets, filterVals, userMap])

  return (
    <div>
      <PageHeader title="Wallets" subtitle="Client and house currency wallets" action={<Button icon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>New Wallet</Button>} />

      {apiError && <div className="mb-4"><Alert type="error" message={apiError} onClose={() => setApiError('')} /></div>}

      <FilterBar filters={filterDefs} values={filterVals} onChange={setFilterVals} resultCount={filtered.length} />

      <Card>
        <Table columns={columns} data={filtered} keyFn={r => r.id} loading={isLoading} emptyMessage="No wallets match your filters" pagination />
      </Card>

      {/* Create Wallet */}
      <CreateWalletModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={data => createMut.mutate(data)}
        loading={createMut.isPending}
        users={users}
        currencies={currencies}
        wallets={wallets}
      />

      {/* Adjust Balance */}
      {adjustTarget && (
        <AdjustModal
          wallet={adjustTarget}
          user={userMap[adjustTarget.user_id]}
          currency={currMap[adjustTarget.currency_id]}
          onClose={() => setAdjustTarget(null)}
          onSubmit={d => adjustMut.mutate({ id: adjustTarget.id, data: d })}
          loading={adjustMut.isPending}
        />
      )}

      {/* History */}
      {historyTarget && (
        <HistoryModal
          wallet={historyTarget}
          user={userMap[historyTarget.user_id]}
          currency={currMap[historyTarget.currency_id]}
          onClose={() => setHistoryTarget(null)}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
        title="Delete Wallet"
        message={`Delete this ${deleteTarget?.currency_id} wallet? This cannot be undone.`}
        confirmLabel="Delete"
        loading={deleteMut.isPending}
      />
    </div>
  )
}

function CreateWalletModal({ open, onClose, onSubmit, loading, users, currencies, wallets }: {
  open: boolean; onClose: () => void; onSubmit: (d: CreateWalletFormData) => void
  loading: boolean; users: UserRead[]; currencies: CurrencyRead[]; wallets: WalletRead[]
}) {
  const [userId, setUserId] = useState<number | null>(null)
  const [currencyId, setCurrencyId] = useState<string | null>(null)
  const [balance, setBalance] = useState('0')
  const [err, setErr] = useState('')

  const userOpts = users.map(u => ({ value: u.id, label: `${u.name}${u.surname ? ' ' + u.surname : ''}`, sublabel: `@${u.username} · ${u.role}` }))
  const existingForUser = userId
    ? new Set(wallets.filter(w => w.user_id === userId).map(w => w.currency_id))
    : new Set<string>()
  const missingCount = currencies.filter(c => !existingForUser.has(c.ticker)).length
  const currOpts = [
    { value: ALL_CURRENCIES, label: 'All currencies', sublabel: userId ? `${missingCount} missing wallet${missingCount === 1 ? '' : 's'}` : 'Create one wallet per currency' },
    ...currencies.map(c => ({ value: c.ticker, label: c.name || c.ticker })),
  ]

  const submit = () => {
    if (!userId) { setErr('Please select a user'); return }
    if (!currencyId) { setErr('Please select a currency'); return }
    if (currencyId === ALL_CURRENCIES && missingCount === 0) { setErr('This user already has wallets for every currency'); return }
    onSubmit({ user_id: userId, currency_id: currencyId, balance })
  }

  const close = () => { setUserId(null); setCurrencyId(null); setBalance('0'); setErr(''); onClose() }

  return (
    <Modal open={open} onClose={close} title="New Wallet">
      <div className="space-y-4">
        {err && <Alert type="error" message={err} />}
        <SearchableSelect label="Owner *" options={userOpts} value={userId} onChange={v => { setUserId(Number(v)); setCurrencyId(null) }} placeholder="Select a user..." />
        <SearchableSelect label="Currency *" options={currOpts} value={currencyId} onChange={v => setCurrencyId(String(v))} placeholder="Select currency..." />
        <Input label="Initial Balance" type="number" value={balance} onChange={e => setBalance(e.target.value)} />
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end sm:gap-3">
          <Button variant="secondary" size="sm" onClick={close}>Cancel</Button>
          <Button size="sm" onClick={submit} loading={loading}>
            {currencyId === ALL_CURRENCIES ? `Create ${missingCount} Wallet${missingCount === 1 ? '' : 's'}` : 'Create Wallet'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function AdjustModal({ wallet, user, currency, onClose, onSubmit, loading }: {
  wallet: WalletRead; user?: UserRead; currency?: CurrencyRead; onClose: () => void
  onSubmit: (d: { balance_after?: number | null; amount_delta?: number | null; reason: string }) => void; loading: boolean
}) {
  const [mode, setMode] = useState<'delta' | 'set'>('delta')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')

  const submit = () => {
    if (!reason.trim()) { setErr('Reason is required'); return }
    if (!amount) { setErr('Amount is required'); return }
    if (mode === 'delta') onSubmit({ amount_delta: Number(amount), reason })
    else onSubmit({ balance_after: Number(amount), reason })
  }

  return (
    <Modal open onClose={onClose} title={`Adjust Wallet Balance`}>
      <div className="space-y-4">
        <div className="bg-gray-50 rounded-lg p-3 text-sm">
          <p className="text-gray-500">Wallet: <span className="font-semibold text-gray-800">#{wallet.id} · {wallet.currency_id}</span></p>
          {user && <p className="text-gray-500 mt-0.5">Owner: <span className="font-semibold text-gray-800">{user.name}{user.surname ? ` ${user.surname}` : ''}</span></p>}
          <p className="text-gray-500 mt-0.5">Current balance: <span className="font-bold text-[var(--color-primary)]">{formatCurrencyNumber(wallet.balance, currency?.decimals)}</span></p>
        </div>

        {err && <Alert type="error" message={err} />}

        <div className="flex gap-2">
          {(['delta', 'set'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${mode === m ? 'bg-[var(--color-primary)] text-white' : 'bg-gray-100 text-gray-600'}`}>
              {m === 'delta' ? 'Add / Subtract' : 'Set to Amount'}
            </button>
          ))}
        </div>

        <Input
          label={mode === 'delta' ? 'Delta Amount (negative to subtract)' : 'New Balance'}
          type="number"
          placeholder={mode === 'delta' ? 'e.g. 100 or -50' : 'e.g. 500.00'}
          value={amount}
          onChange={e => setAmount(e.target.value)}
        />

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Reason *</label>
          <textarea
            rows={2}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Why are you adjusting this balance?"
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] resize-none"
          />
        </div>

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end sm:gap-3">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} loading={loading}>Apply Adjustment</Button>
        </div>
      </div>
    </Modal>
  )
}

function HistoryModal({ wallet, user, currency, onClose }: { wallet: WalletRead; user?: UserRead; currency?: CurrencyRead; onClose: () => void }) {
  const { data: adjustments = [], isLoading } = useQuery({
    queryKey: ['wallet-adjustments', wallet.id],
    queryFn: () => listWalletAdjustments({ wallet_id: wallet.id }),
  })

  const cols = [
    { key: 'created_at', header: 'Date', render: (r: WalletAdjustmentRead) => <span className="text-xs text-gray-500">{fmtDate(r.created_at)}</span> },
    { key: 'amount_delta', header: 'Delta', render: (r: WalletAdjustmentRead) => {
      const n = parseFloat(r.amount_delta)
      return <span className={`font-semibold text-sm ${n >= 0 ? 'text-green-600' : 'text-red-500'}`}>{n >= 0 ? '+' : ''}{formatCurrencyNumber(r.amount_delta, currency?.decimals)}</span>
    }},
    { key: 'balance_after', header: 'After', render: (r: WalletAdjustmentRead) => <span className="font-medium text-sm">{formatCurrencyNumber(r.balance_after, currency?.decimals)}</span> },
    { key: 'reason', header: 'Reason', render: (r: WalletAdjustmentRead) => <span className="text-xs text-gray-600 truncate max-w-[180px] block">{r.reason}</span> },
  ]

  return (
    <Modal open onClose={onClose} title={`Balance History — Wallet #${wallet.id}`} size="lg">
      <div className="bg-gray-50 rounded-lg p-3 text-sm mb-4">
        {user && <span className="text-gray-600">{user.name} · </span>}
        <span className="font-semibold text-[var(--color-primary)]">{wallet.currency_id}</span>
        <span className="text-gray-600"> · Current: </span>
        <span className="font-bold">{formatCurrencyNumber(wallet.balance, currency?.decimals)}</span>
      </div>
      <Table columns={cols} data={adjustments} keyFn={r => r.id} loading={isLoading} emptyMessage="No adjustments yet" />
    </Modal>
  )
}
