import { apiClient } from './client'
import type {
  CurrencyCreate, CurrencyRead, CurrencyUpdate,
  EventLogRead,
  HouseExchangeCreate, HouseExchangeCorrectionCreate, HouseExchangeRead,
  JournalEntryCreate, JournalEntryCorrectionCreate, JournalEntryRead,
  OrderCreate, OrderCorrectionCreate, OrderRead,
  UserCreate, UserRead, UserUpdate,
  WalletAdjustmentRead, WalletCreate, WalletBalanceAdjustmentCreate, WalletRead,
  VoidRequest, UserRole, OrderType,
} from '../types'

type PageParams = { skip?: number; limit?: number }
type QueryParams = Record<string, string | number | boolean | undefined>

const PAGE_SIZE = 1000

function hasExplicitPage(params?: PageParams) {
  return params?.skip !== undefined || params?.limit !== undefined
}

async function listAll<T>(path: string, params?: QueryParams & PageParams): Promise<T[]> {
  if (hasExplicitPage(params)) {
    return apiClient.get(path, { params }).then(r => r.data)
  }

  const rows: T[] = []
  let skip = 0
  while (true) {
    const page: T[] = await apiClient
      .get(path, { params: { ...params, skip, limit: PAGE_SIZE } })
      .then(r => r.data)
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
    skip += PAGE_SIZE
  }
  return rows
}

// Auth
export const login = (username: string, password: string) =>
  apiClient.post('/auth/login', { username, password }).then(r => r.data)

// Currencies
export const listCurrencies = (params?: { is_active?: boolean } & PageParams) =>
  listAll<CurrencyRead>('/currencies', params)

export const createCurrency = (data: CurrencyCreate) =>
  apiClient.post('/currencies', data).then(r => r.data)

export const updateCurrency = (ticker: string, data: CurrencyUpdate) =>
  apiClient.patch(`/currencies/${ticker}`, data).then(r => r.data)

export const deleteCurrency = (ticker: string) =>
  apiClient.delete(`/currencies/${ticker}`)

// Users
export const listUsers = (params?: { role?: UserRole } & PageParams) =>
  listAll<UserRead>('/users', params)

export const getUser = (id: number) =>
  apiClient.get(`/users/${id}`).then(r => r.data)

export const createUser = (data: UserCreate) =>
  apiClient.post('/users', data).then(r => r.data)

export const updateUser = (id: number, data: UserUpdate) =>
  apiClient.patch(`/users/${id}`, data).then(r => r.data)

export const deleteUser = (id: number) =>
  apiClient.delete(`/users/${id}`)

// Wallets
export const listWallets = (params?: { user_id?: number; currency_id?: string; skip?: number; limit?: number }) =>
  listAll<WalletRead>('/wallets', params)

export const getWallet = (id: number) =>
  apiClient.get(`/wallets/${id}`).then(r => r.data)

export const createWallet = (data: WalletCreate) =>
  apiClient.post('/wallets', data).then(r => r.data)

export const deleteWallet = (id: number) =>
  apiClient.delete(`/wallets/${id}`)

export const adjustWalletBalance = (walletId: number, data: WalletBalanceAdjustmentCreate) =>
  apiClient.post(`/wallets/${walletId}/balance-adjustments`, data).then(r => r.data)

export const listWalletAdjustments = (params?: { wallet_id?: number; currency_id?: string } & PageParams) =>
  listAll<WalletAdjustmentRead>('/wallet-adjustments', params)

// Orders
export const listOrders = (params?: { client_id?: number; order_type?: OrderType; currency_in_id?: string; currency_out_id?: string } & PageParams) =>
  listAll<OrderRead>('/orders', params)

export const getOrder = (id: number) =>
  apiClient.get(`/orders/${id}`).then(r => r.data)

export const createOrder = (data: OrderCreate) =>
  apiClient.post('/orders', data).then(r => r.data)

export const voidOrder = (id: number, data: VoidRequest) =>
  apiClient.post(`/orders/${id}/void`, data).then(r => r.data)

export const correctOrder = (id: number, data: OrderCorrectionCreate) =>
  apiClient.post(`/orders/${id}/corrections`, data).then(r => r.data)

export const deleteOrder = (id: number) =>
  apiClient.delete(`/orders/${id}`)

// House Exchanges
export const listHouseExchanges = (params?: { house_id?: number; currency_from_id?: string; currency_to_id?: string } & PageParams) =>
  listAll<HouseExchangeRead>('/house-exchanges', params)

export const getHouseExchange = (id: number) =>
  apiClient.get(`/house-exchanges/${id}`).then(r => r.data)

export const createHouseExchange = (data: HouseExchangeCreate) =>
  apiClient.post('/house-exchanges', data).then(r => r.data)

export const voidHouseExchange = (id: number, data: VoidRequest) =>
  apiClient.post(`/house-exchanges/${id}/void`, data).then(r => r.data)

export const correctHouseExchange = (id: number, data: HouseExchangeCorrectionCreate) =>
  apiClient.post(`/house-exchanges/${id}/corrections`, data).then(r => r.data)

export const deleteHouseExchange = (id: number) =>
  apiClient.delete(`/house-exchanges/${id}`)

// Journal Entries
export const listJournalEntries = (params?: { from_wallet_id?: number; to_wallet_id?: number; currency_id?: string } & PageParams) =>
  listAll<JournalEntryRead>('/journal-entries', params)

export const getJournalEntry = (id: number) =>
  apiClient.get(`/journal-entries/${id}`).then(r => r.data)

export const createJournalEntry = (data: JournalEntryCreate) =>
  apiClient.post('/journal-entries', data).then(r => r.data)

export const voidJournalEntry = (id: number, data: VoidRequest) =>
  apiClient.post(`/journal-entries/${id}/void`, data).then(r => r.data)

export const correctJournalEntry = (id: number, data: JournalEntryCorrectionCreate) =>
  apiClient.post(`/journal-entries/${id}/corrections`, data).then(r => r.data)

export const deleteJournalEntry = (id: number) =>
  apiClient.delete(`/journal-entries/${id}`)

// Event Logs
export const listEventLogs = (params?: { event_type?: string; entity_type?: string; entity_id?: number; actor_user_id?: number; skip?: number; limit?: number }) =>
  listAll<EventLogRead>('/event-logs', params)

// Reports
export const getClientBalances = (params?: { direction?: string; client_id?: number; currency_id?: string; include_zero?: boolean }) =>
  apiClient.get('/reports/client-balances', { params }).then(r => r.data)

export const getClientDebts = (params?: { client_id?: number; currency_id?: string }) =>
  apiClient.get('/reports/client-debts', { params }).then(r => r.data)

export const downloadClientStatement = (
  userId: number,
  params: { from: string; to: string; format?: 'xlsx' | 'pdf' },
) =>
  apiClient.get(`/reports/client-statements/${userId}.${params.format ?? 'xlsx'}`, {
    params: { from: params.from, to: params.to },
    responseType: 'blob',
  })

export const downloadFullActivityReport = (params?: { from?: string; to?: string; format?: 'xlsx' | 'pdf' }) =>
  apiClient.get(`/reports/full-activity.${params?.format ?? 'xlsx'}`, {
    params: { from: params?.from, to: params?.to },
    responseType: 'blob',
  })

export const freshStart = (confirm: 'I approve') =>
  apiClient.post('/admin/fresh-start', { confirm }).then(r => r.data)

export const clearRecords = (confirm: 'I approve') =>
  apiClient.post('/admin/clear-records', { confirm }).then(r => r.data)
