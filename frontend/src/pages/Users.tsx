import { useEffect, useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, User, Building2, ChevronRight, Code2 } from 'lucide-react'
import { listUsers, createUser, updateUser, deleteUser } from '../api'
import { PageHeader, Button, Table, Modal, Input, Select, Badge, Alert, ConfirmDialog, Card, FilterBar, initFilters } from '../components/ui'
import type { FilterDef, FilterValues } from '../components/ui'
import type { UserRead, UserCreate, UserRole } from '../types'
import { fmtDate } from '../utils/date'
import { useAuth } from '../contexts/AuthContext'

const baseRoleOptions = [
  { value: 'CLIENT', label: 'Client' },
  { value: 'HOUSE', label: 'House' },
]
const developerRoleOption = { value: 'DEVELOPER', label: 'Developer' }

function roleLabel(role: UserRole) {
  if (role === 'HOUSE') return 'House'
  if (role === 'DEVELOPER') return 'Developer'
  return 'Client'
}

function roleBadge(role: UserRole) {
  if (role === 'HOUSE') return 'purple'
  if (role === 'DEVELOPER') return 'yellow'
  return 'blue'
}

function RoleIcon({ role }: { role: UserRole }) {
  if (role === 'HOUSE') return <Building2 size={13} className="text-purple-500" />
  if (role === 'DEVELOPER') return <Code2 size={13} className="text-yellow-600" />
  return <User size={13} className="text-blue-500" />
}

function avatarClass(role: UserRole) {
  if (role === 'HOUSE') return 'bg-purple-500'
  if (role === 'DEVELOPER') return 'bg-yellow-500'
  return 'bg-[var(--color-primary)]'
}

