import { useState, useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { listEventLogs, listUsers } from '../api'
import { PageHeader, Card, Table, Badge, FilterBar, initFilters } from '../components/ui'
import type { FilterDef, FilterValues } from '../components/ui'
import type { EventLogRead, UserRead } from '../types'
import { fmtDateTime } from '../utils/date'

const fmtDate = fmtDateTime

// Colour-code known event types
const eventTypeVariant = (t: string): 'green' | 'red' | 'blue' | 'yellow' | 'purple' | 'gray' => {
  const s = t.toLowerCase()
  if (s.includes('create')) return 'green'
  if (s.includes('delete')) return 'red'
  if (s.includes('void')) return 'yellow'
  if (s.includes('correct')) return 'purple'
  if (s.includes('update')) return 'blue'
  return 'gray'
}

const entityTypeVariant = (t: string): 'blue' | 'purple' | 'green' | 'yellow' | 'gray' => {
  const s = t.toLowerCase()
  if (s.includes('order')) return 'blue'
  if (s.includes('journal') || s.includes('entry')) return 'purple'
  if (s.includes('wallet')) return 'green'
  if (s.includes('exchange')) return 'yellow'
  return 'gray'
}

function humanEventType(t: string) {
  return t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
function humanEntityType(t: string) {
  return t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function humanFieldName(key: string) {
  const labels: Record<string, string> = {
    amount_in: 'Amount in',
    amount_out: 'Amount out',
    amount_from: 'Amount from',
    amount_to: 'Amount to',
    balance_before: 'Balance before',
    balance_after: 'Balance after',
    amount_delta: 'Amount change',
    client_id: 'Client',
    house_id: 'House account',
    user_id: 'User',
    created_by_user_id: 'Created by',
    updated_by_user_id: 'Updated by',
    voided_by_user_id: 'Voided by',
    currency_id: 'Currency',
    currency_in_id: 'Currency in',
    currency_out_id: 'Currency out',
    currency_from_id: 'Currency from',
    currency_to_id: 'Currency to',
    exchange_rate: 'Exchange rate',
    order_type: 'Order type',
    voided_at: 'Voided at',
    created_at: 'Created at',
    updated_at: 'Updated at',
    void_reason: 'Void reason',
  }
  return labels[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function detailSectionTitle(key: string) {
  const labels: Record<string, string> = {
    payload: 'Submitted values',
    after: 'Saved record',
    before: 'Before',
    wallet: 'Wallet',
    adjustment: 'Adjustment',
    voided_before: 'Voided record before',
    voided_after: 'Voided record after',
    correction: 'Correction record',
  }
  return labels[key] ?? humanFieldName(key)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export default function EventLogs() {
  const [expanded, setExpanded] = useState<number | null>(null)

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['event-logs'],
    queryFn: () => listEventLogs({ limit: 500 }),
  })
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: () => listUsers() })

  const userMap: Record<number, UserRead> = {}
  users.forEach((u: UserRead) => { userMap[u.id] = u })
  const userName = (userId: number | null | undefined) => {
    if (userId == null) return 'System'
    const user = userMap[userId]
    if (!user) return `User #${userId}`
    return `${user.name}${user.surname ? ` ${user.surname}` : ''}`
  }

  const formatDetailValue = (key: string, value: unknown): ReactNode => {
    if (key === 'password_hash') return <span className="text-gray-400 italic">Hidden</span>
    if (value === null || value === undefined || value === '') return <span className="text-gray-300 italic">Empty</span>
    if (typeof value === 'boolean') return value ? 'Yes' : 'No'
    if (typeof value === 'number' && ['client_id', 'house_id', 'user_id', 'created_by_user_id', 'updated_by_user_id', 'voided_by_user_id'].includes(key)) {
      return `${userName(value)} (#${value})`
    }
    if (typeof value === 'number' && key.endsWith('_id')) return `#${value}`
    if (typeof value === 'string') {
      if (['created_at', 'updated_at', 'voided_at'].includes(key)) return fmtDate(value)
      return value
    }
    return JSON.stringify(value)
  }

  const previewDetail = (details: Record<string, unknown>) => {
    if (typeof details.reason === 'string' && details.reason) {
      return `Reason: ${details.reason}`
    }
    const source = isRecord(details.payload) ? details.payload : isRecord(details.after) ? details.after : details
    const entries = Object.entries(source).filter(([key]) => !['password_hash'].includes(key)).slice(0, 3)
    if (entries.length === 0) return 'No additional details'
    return entries.map(([key, value]) => {
      const rendered = formatDetailValue(key, value)
      const text = typeof rendered === 'string' || typeof rendered === 'number' ? String(rendered) : String(value ?? '')
      return `${humanFieldName(key)}: ${text.slice(0, 28)}`
    }).join(' · ')
  }

  const renderDetailFields = (record: Record<string, unknown>) => (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Object.entries(record)
        .filter(([key]) => key !== 'password_hash')
        .map(([key, value]) => (
          <div key={key} className="rounded-lg border border-gray-100 bg-white px-3 py-2">
            <p className="mb-0.5 text-xs font-medium text-gray-400">{humanFieldName(key)}</p>
            <p className="break-words text-sm text-gray-800">{formatDetailValue(key, value)}</p>
          </div>
        ))}
    </div>
  )

  const renderHumanDetails = (details: Record<string, unknown>) => {
    const entries = Object.entries(details)
    if (entries.length === 0) {
      return <p className="text-xs text-gray-400 italic">No additional details recorded.</p>
    }
    return (
      <div className="space-y-4">
        {entries.map(([key, value]) => (
          <div key={key}>
            {isRecord(value) ? (
              <>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{detailSectionTitle(key)}</p>
                {renderDetailFields(value)}
              </>
            ) : (
              <div className="rounded-lg border border-gray-100 bg-white px-3 py-2">
                <p className="mb-0.5 text-xs font-medium text-gray-400">{humanFieldName(key)}</p>
                <p className="break-words text-sm text-gray-800">{formatDetailValue(key, value)}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    )
  }

  // Derive unique event_types and entity_types for filter dropdowns
  const eventTypes = useMemo(() => [...new Set(logs.map((l: EventLogRead) => l.event_type))].sort(), [logs])
  const entityTypes = useMemo(() => [...new Set(logs.map((l: EventLogRead) => l.entity_type))].sort(), [logs])

  const filterDefs: FilterDef[] = useMemo(() => [
    { key: 'search', label: 'Actor', type: 'text', placeholder: 'Search by actor name...' },
    {
      key: 'event_type', label: 'Event Type', type: 'select',
      options: (eventTypes as string[]).map(t => ({ value: t, label: humanEventType(t) })),
    },
    {
      key: 'entity_type', label: 'Entity Type', type: 'select',
      options: (entityTypes as string[]).map(t => ({ value: t, label: humanEntityType(t) })),
    },
  ], [eventTypes, entityTypes])

  const [filterVals, setFilterVals] = useState<FilterValues>(() => initFilters(filterDefs))

  const filtered = useMemo(() => {
    return logs.filter((l: EventLogRead) => {
      const actor = l.actor_user_id ? userMap[l.actor_user_id] : null
      const actorName = actor ? `${actor.name} ${actor.surname ?? ''} ${actor.username}`.toLowerCase() : ''
      const search = (filterVals.search as string).toLowerCase()
      if (search && !actorName.includes(search)) return false

      const et = filterVals.event_type as string
      if (et && l.event_type !== et) return false

      const ent = filterVals.entity_type as string
      if (ent && l.entity_type !== ent) return false

      return true
    })
  }, [logs, filterVals, userMap])

  const columns = [
    { key: 'id', header: '#', render: (r: EventLogRead) => <span className="font-mono text-xs text-gray-400">#{r.id}</span> },
    {
      key: 'event_type', header: 'Event', render: (r: EventLogRead) => (
        <Badge variant={eventTypeVariant(r.event_type)}>{humanEventType(r.event_type)}</Badge>
      )
    },
    {
      key: 'entity', header: 'Entity', render: (r: EventLogRead) => (
        <div className="flex items-center gap-2">
          <Badge variant={entityTypeVariant(r.entity_type)}>{humanEntityType(r.entity_type)}</Badge>
          {r.entity_id != null && (
            <span className="font-mono text-xs text-gray-400">#{r.entity_id}</span>
          )}
        </div>
      )
    },
    {
      key: 'actor', header: 'Actor', render: (r: EventLogRead) => {
        if (!r.actor_user_id) return <span className="text-xs text-gray-400">System</span>
        const u = userMap[r.actor_user_id]
        return u ? (
          <div>
            <p className="text-sm font-medium text-gray-900">{u.name}{u.surname ? ` ${u.surname}` : ''}</p>
            <p className="text-xs text-gray-400">@{u.username}</p>
          </div>
        ) : <span className="text-xs text-gray-400">User #{r.actor_user_id}</span>
      }
    },
    {
      key: 'details_preview', header: 'Details', render: (r: EventLogRead) => {
        const keys = Object.keys(r.details)
        if (keys.length === 0) return <span className="text-xs text-gray-400">—</span>
        return (
          <span className="block max-w-[260px] truncate text-xs text-gray-500">
            {previewDetail(r.details)}
          </span>
        )
      }
    },
    {
      key: 'created_at', header: 'Time', render: (r: EventLogRead) => (
        <span className="text-xs text-gray-400 whitespace-nowrap">{fmtDate(r.created_at)}</span>
      )
    },
    {
      key: 'expand', header: '', render: (r: EventLogRead) => (
        <button
          onClick={e => { e.stopPropagation(); setExpanded(expanded === r.id ? null : r.id) }}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition"
        >
          {expanded === r.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      )
    },
  ]

  return (
    <div>
      <PageHeader
        title="Event Logs"
        subtitle="Full audit trail of all system activity"
      />

      <FilterBar filters={filterDefs} values={filterVals} onChange={setFilterVals} resultCount={filtered.length} />

      <Card>
        <Table
          columns={columns}
          data={filtered}
          keyFn={r => r.id}
          loading={isLoading}
          emptyMessage="No event logs match your filters"
          pagination
          onRowClick={row => setExpanded(expanded === row.id ? null : row.id)}
          expandedRowKey={expanded}
          renderExpandedRow={log => (
            <div className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={eventTypeVariant(log.event_type)}>{humanEventType(log.event_type)}</Badge>
                  <Badge variant={entityTypeVariant(log.entity_type)}>{humanEntityType(log.entity_type)}</Badge>
                  {log.entity_id != null && (
                    <span className="text-xs text-gray-500 font-mono">entity #{log.entity_id}</span>
                  )}
                </div>
                <span className="text-xs text-gray-400">{fmtDate(log.created_at)}</span>
              </div>
              {renderHumanDetails(log.details)}
            </div>
          )}
        />
      </Card>
    </div>
  )
}
