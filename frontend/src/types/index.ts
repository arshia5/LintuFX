export type UserRole = 'CLIENT' | 'HOUSE' | 'DEVELOPER'
export type OrderType = 'BUY' | 'SELL'
export type ExpenseType = 'EXPENSE' | 'WITHDRAWAL'

export interface TokenRead {
  access_token: string
  token_type: 'bearer'
  expires_in: number
  user: UserRead
}

export interface CurrencyRead {
  name: string
  symbol: string | null
  decimals: number
  is_active: boolean
  ticker: string
  created_at: string
}

export interface CurrencyCreate {
  name: string
  ticker: string
  symbol?: string | null
  decimals?: number
  is_active?: boolean
}

export interface CurrencyUpdate {
  name?: string | null
  symbol?: string | null
  decimals?: number | null
  is_active?: boolean | null
}

export interface UserRead {
  role: UserRole
  username: string
  name: string
  surname: string | null
  id: number
  created_at: string
}

export interface EventLogRead {
  id: number
  event_type: string
  entity_type: string
  entity_id: number | null
  actor_user_id: number | null
  details: Record<string, unknown>
  created_at: string
}

export interface UserCreate {
  role: UserRole
  username: string
  name: string
  surname?: string | null
  password?: string | null
}

export interface UserUpdate {
  role?: UserRole | null
  username?: string | null
  name?: string | null
  surname?: string | null
  password?: string | null
}

export interface WalletRead {
  user_id: number
  currency_id: string
  id: number
  balance: string
  created_at: string
}

export interface WalletCreate {
  user_id: number
  currency_id: string
  balance?: string | number
}

export interface WalletAdjustmentRead {
  id: number
  wallet_id: number
  currency_id: string
  balance_before: string
  balance_after: string
  amount_delta: string
  reason: string
  created_by_user_id: number
  created_at: string
}

export interface WalletBalanceAdjustmentCreate {
  balance_after?: string | number | null
  amount_delta?: string | number | null
  reason: string
}

export interface OrderRead {
  client_id: number
  order_type: OrderType
  currency_in_id: string
  currency_out_id: string
  amount_in: string
  amount_out: string
  exchange_rate: string
  description: string | null
  id: number
  created_at: string
  created_by_user_id: number | null
  updated_by_user_id: number | null
  voided_at: string | null
  voided_by_user_id: number | null
  void_reason: string | null
}

export interface OrderCreate {
  client_id: number
  order_type: OrderType
  currency_in_id: string
  currency_out_id: string
  amount_in: string | number
  amount_out: string | number
  exchange_rate: string | number
  description?: string | null
  created_at?: string | null
}

export interface OrderCorrectionCreate {
  client_id: number
  order_type: OrderType
  currency_in_id: string
  currency_out_id: string
  amount_in: string | number
  amount_out: string | number
  exchange_rate: string | number
  description?: string | null
  created_at?: string | null
  correction_reason: string
}

export interface OrderCorrectionRead {
  voided_record: OrderRead
  correction_record: OrderRead
}

export interface HouseExchangeRead {
  house_id: number
  currency_from_id: string
  currency_to_id: string
  amount_from: string
  amount_to: string
  exchange_rate: string
  description: string | null
  id: number
  created_at: string
  created_by_user_id: number | null
  updated_by_user_id: number | null
  voided_at: string | null
  voided_by_user_id: number | null
  void_reason: string | null
}

export interface HouseExchangeCreate {
  house_id: number
  currency_from_id: string
  currency_to_id: string
  amount_from: string | number
  amount_to: string | number
  exchange_rate: string | number
  description?: string | null
}

export interface HouseExchangeCorrectionCreate {
  house_id: number
  currency_from_id: string
  currency_to_id: string
  amount_from: string | number
  amount_to: string | number
  exchange_rate: string | number
  description?: string | null
  correction_reason: string
}

export interface HouseExchangeCorrectionRead {
  voided_record: HouseExchangeRead
  correction_record: HouseExchangeRead
}

export interface ExpenseRead {
  house_id: number
  expense_type: ExpenseType
  currency_id: string
  amount: string
  recipient_user_id: number | null
  description: string | null
  id: number
  created_at: string
  created_by_user_id: number | null
  updated_by_user_id: number | null
  voided_at: string | null
  voided_by_user_id: number | null
  void_reason: string | null
}

export interface ExpenseCreate {
  house_id: number
  expense_type: ExpenseType
  currency_id: string
  amount: string | number
  recipient_user_id?: number | null
  description?: string | null
  created_at?: string | null
}

export interface ExpenseCorrectionCreate {
  house_id: number
  expense_type: ExpenseType
  currency_id: string
  amount: string | number
  recipient_user_id?: number | null
  description?: string | null
  created_at?: string | null
  correction_reason: string
}

export interface ExpenseCorrectionRead {
  voided_record: ExpenseRead
  correction_record: ExpenseRead
}

export interface JournalEntryRead {
  from_wallet_id: number
  to_wallet_id: number
  amount: string
  currency_id: string
  description: string | null
  id: number
  created_at: string
  created_by_user_id: number | null
  updated_by_user_id: number | null
  voided_at: string | null
  voided_by_user_id: number | null
  void_reason: string | null
}

export interface JournalEntryCreate {
  from_wallet_id: number
  to_wallet_id: number
  amount: string | number
  currency_id: string
  description?: string | null
  created_at?: string | null
}

export interface JournalEntryCorrectionCreate {
  from_wallet_id: number
  to_wallet_id: number
  amount: string | number
  currency_id: string
  description?: string | null
  created_at?: string | null
  correction_reason: string
}

export interface JournalEntryCorrectionRead {
  voided_record: JournalEntryRead
  correction_record: JournalEntryRead
}

export interface VoidRequest {
  reason: string
}

export interface ClientBalanceReport {
  client_id: number
  username: string
  name: string
  surname: string | null
  currency_id: string
  currency_name: string
  balance: string
  position: 'client_owes_house' | 'house_owes_client' | 'settled'
}

export interface Theme {
  primaryColor: string
  accentColor: string
  sidebarColor: string
  fontFamily: string
  borderRadius: string
  compactMode: boolean
  appName: string
}
