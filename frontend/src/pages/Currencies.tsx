import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { listCurrencies, createCurrency, updateCurrency, deleteCurrency } from '../api'
import {
  PageHeader, Button, Table, Modal, Input, Badge,
  Alert, ConfirmDialog, Card, FilterBar, initFilters,
} from '../components/ui'
import type { FilterDef, FilterValues } from '../components/ui'
import type { CurrencyRead, CurrencyCreate } from '../types'
import { fmtDate } from '../utils/date'

export default function Currencies() {
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<CurrencyRead | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CurrencyRead | null>(null)
  const [apiError, setApiError] = useState('')

  const { data: currencies = [], isLoading } = useQuery({
    queryKey: ['currencies'],
    queryFn: () => listCurrencies(),
  })

  const createMut = useMutation({
    mutationFn: createCurrency,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['currencies'] }); setCreateOpen(false) },
    onError: (e: { response?: { data?: { detail?: string } } }) => setApiError(e.response?.data?.detail || 'Failed to create currency'),
  })

  const updateMut = useMutation({
    mutationFn: ({ ticker, data }: { ticker: string; data: Partial<CurrencyCreate> }) => updateCurrency(ticker, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['currencies'] }); setEditTarget(null) },
    onError: (e: { response?: { data?: { detail?: string } } }) => setApiError(e.response?.data?.detail || 'Failed to update currency'),
  })

  const deleteMut = useMutation({
    mutationFn: (ticker: string) => deleteCurrency(ticker),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['currencies'] }); setDeleteTarget(null) },
    onError: (e: { response?: { data?: { detail?: string } } }) => setApiError(e.response?.data?.detail || 'Failed to delete currency'),
  })

  const filterDefs: FilterDef[] = useMemo(() => [
    { key: 'search', label: 'Currency', type: 'text', placeholder: 'Search by name or ticker...' },
    {
      key: 'status', label: 'Status', type: 'toggle',
      options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }],
    },
  ], [])

  const [filterVals, setFilterVals] = useState<FilterValues>(() => initFilters(filterDefs))

  const filtered = useMemo(() => {
    return currencies.filter((c: CurrencyRead) => {
      const search = (filterVals.search as string).toLowerCase()
      if (search && !`${c.ticker} ${c.name}`.toLowerCase().includes(search)) return false
      const st = filterVals.status as string
      if (st === 'active' && !c.is_active) return false
      if (st === 'inactive' && c.is_active) return false
      return true
    })
  }, [currencies, filterVals])

  const columns = [
    { key: 'ticker', header: 'Ticker', render: (r: CurrencyRead) => <span className="font-mono font-semibold text-[var(--color-primary)]">{r.ticker}</span> },
    { key: 'name', header: 'Name' },
    { key: 'symbol', header: 'Symbol', render: (r: CurrencyRead) => <span className="text-gray-500">{r.symbol ?? '—'}</span> },
    { key: 'decimals', header: 'Decimals' },
    { key: 'is_active', header: 'Status', render: (r: CurrencyRead) => <Badge variant={r.is_active ? 'green' : 'gray'}>{r.is_active ? 'Active' : 'Inactive'}</Badge> },
    { key: 'created_at', header: 'Created', render: (r: CurrencyRead) => <span className="text-gray-500 text-xs">{fmtDate(r.created_at)}</span> },
    {
      key: 'actions', header: '', render: (r: CurrencyRead) => (
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={e => { e.stopPropagation(); setEditTarget(r) }}>Edit</Button>
          <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={e => { e.stopPropagation(); setDeleteTarget(r) }} className="text-red-500 hover:bg-red-50">Delete</Button>
        </div>
      )
    },
  ]

  return (
    <div>
      <PageHeader
        title="Currencies"
        subtitle="Manage supported currencies and their settings"
        action={<Button icon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>New Currency</Button>}
      />

      {apiError && <div className="mb-4"><Alert type="error" message={apiError} onClose={() => setApiError('')} /></div>}

      <FilterBar filters={filterDefs} values={filterVals} onChange={setFilterVals} resultCount={filtered.length} />

      <Card>
        <Table columns={columns} data={filtered} keyFn={r => r.ticker} loading={isLoading} emptyMessage="No currencies match your filters" />
      </Card>

      {/* Create Modal */}
      <CreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={data => createMut.mutate(data)}
        loading={createMut.isPending}
        error={createMut.isError ? 'Failed to create' : ''}
      />

      {/* Edit Modal */}
      {editTarget && (
        <EditModal
          currency={editTarget}
          onClose={() => setEditTarget(null)}
          onSubmit={data => updateMut.mutate({ ticker: editTarget.ticker, data })}
          loading={updateMut.isPending}
        />
      )}

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget.ticker)}
        title="Delete Currency"
        message={`Are you sure you want to delete "${deleteTarget?.name}" (${deleteTarget?.ticker})? This cannot be undone.`}
        confirmLabel="Delete"
        loading={deleteMut.isPending}
      />
    </div>
  )
}

function CreateModal({ open, onClose, onSubmit, loading, error }: {
  open: boolean; onClose: () => void; onSubmit: (d: CurrencyCreate) => void; loading: boolean; error: string
}) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<CurrencyCreate>({ defaultValues: { decimals: 4, is_active: true } })
  const close = () => { reset(); onClose() }
  return (
    <Modal open={open} onClose={close} title="New Currency">
      <form onSubmit={handleSubmit(d => onSubmit(d))} className="space-y-4">
        {error && <Alert type="error" message={error} />}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Ticker *" placeholder="USD" {...register('ticker', { required: 'Required' })} error={errors.ticker?.message} className="uppercase" />
          <Input label="Name *" placeholder="US Dollar" {...register('name', { required: 'Required' })} error={errors.name?.message} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Symbol" placeholder="$" {...register('symbol')} />
          <Input label="Decimals" type="number" min={0} max={18} {...register('decimals', { valueAsNumber: true })} />
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="is_active_c" {...register('is_active')} className="rounded" defaultChecked />
          <label htmlFor="is_active_c" className="text-sm text-gray-700">Active</label>
        </div>
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end sm:gap-3">
          <Button variant="secondary" size="sm" type="button" onClick={close}>Cancel</Button>
          <Button size="sm" type="submit" loading={loading}>Create Currency</Button>
        </div>
      </form>
    </Modal>
  )
}

function EditModal({ currency, onClose, onSubmit, loading }: {
  currency: CurrencyRead; onClose: () => void; onSubmit: (d: Partial<CurrencyCreate>) => void; loading: boolean
}) {
  const { register, handleSubmit } = useForm({ defaultValues: { name: currency.name, symbol: currency.symbol, decimals: currency.decimals, is_active: currency.is_active } })
  return (
    <Modal open title={`Edit ${currency.ticker}`} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Name" {...register('name')} />
          <Input label="Symbol" {...register('symbol')} />
        </div>
        <Input label="Decimals" type="number" min={0} max={18} {...register('decimals', { valueAsNumber: true })} />
        <div className="flex items-center gap-2">
          <input type="checkbox" id="is_active_e" {...register('is_active')} className="rounded" />
          <label htmlFor="is_active_e" className="text-sm text-gray-700">Active</label>
        </div>
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end sm:gap-3">
          <Button variant="secondary" size="sm" type="button" onClick={onClose}>Cancel</Button>
          <Button size="sm" type="submit" loading={loading}>Save Changes</Button>
        </div>
      </form>
    </Modal>
  )
}
