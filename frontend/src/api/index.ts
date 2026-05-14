import { apiClient } from './client'
import type {
  CurrencyCreate, CurrencyUpdate,
  UserCreate, UserUpdate,
  WalletCreate, WalletBalanceAdjustmentCreate,
  OrderCreate, OrderCorrectionCreate,
  HouseExchangeCreate, HouseExchangeCorrectionCreate,
  JournalEntryCreate, JournalEntryCorrectionCreate,
  VoidRequest, UserRole, OrderType,
} from '../types'

// Auth
export const login = (username: string, password: string) =>
  apiClient.post('/auth/login', { username, password }).then(r => r.data)

// Currencies
export const listCurrencies = (params?: { is_active?: boolean }) =>
  apiClient.get('/currencies', { params }).then(r => r.data)

export const createCurrency = (data: CurrencyCreate) =>
  apiClient.post('/currencies', data).then(r => r.data)

export const updateCurrency = (ticker: string, data: CurrencyUpdate) =>
  apiClient.patch(`/currencies/${ticker}`, data).then(r => r.data)

export const deleteCurrency = (ticker: string) =>
  apiClient.delete(`/currencies/${ticker}`)

// Users
export const listUsers = (params?: { role?: UserRole }) =>
  apiClient.get('/users', { params }).then(r => r.data)

export const getUser = (id: number) =>
  apiClient.get(`/users/${id}`).then(r => r.data)

export const createUser = (data: UserCreate) =>
  apiClient.post('/users', data).then(r => r.data)

export const updateUser = (id: number, data: UserUpdate) =>
  apiClient.patch(`/users/${id}`, data).then(r => r.data)

export const deleteUser = (id: number) =>
  apiClient.delete(`/users/${id}`)

// Wallets
export const listWallets = (params?: { user_id?: number; currency_id?: string }) =>
  apiClient.get('/wallets', { params }).then(r => r.data)

export const getWallet = (id: number) =>
  apiClient.get(`/wallets/${id}`).then(r => r.data)

export const createWallet = (data: WalletCreate) =>
  apiClient.post('/wallets', data).then(r => r.data)

export const deleteWallet = (id: number) =>
  apiClient.delete(`/wallets/${id}`)

export const adjustWalletBalance = (walletId: number, data: WalletBalanceAdjustmentCreate) =>
  apiClient.post(`/wallets/${walletId}/balance-adjustments`, data).then(r => r.data)

export const listWalletAdjustments = (params?: { wallet_id?: number; currency_id?: string }) =>
  apiClient.get('/wallet-adjustments', { params }).then(r => r.data)

// Orders
export const listOrders = (params?: { client_id?: number; order_type?: OrderType; currency_in_id?: string; currency_out_id?: string }) =>
  apiClient.get('/orders', { params }).then(r => r.data)

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
export const listHouseExchanges = (params?: { house_id?: number; currency_from_id?: string; currency_to_id?: string }) =>
  apiClient.get('/house-exchanges', { params }).then(r => r.data)

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
export const listJournalEntries = (params?: { from_wallet_id?: number; to_wallet_id?: number; currency_id?: string }) =>
  apiClient.get('/journal-entries', { params }).then(r => r.data)

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
  apiClient.get('/event-logs', { params }).then(r => r.data)

// Reports
export const getClientBalances = (params?: { direction?: string; client_id?: number; currency_id?: string; include_zero?: boolean }) =>
  apiClient.get('/reports/client-balances', { params }).then(r => r.data)

export const getClientDebts = (params?: { client_id?: number; currency_id?: string }) =>
  apiClient.get('/reports/client-debts', { params }).then(r => r.data)

export const downloadClientStatement = (
  userId: number,
  params: { from: string; to: string },
) =>
  apiClient.get(`/reports/client-statements/${userId}.xlsx`, {
    params,
    responseType: 'blob',
  })
