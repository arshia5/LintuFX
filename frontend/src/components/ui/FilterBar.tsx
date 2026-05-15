import { ReactNode, useState } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'

export interface FilterDef {
  key: string
  label: string
  type: 'text' | 'select' | 'multiselect' | 'toggle'
  options?: { value: string; label: string }[]  // for select / multiselect
  placeholder?: string
}

export type FilterValues = Record<string, string | string[]>

interface FilterBarProps {
  filters: FilterDef[]
  values: FilterValues
  onChange: (values: FilterValues) => void
  resultCount?: number
}

export function FilterBar({ filters, values, onChange, resultCount }: FilterBarProps) {
  const [expanded, setExpanded] = useState(false)

  const activeCount = Object.entries(values).filter(([, v]) =>
    Array.isArray(v) ? v.length > 0 : v !== ''
  ).length

  const clearAll = () => {
    const empty: FilterValues = {}
    filters.forEach(f => { empty[f.key] = f.type === 'multiselect' ? [] : '' })
    onChange(empty)
  }

  const set = (key: string, val: string | string[]) => onChange({ ...values, [key]: val })

  const toggleMulti = (key: string, val: string) => {
    const cur = (values[key] as string[]) || []
    set(key, cur.includes(val) ? cur.filter(v => v !== val) : [...cur, val])
  }

  // Text + quick select filters (always visible)
  const textFilters = filters.filter(f => f.type === 'text')
  const otherFilters = filters.filter(f => f.type !== 'text')

  return (
    <div className="mb-5 space-y-3">
      {/* Top row: search boxes + expand button */}
      <div className="flex flex-wrap gap-2 items-center">
        {textFilters.map(f => (
          <div key={f.key} className="relative w-full sm:w-auto sm:flex-1 sm:min-w-[180px] sm:max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={(values[f.key] as string) || ''}
              onChange={e => set(f.key, e.target.value)}
              placeholder={f.placeholder ?? `Search ${f.label.toLowerCase()}...`}
              className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent"
            />
            {values[f.key] && (
              <button onClick={() => set(f.key, '')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={13} />
              </button>
            )}
          </div>
        ))}

        {otherFilters.length > 0 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className={`flex min-h-10 flex-1 items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition sm:flex-none ${expanded || activeCount > 0 ? 'border-[var(--color-primary)] text-[var(--color-primary)] bg-blue-50' : 'border-gray-200 text-gray-600 bg-white hover:bg-gray-50'}`}
          >
            <SlidersHorizontal size={14} />
            Filters
            {activeCount > 0 && (
              <span className="ml-1 bg-[var(--color-primary)] text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none">
                {activeCount}
              </span>
            )}
          </button>
        )}

        {activeCount > 0 && (
          <button onClick={clearAll} className="flex min-h-10 flex-1 items-center justify-center gap-1 text-sm text-gray-400 transition hover:text-gray-600 sm:flex-none">
            <X size={13} /> Clear all
          </button>
        )}

        {resultCount !== undefined && (
          <span className="w-full text-xs text-gray-400 sm:ml-auto sm:w-auto">{resultCount} result{resultCount !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Expanded filter panel */}
      {expanded && otherFilters.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {otherFilters.map(f => {
            if (f.type === 'select') return (
              <div key={f.key} className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{f.label}</label>
                <div className="relative">
                  <select
                    value={(values[f.key] as string) || ''}
                    onChange={e => set(f.key, e.target.value)}
                    className="w-full appearance-none px-3 py-2 pr-7 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  >
                    <option value="">All</option>
                    {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
            )

            if (f.type === 'multiselect') {
              const selected = (values[f.key] as string[]) || []
              return (
                <div key={f.key} className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{f.label}</label>
                  <div className="flex flex-wrap gap-1.5">
                    {f.options?.map(o => (
                      <button
                        key={o.value}
                        onClick={() => toggleMulti(f.key, o.value)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${selected.includes(o.value) ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              )
            }

            if (f.type === 'toggle') {
              const val = (values[f.key] as string) || ''
              return (
                <div key={f.key} className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{f.label}</label>
                  <div className="flex flex-wrap gap-1">
                    {[{ value: '', label: 'All' }, ...(f.options ?? [])].map(o => (
                      <button
                        key={o.value}
                        onClick={() => set(f.key, o.value)}
                        className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition ${val === o.value ? 'bg-[var(--color-primary)] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              )
            }

            return null
          })}
        </div>
      )}
    </div>
  )
}

// ── Helper: init empty filter values from defs ────────────────────────────────
export function initFilters(defs: FilterDef[]): FilterValues {
  const v: FilterValues = {}
  defs.forEach(f => { v[f.key] = f.type === 'multiselect' ? [] : '' })
  return v
}
