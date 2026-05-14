export const TZ = 'Europe/Istanbul'

/** "05-01-2024 14:30" — dd-mm-yyyy hh:mm in Istanbul time (for reports) */
export function fmtReportDateTime(iso: string): string {
  const d = new Date(iso)
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '00'
  return `${get('day')}-${get('month')}-${get('year')} ${get('hour')}:${get('minute')}`
}

/** "Jan 5, 2024, 02:30 PM" — full datetime in Istanbul time */
export function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: TZ,
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

/** "Jan 5, 02:30 PM" — short datetime in Istanbul time */
export function fmtDateTimeShort(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: TZ,
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

/** "Jan 5, 2024" — date only in Istanbul time */
export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: TZ,
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

/** "Jan 5" — short date label for charts */
export function fmtDateLabel(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: TZ,
    month: 'short', day: 'numeric',
  })
}

/** Return a datetime-local string (YYYY-MM-DDTHH:mm) in Istanbul time for use as input default */
export function nowIstanbulISO(): string {
  const now = new Date()
  // Format the current time in Istanbul TZ as a datetime-local value
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now)

  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

/** Convert a datetime-local string (assumed to be in Istanbul time) to UTC ISO string for the API */
export function istanbulLocalToUTC(localISO: string): string {
  // localISO is "YYYY-MM-DDTHH:mm" — treat it as Istanbul wall-clock time
  // We use Intl to find the UTC offset for that instant in Istanbul
  const naive = new Date(localISO) // parsed as local browser time
  // Get Istanbul offset at that moment (in minutes)
  const sample = new Date(localISO + ':00')
  const utcStr = sample.toLocaleString('en-US', { timeZone: 'UTC', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  const istStr = sample.toLocaleString('en-US', { timeZone: TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

  const toMs = (s: string) => {
    // "MM/DD/YYYY, HH:MM"
    const [datePart, timePart] = s.split(', ')
    const [m, d, y] = datePart.split('/')
    const [h, min] = timePart.split(':')
    return Date.UTC(Number(y), Number(m) - 1, Number(d), Number(h), Number(min))
  }

  const offsetMs = toMs(istStr) - toMs(utcStr) // Istanbul is ahead of UTC
  return new Date(naive.getTime() - offsetMs).toISOString()
}
