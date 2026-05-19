import type { CurrencyRead } from '../types'

export function currencySearchText(currencyId: string, currencies: Record<string, CurrencyRead>) {
  const currency = currencies[currencyId]
  return [
    currencyId,
    currency?.ticker,
    currency?.name,
    currency?.symbol,
  ].filter(Boolean).join(' ').toLowerCase()
}

export function currencyOption(currency: CurrencyRead) {
  return {
    value: currency.ticker,
    label: currency.name || currency.ticker,
    sublabel: currency.name && currency.name !== currency.ticker ? currency.ticker : undefined,
  }
}
