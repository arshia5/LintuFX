export function stripNumberFormatting(value: string | number | null | undefined): string {
  return String(value ?? '').replace(/,/g, '')
}

export function formatNumericInput(value: string | number | null | undefined): string {
  const raw = stripNumberFormatting(value)
  if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return raw

  const negative = raw.startsWith('-')
  const unsigned = negative ? raw.slice(1) : raw
  const [integerPart, ...decimalParts] = unsigned.split('.')
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const decimalPart = decimalParts.length > 0 ? `.${decimalParts.join('')}` : ''

  return `${negative ? '-' : ''}${formattedInteger}${decimalPart}`
}

export function formatNumber(value: string | number, maximumFractionDigits = 4, minimumFractionDigits = 0): string {
  const parsed = Number(stripNumberFormatting(value))
  if (!Number.isFinite(parsed)) return String(value)

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(parsed)
}
