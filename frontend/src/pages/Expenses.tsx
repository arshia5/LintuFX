import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Ban, Edit3, ChevronDown, ChevronUp } from 'lucide-react'
import { listExpenses, createExpense, voidExpense, correctExpense, listUsers, listCurrencies, listWallets } from '../api'
import { PageHeader, Button, Table, Modal, Input, Alert, Card, Badge, SearchableSelect, VoidBadge, FilterBar, initFilters } from '../components/ui'
import type { FilterDef, FilterValues } from '../components/ui'
import { VoidModal } from './Orders'
import type { ExpenseRead, ExpenseType, UserRead, CurrencyRead, WalletRead } from '../types'
import { fmtDateTimeShort, nowIstanbulISO, istanbulLocalToUTC } from '../utils/date'
import { formatCurrencyNumber } from '../utils/number'
import { currencyOption, currencySearchText } from '../utils/currency'
const fmtDate = fmtDateTimeShort

const TYPE_META: Record<ExpenseType, { label: string; badge: 'red' | 'purple' }> = {
  EXPENSE: { label: 'Expense', badge: 'red' },
  WITHDRAWAL: { label: 'Withdrawal', badge: 'purple' },
}

export default function Expenses() {
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [voidTarget, setVoidTarget] = useState<ExpenseRead | null>(null)
  const [correctTarget, setCorrectTarget] = useState<ExpenseRead | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [apiError, setApiError] = useState('')

  const { data: expenses = [], isLoading } = useQuery({ queryKey: ['expenses'], queryFn: () => listExpenses() })
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: () => listUsers() })
  const { data: currencies = [] } = useQuery({ queryKey: ['currencies'], queryFn: () => listCurrencies() })
  const { data: wallets = [] } = useQuery({ queryKey: ['wallets'], queryFn: () => listWallets() })

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
  const houseUsers = users.filter((u: UserRead) => u.role === 'HOUSE')
  // Profit from a withdrawal can go to a HOUSE or DEVELOPER user.
  const recipientUsers = users.filter((u: UserRead) => u.role === 'HOUSE' || u.role === 'DEVELOPER')

  const createMut = useMutation({
    mutationFn: createExpense,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] })
      qc.invalidateQueries({ queryKey: ['wallets'] })
      setCreateOpen(false)
    },
    onError: (e: { response?: { data?: { detail?: string } } }) => setApiError(e.response?.data?.detail || 'Failed'),
  })

  const voidMut = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => voidExpense(id, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] })
      qc.invalidateQueries({ queryKey: ['wallets'] })
      setVoidTarget(null)
    },
    onError: (e: { response?: { data?: { detail?: string } } }) => setApiError(e.response?.data?.detail || 'Failed'),
  })

  const correctMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) => correctExpense(id, data as unknown as Parameters<typeof correctExpense>[1]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] })
      qc.invalidateQueries({ queryKey: ['wallets'] })
      setCorrectTarget(null)
    },
    onError: (e: { response?: { data?: { detail?: string } } }) => setApiError(e.response?.data?.detail || 'Failed'),
  })

  const columns = [
    { key: 'id', header: '#', render: (r: ExpenseRead) => <span className="font-mono text-xs text-gray-400">#{r.id}</span>, sortValue: (r: ExpenseRead) => r.id },
    {
      key: 'house', header: 'House Account',
      render: (r: ExpenseRead) => {
        const u = userMap[r.house_id]
        return u ? <span className="text-sm font-medium">{u.name}</span> : <span className="text-gray-400 text-xs">#{r.house_id}</span>
      },
      sortValue: (r: ExpenseRead) => userMap[r.house_id]?.name ?? '',
    },
    { key: 'expense_type', header: 'Type', render: (r: ExpenseRead) => <Badge variant={TYPE_META[r.expense_type].badge}>{TYPE_META[r.expense_type].label}</Badge>, sortValue: (r: ExpenseRead) => r.expense_type },
    { key: 'currency', header: 'Currency', render: (r: ExpenseRead) => <span className="font-mono font-semibold text-sm">{r.currency_id}</span>, sortValue: (r: ExpenseRead) => r.currency_id },
    { key: 'amount', header: 'Amount', render: (r: ExpenseRead) => <span className="text-sm text-red-600">-{money(r.amount, r.currency_id)}</span>, sortValue: (r: ExpenseRead) => parseFloat(r.amount) },
    {
      key: 'recipient', header: 'Profit To',
      render: (r: ExpenseRead) => r.recipient_user_id
        ? <span className="text-sm">{userName(r.recipient_user_id)}</span>
        : <span className="text-gray-300 text-xs">—</span>,
      sortValue: (r: ExpenseRead) => r.recipient_user_id ? userMap[r.recipient_user_id]?.name ?? '' : '',
    },
    { key: 'status', header: 'Status', render: (r: ExpenseRead) => <VoidBadge voidedAt={r.voided_at} />, sortValue: (r: ExpenseRead) => r.voided_at ?? '' },
    { key: 'created_at', header: 'Date', render: (r: ExpenseRead) => <span className="text-xs text-gray-400">{fmtDate(r.created_at)}</span>, sortValue: (r: ExpenseRead) => r.created_at },
    {
      key: 'actions', header: '', render: (r: ExpenseRead) => (
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

  // ── Filters ────────────────────────────────────────────────────────────────
  const filterDefs: FilterDef[] = useMemo(() => [
    { key: 'search', label: 'House Account', type: 'text', placeholder: 'Search house account name...' },
    { key: 'recipient', label: 'Profit To', type: 'text', placeholder: 'Search recipient name...' },
    { key: 'currency', label: 'Currency', type: 'text', placeholder: 'e.g. USD or EUR' },
    {
      key: 'expense_type', label: 'Type', type: 'toggle',
      options: [{ value: 'EXPENSE', label: 'Expense' }, { value: 'WITHDRAWAL', label: 'Withdrawal' }],
    },
    {
      key: 'status', label: 'Status', type: 'toggle',
      options: [{ value: 'active', label: 'Active' }, { value: 'voided', label: 'Voided' }],
    },
  ], [])

  const [filterVals, setFilterVals] = useState<FilterValues>(() => initFilters(filterDefs))

  const filtered = useMemo(() => {
    return expenses.filter((e: ExpenseRead) => {
      const u = userMap[e.house_id]
      const houseName = u ? `${u.name} ${u.surname ?? ''} ${u.username}`.toLowerCase() : ''
      const search = (filterVals.search as string).toLowerCase()
      if (search && !houseName.includes(search)) return false

      const recipient = (filterVals.recipient as string).toLowerCase()
      if (recipient) {
        const ru = e.recipient_user_id ? userMap[e.recipient_user_id] : null
        const recipientName = ru ? `${ru.name} ${ru.surname ?? ''} ${ru.username}`.toLowerCase() : ''
        if (!recipientName.includes(recipient)) return false
      }

      const curr = (filterVals.currency as string).toLowerCase()
      if (curr) {
        const text = `${e.currency_id} ${currencySearchText(e.currency_id, currMap)}`.toLowerCase()
        if (!text.includes(curr)) return false
      }

      const ty = filterVals.expense_type as string
      if (ty && e.expense_type !== ty) return false

      const st = filterVals.status as string
      if (st === 'active' && e.voided_at) return false
      if (st === 'voided' && !e.voided_at) return false

      return true
    })
  }, [expenses, filterVals, userMap, currMap])

  return (
    <div>
      <PageHeader title="Expenses & Withdrawals" subtitle="House-only outflows: operating costs and profit withdrawals" action={<Button icon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>New Entry</Button>} />

      {apiError && <div className="mb-4"><Alert type="error" message={apiError} onClose={() => setApiError('')} /></div>}

      <FilterBar filters={filterDefs} values={filterVals} onChange={setFilterVals} resultCount={filtered.length} />

      <Card>
        <Table
          columns={columns}
          data={filtered}
          keyFn={r => r.id}
          loading={isLoading}
          emptyMessage="No expenses match your filters"
          defaultSortKey="created_at"
          defaultSortDir="desc"
          pagination
          onRowClick={row => setExpanded(expanded === row.id ? null : row.id)}
          expandedRowKey={expanded}
          renderExpandedRow={expandedItem => (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><p className="text-xs text-gray-400">Description</p><p className="text-gray-700">{expandedItem.description || '—'}</p></div>
              {expandedItem.expense_type === 'WITHDRAWAL' && (
                <div><p className="text-xs text-gray-400">Profit to</p><p className="text-gray-700">{expandedItem.recipient_user_id ? userName(expandedItem.recipient_user_id) : '—'}</p></div>
              )}
              <div><p className="text-xs text-gray-400">Created by</p><p className="text-gray-700">{userName(expandedItem.created_by_user_id)}</p></div>
              {expandedItem.voided_at && <>
                <div><p className="text-xs text-gray-400">Voided at</p><p className="text-red-600">{fmtDate(expandedItem.voided_at)}</p></div>
                <div><p className="text-xs text-gray-400">Voided by</p><p className="text-red-600">{userName(expandedItem.voided_by_user_id)}</p></div>
                <div><p className="text-xs text-gray-400">Void reason</p><p className="text-red-600">{expandedItem.void_reason}</p></div>
              </>}
            </div>
          )}
        />
      </Card>

      <ExpenseFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={data => createMut.mutate(data as unknown as Parameters<typeof createExpense>[0])}
        loading={createMut.isPending}
        title="New Expense / Withdrawal"
        houseUsers={houseUsers}
        recipientUsers={recipientUsers}
        currencies={currencies}
        wallets={wallets}
      />

      {correctTarget && (
        <ExpenseFormModal
          open
          onClose={() => setCorrectTarget(null)}
          onSubmit={data => correctMut.mutate({ id: correctTarget.id, data })}
          loading={correctMut.isPending}
          title={`Correct #${correctTarget.id}`}
          houseUsers={houseUsers}
          recipientUsers={recipientUsers}
          currencies={currencies}
          wallets={wallets}
          defaultValues={correctTarget}
          isCorrection
        />
      )}

      <VoidModal
        open={!!voidTarget}
        title={`Void #${voidTarget?.id}`}
        onClose={() => setVoidTarget(null)}
        onSubmit={reason => voidTarget && voidMut.mutate({ id: voidTarget.id, reason })}
        loading={voidMut.isPending}
      />

    </div>
  )
}

function ExpenseFormModal({ open, onClose, onSubmit, loading, title, houseUsers, recipientUsers, currencies, wallets, defaultValues, isCorrection }: {
  open: boolean; onClose: () => void; title: string; loading: boolean; houseUsers: UserRead[]; recipientUsers: UserRead[]; currencies: CurrencyRead[]
  wallets: WalletRead[]
  onSubmit: (d: Record<string, unknown>) => void; defaultValues?: ExpenseRead; isCorrection?: boolean
}) {
  const [houseId, setHouseId] = useState<number | null>(defaultValues?.house_id ?? null)
  const [expenseType, setExpenseType] = useState<ExpenseType>(defaultValues?.expense_type ?? 'EXPENSE')
  const [currency, setCurrency] = useState(defaultValues?.currency_id ?? '')
  const [amount, setAmount] = useState(defaultValues?.amount ?? '')
  const [recipientId, setRecipientId] = useState<number | null>(defaultValues?.recipient_user_id ?? null)
  const [description, setDescription] = useState(defaultValues?.description ?? '')
  const [createdAt, setCreatedAt] = useState(() => nowIstanbulISO())
  const [corrReason, setCorrReason] = useState('')
  const [err, setErr] = useState('')

  // Resolve wallets for the selected house account
  const houseWallets = wallets.filter(w => w.user_id === houseId)
  const wallet = houseWallets.find(w => w.currency_id === currency) ?? null
  const currencyMap: Record<string, CurrencyRead> = {}
  currencies.forEach(c => { currencyMap[c.ticker] = c })
  const formMoney = (value: string | number, currencyId: string) =>
    formatCurrencyNumber(value, currencyMap[currencyId]?.decimals)
  const balanceAfter = wallet && amount !== '' && !isNaN(Number(amount))
    ? Number(wallet.balance) - Number(amount)
    : null

  // Only show currencies the house account actually holds a wallet for
  const houseWalletCurrencies = new Set(houseWallets.map(w => w.currency_id))
  const currOpts = (houseId ? currencies.filter(c => houseWalletCurrencies.has(c.ticker)) : currencies)
    .map(currencyOption)

  const houseOpts = houseUsers.map(u => ({ value: u.id, label: `${u.name}${u.surname ? ' ' + u.surname : ''}`, sublabel: `@${u.username}` }))
  const recipientOpts = [
    { value: '', label: '— None —' },
    ...recipientUsers.map(u => ({ value: u.id, label: `${u.name}${u.surname ? ' ' + u.surname : ''}`, sublabel: `@${u.username} · ${u.role}` })),
  ]

  const submit = () => {
    if (!houseId) { setErr('House account is required'); return }
    if (!currency) { setErr('Currency is required'); return }
    if (!amount || Number(amount) <= 0) { setErr('A positive amount is required'); return }
    if (isCorrection && !corrReason) { setErr('Correction reason is required'); return }
    onSubmit({
      house_id: houseId, expense_type: expenseType, currency_id: currency,
      amount, description: description || null,
      recipient_user_id: expenseType === 'WITHDRAWAL' ? recipientId : null,
      created_at: istanbulLocalToUTC(createdAt),
      ...(isCorrection ? { correction_reason: corrReason } : {}),
    })
  }

  const close = () => { setErr(''); onClose() }

  return (
    <Modal open={open} onClose={close} title={title} size="lg">
      <div className="space-y-4">
        {err && <Alert type="error" message={err} />}
        <SearchableSelect
          label="House Account *"
          options={houseOpts}
          value={houseId}
          onChange={v => { setHouseId(Number(v)); setCurrency('') }}
          placeholder="Select house account..."
        />

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Type *</label>
          <div className="flex gap-2">
            {(['EXPENSE', 'WITHDRAWAL'] as const).map(t => (
              <button key={t} type="button" onClick={() => { setExpenseType(t); if (t === 'EXPENSE') setRecipientId(null) }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${expenseType === t ? (t === 'EXPENSE' ? 'bg-red-500 text-white' : 'bg-purple-500 text-white') : 'bg-gray-100 text-gray-600'}`}>
                {TYPE_META[t].label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400">
            {expenseType === 'EXPENSE' ? 'Operating cost (rent, bills, etc.) leaving the system.' : 'Profit removed from the accounting.'}
          </p>
        </div>

        {expenseType === 'WITHDRAWAL' && (
          <SearchableSelect
            label="Profit taken by"
            options={recipientOpts}
            value={recipientId}
            onChange={v => setRecipientId(v === null || v === '' ? null : Number(v))}
            placeholder="Select house / developer user (optional)..."
          />
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SearchableSelect
            label="Currency *"
            options={currOpts}
            value={currency}
            onChange={v => setCurrency(String(v))}
            placeholder={houseId && currOpts.length === 0 ? 'No wallets found' : 'Select...'}
            disabled={!houseId}
          />
          <Input label="Amount *" type="number" step="any" value={amount} onChange={e => setAmount(e.target.value)} />
        </div>

        {/* Balance preview */}
        {houseId && currency && (
          <div className="bg-gray-50 rounded-lg px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="text-xs">
              <span className="text-gray-500 font-medium">Current balance: </span>
              {wallet
                ? <span className="text-green-700 font-semibold">{formMoney(wallet.balance, currency)} {currency}</span>
                : <span className="text-red-500">No {currency} wallet</span>}
            </div>
            <div className="text-xs">
              <span className="text-gray-500 font-medium">Balance after: </span>
              {balanceAfter !== null
                ? <span className={balanceAfter < 0 ? 'text-red-600 font-semibold' : 'text-gray-700 font-semibold'}>{formMoney(balanceAfter, currency)} {currency}</span>
                : <span className="text-gray-400">— enter amount</span>}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Description</label>
            <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional note (e.g. office rent)..." className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] resize-none" />
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
          <Button size="sm" onClick={submit} loading={loading} className="justify-center">{isCorrection ? 'Apply Correction' : 'Create Entry'}</Button>
        </div>
      </div>
    </Modal>
  )
}