export default function Users() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user: currentUser } = useAuth()
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<UserRead | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<UserRead | null>(null)
  const [apiError, setApiError] = useState('')

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => listUsers(),
  })

  const filterDefs: FilterDef[] = useMemo(() => [
    { key: 'search', label: 'Name', type: 'text', placeholder: 'Search by name or username...' },
    {
      key: 'role', label: 'Role', type: 'toggle',
      options: [...baseRoleOptions, developerRoleOption],
    },
  ], [])

  const [filterVals, setFilterVals] = useState<FilterValues>(() => initFilters(filterDefs))

  const filtered = useMemo(() => {
    return users.filter((u: UserRead) => {
      const search = (filterVals.search as string).toLowerCase()
      if (search) {
        const full = `${u.name} ${u.surname ?? ''} ${u.username}`.toLowerCase()
        if (!full.includes(search)) return false
      }
      const role = filterVals.role as string
      if (role && u.role !== role) return false
      return true
    })
  }, [users, filterVals])

  const createMut = useMutation({
    mutationFn: createUser,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setCreateOpen(false) },
    onError: (e: { response?: { data?: { detail?: string } } }) => setApiError(e.response?.data?.detail || 'Failed to create user'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<UserCreate> }) => updateUser(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setEditTarget(null) },
    onError: (e: { response?: { data?: { detail?: string } } }) => setApiError(e.response?.data?.detail || 'Failed to update user'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteUser(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setDeleteTarget(null) },
    onError: (e: { response?: { data?: { detail?: string } } }) => setApiError(e.response?.data?.detail || 'Failed to delete user'),
  })

  const columns = [
    {
      key: 'name', header: 'Name',
      render: (r: UserRead) => (
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold ${avatarClass(r.role)}`}>
            {r.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">{r.name}{r.surname ? ` ${r.surname}` : ''}</p>
            <p className="text-xs text-gray-400">@{r.username}</p>
          </div>
        </div>
      ),
      sortValue: (r: UserRead) => r.name,
    },
    {
      key: 'role', header: 'Role',
      render: (r: UserRead) => (
        <div className="flex items-center gap-1.5">
          <RoleIcon role={r.role} />
          <Badge variant={roleBadge(r.role)}>{roleLabel(r.role)}</Badge>
        </div>
      ),
      sortValue: (r: UserRead) => r.role,
    },
    { key: 'id', header: 'ID', render: (r: UserRead) => <span className="text-gray-400 text-xs font-mono">#{r.id}</span>, sortValue: (r: UserRead) => r.id },
    { key: 'created_at', header: 'Created', render: (r: UserRead) => <span className="text-gray-500 text-xs">{fmtDate(r.created_at)}</span>, sortValue: (r: UserRead) => r.created_at },
    {
      key: 'actions', header: '',
      render: (r: UserRead) => (
        <div className="flex gap-1 justify-end">
          <Button size="sm" variant="ghost" icon={<ChevronRight size={14} />} onClick={e => { e.stopPropagation(); navigate(`/users/${r.id}`) }} className="text-[var(--color-primary)]">View</Button>
          <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={e => { e.stopPropagation(); setEditTarget(r) }}>Edit</Button>
          <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={e => { e.stopPropagation(); setDeleteTarget(r) }} className="text-red-500 hover:bg-red-50">Delete</Button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Manage clients and house users"
        action={<Button icon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>New User</Button>}
      />

      {apiError && <div className="mb-4"><Alert type="error" message={apiError} onClose={() => setApiError('')} /></div>}

      <FilterBar filters={filterDefs} values={filterVals} onChange={setFilterVals} resultCount={filtered.length} />

      <Card>
        <Table
          columns={columns}
          data={filtered}
          keyFn={r => r.id}
          loading={isLoading}
          emptyMessage="No users match your filters"
          onRowClick={r => navigate(`/users/${r.id}`)}
          defaultSortKey="name"
          defaultSortDir="asc"
        />
      </Card>

      <UserModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={data => createMut.mutate(data as UserCreate)}
        loading={createMut.isPending}
        title="New User"
        canSelectDeveloper={currentUser?.role === 'DEVELOPER'}
      />

      {editTarget && (
        <UserModal
          open
          user={editTarget}
          onClose={() => setEditTarget(null)}
          onSubmit={data => updateMut.mutate({ id: editTarget.id, data })}
          loading={updateMut.isPending}
          title={`Edit ${editTarget.name}`}
          canSelectDeveloper={currentUser?.role === 'DEVELOPER' || editTarget.role === 'DEVELOPER'}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
        title="Delete User"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        loading={deleteMut.isPending}
      />
    </div>
  )
}

function UserModal({ open, user, onClose, onSubmit, loading, title, canSelectDeveloper }: {
  open: boolean; user?: UserRead; onClose: () => void; onSubmit: (d: Partial<UserCreate>) => void; loading: boolean; title: string; canSelectDeveloper: boolean
}) {
  const roleOptions = canSelectDeveloper ? [...baseRoleOptions, developerRoleOption] : baseRoleOptions
  const { register, handleSubmit, reset, watch, setValue } = useForm({
    defaultValues: { role: user?.role ?? 'CLIENT', username: user?.username ?? '', name: user?.name ?? '', surname: user?.surname ?? '', password: '' }
  })
  const selectedRole = watch('role')
  const showPassword = selectedRole === 'HOUSE' || selectedRole === 'DEVELOPER'

  useEffect(() => {
    if (!showPassword) setValue('password', '')
  }, [showPassword, setValue])

  const close = () => { reset(); onClose() }
  const submit = (d: { role: string; username: string; name: string; surname: string; password: string }) => {
    const isStaffRole = d.role === 'HOUSE' || d.role === 'DEVELOPER'
    onSubmit({
      role: d.role as UserCreate['role'],
      username: d.username,
      name: d.name,
      surname: d.surname.trim() || null,
      password: isStaffRole ? d.password.trim() || null : null,
    })
  }
  return (
    <Modal open={open} onClose={close} title={title}>
      <form onSubmit={handleSubmit(submit)} className="space-y-4">
        <Select label="Role *" options={roleOptions} {...register('role')} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="First Name *" placeholder="John" {...register('name')} />
          <Input label="Last Name" placeholder="Doe" {...register('surname')} />
        </div>
        <Input label="Username *" placeholder="johndoe" {...register('username')} />
        {showPassword && (
          <Input label={user ? 'New Password (leave blank to keep)' : 'Password'} type="password" placeholder="••••••••" {...register('password')} />
        )}
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end sm:gap-3">
          <Button variant="secondary" size="sm" type="button" onClick={close}>Cancel</Button>
          <Button size="sm" type="submit" loading={loading}>{user ? 'Save Changes' : 'Create User'}</Button>
        </div>
      </form>
    </Modal>
  )
}
