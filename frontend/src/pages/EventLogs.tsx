import { useState, useMemo } from 'react'
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

export default function EventLogs() {
  const [expanded, setExpanded] = useState<number | null>(null)

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['event-logs'],
    queryFn: () => listEventLogs({ limit: 500 }),
  })
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: () => listUsers() })

  const userMap: Record<number, UserRead> = {}
  users.forEach((u: UserRead) => { userMap[u.id] = u })

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
          <span className="text-xs text-gray-500 font-mono truncate max-w-[200px] block">
            {keys.slice(0, 3).map(k => `${k}: ${String(r.details[k]).slice(0, 12)}`).join(' · ')}
            {keys.length > 3 ? ` +${keys.length - 3} more` : ''}
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

  const expandedLog = logs.find((l: EventLogRead) => l.id === expanded)

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
        />

        {/* Expanded details panel */}
        {expandedLog && (
          <div className="border-t border-gray-100 bg-gray-50 px-6 py-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Badge variant={eventTypeVariant(expandedLog.event_type)}>{humanEventType(expandedLog.event_type)}</Badge>
                <Badge variant={entityTypeVariant(expandedLog.entity_type)}>{humanEntityType(expandedLog.entity_type)}</Badge>
                {expandedLog.entity_id != null && (
                  <span className="text-xs text-gray-500 font-mono">entity #{expandedLog.entity_id}</span>
                )}
              </div>
              <span className="text-xs text-gray-400">{fmtDate(expandedLog.created_at)}</span>
            </div>

            {Object.keys(expandedLog.details).length === 0 ? (
              <p className="text-xs text-gray-400 italic">No additional details recorded.</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {Object.entries(expandedLog.details).map(([key, value]) => (
                  <div key={key} className="bg-white rounded-lg border border-gray-100 px-3 py-2">
                    <p className="text-xs text-gray-400 mb-0.5 font-medium">
                      {key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </p>
                    <p className="text-sm text-gray-800 font-mono break-all">
                      {value === null ? <span className="text-gray-300 italic">null</span>
                        : typeof value === 'object' ? JSON.stringify(value)
                        : String(value)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
