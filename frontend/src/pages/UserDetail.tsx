import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, FileSpreadsheet, Wallet, ShoppingCart, BookOpen, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import ExcelJS from 'exceljs'
import { getUser, listWallets, listOrders, listJournalEntries, listCurrencies } from '../api'
import { Card, Button, Table, Badge, VoidBadge, Modal, Input, Alert } from '../components/ui'
import type { OrderRead, JournalEntryRead, WalletRead, CurrencyRead } from '../types'
import { fmtDate, fmtDateTimeShort, fmtReportDateTime } from '../utils/date'

function fmtAmt(s: string | number, decimals = 4) {
  const n = typeof s === 'string' ? parseFloat(s) : s
  return isNaN(n) ? String(s) : new Intl.NumberFormat('en-US', { maximumFractionDigits: decimals }).format(n)
}

function numFmt(n: number, decimals = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

// ── Theme colours ─────────────────────────────────────────────────────────────
const C = {
  darkBg:   '1E3A5F',   // deep navy — title / section headers
  midBg:    '2D5F8F',   // medium blue — column headers
  accent:   '4A90D9',   // sky blue — labels
  lightBg:  'EBF3FB',   // pale blue — alternating rows
  white:    'FFFFFF',
  black:    '1A1A2E',
  green:    '1A7A3C',
  greenBg:  'E8F5E9',
  red:      'B71C1C',
  redBg:    'FFEBEE',
  gray:     '6B7280',
  border:   'BDD7EE',
}

type ExcelFont = { bold?: boolean; size?: number; color?: { argb: string }; name?: string }
type ExcelFill = { type: 'pattern'; pattern: 'solid'; fgColor: { argb: string } }
type ExcelBorder = { style: 'thin' | 'medium' | 'thick'; color?: { argb: string } }
type ExcelAlignment = { horizontal?: 'left'|'center'|'right'; vertical?: 'middle'; wrapText?: boolean }
type CellStyle = { font?: ExcelFont; fill?: ExcelFill; border?: Partial<{ top: ExcelBorder; bottom: ExcelBorder; left: ExcelBorder; right: ExcelBorder }>; alignment?: ExcelAlignment; numFmt?: string }

function styleCell(cell: ExcelJS.Cell, s: CellStyle) {
  if (s.font)      cell.font      = s.font as ExcelJS.Font
  if (s.fill)      cell.fill      = s.fill as ExcelJS.Fill
  if (s.border)    cell.border    = s.border as ExcelJS.Borders
  if (s.alignment) cell.alignment = s.alignment as ExcelJS.Alignment
  if (s.numFmt)    cell.numFmt    = s.numFmt
}

function solidFill(hex: string): ExcelFill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: hex } }
}
function allBorders(color = C.border): CellStyle['border'] {
  const b: ExcelBorder = { style: 'thin', color: { argb: color } }
  return { top: b, bottom: b, left: b, right: b }
}

// ── Excel report generator ────────────────────────────────────────────────────
async function generateExcel(opts: {
  user: { name: string; surname: string | null; username: string; role: string }
  wallets: WalletRead[]
  currencies: CurrencyRead[]
  orders: OrderRead[]
  journals: JournalEntryRead[]
  userWalletIds: Set<number>
  fromDate: string   // YYYY-MM-DD
  toDate: string     // YYYY-MM-DD
}) {
  const { user, wallets, currencies, orders, journals, userWalletIds, fromDate, toDate } = opts

  const currMap: Record<string, CurrencyRead> = {}
  currencies.forEach(c => { currMap[c.ticker] = c })

  const fullName = `${user.name}${user.surname ? ' ' + user.surname : ''}`
  const periodLabel = `${fromDate.split('-').reverse().join('/')} — ${toDate.split('-').reverse().join('/')}`
  const generatedAt = fmtReportDateTime(new Date().toISOString())

  // ── Build combined transaction rows ────────────────────────────────────────
  type TxRow = {
    date: string          // ISO for sorting
    dateLabel: string     // formatted
    category: string      // "FX Order" | "Transfer"
    type: string          // BUY/SELL or Sent/Received
    description: string
    sent: string          // e.g. "1,080.00 USD"
    received: string      // e.g. "1,000.00 EUR"
    note: string
    status: string
    voided: boolean
  }

  const txRows: TxRow[] = []

  orders.forEach(o => {
    const inAmt  = numFmt(parseFloat(o.amount_in), 2)
    const outAmt = numFmt(parseFloat(o.amount_out), 2)
    const inCurr  = currMap[o.currency_in_id]?.name  ?? o.currency_in_id
    const outCurr = currMap[o.currency_out_id]?.name ?? o.currency_out_id
    const rate = parseFloat(o.exchange_rate).toFixed(4)

    txRows.push({
      date: o.created_at,
      dateLabel: fmtReportDateTime(o.created_at),
      category: 'FX Order',
      type: o.order_type,
      description: `${inCurr} → ${outCurr} @ ${rate}`,
      sent:     `${inAmt} ${o.currency_in_id}`,
      received: `${outAmt} ${o.currency_out_id}`,
      note: o.description ?? '',
      status: o.voided_at ? 'Voided' : 'Active',
      voided: !!o.voided_at,
    })
  })

  journals.forEach(j => {
    const isOut = userWalletIds.has(j.from_wallet_id)
    const amt = numFmt(parseFloat(j.amount), 2)
    const c = currMap[j.currency_id]
    const currLabel = c?.name ?? j.currency_id

    txRows.push({
      date: j.created_at,
      dateLabel: fmtReportDateTime(j.created_at),
      category: 'Transfer',
      type: isOut ? 'Sent' : 'Received',
      description: `${currLabel} transfer`,
      sent:     isOut ? `${amt} ${j.currency_id}` : '',
      received: isOut ? '' : `${amt} ${j.currency_id}`,
      note: j.description ?? '',
      status: j.voided_at ? 'Voided' : 'Active',
      voided: !!j.voided_at,
    })
  })

  // Sort by date ascending
  txRows.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0)

  // ── Build workbook ────────────────────────────────────────────────────────
  const wb = new ExcelJS.Workbook()
  wb.creator = 'FX Ledger'
  wb.created = new Date()

  const ws = wb.addWorksheet('Client Statement', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
    views: [{ showGridLines: false }],
  })

  // Column widths
  ws.columns = [
    { width: 2  },  // A — left margin
    { width: 20 },  // B — date
    { width: 12 },  // C — category
    { width: 10 },  // D — type
    { width: 28 },  // E — description
    { width: 22 },  // F — sent
    { width: 22 },  // G — received
    { width: 32 },  // H — note
    { width: 10 },  // I — status
    { width: 2  },  // J — right margin
  ]

  let row = 1

  // ── Title block ──────────────────────────────────────────────────────────
  // Row 1: tall title row
  ws.mergeCells(`B${row}:I${row}`)
  const titleCell = ws.getCell(`B${row}`)
  titleCell.value = 'CLIENT STATEMENT'
  styleCell(titleCell, {
    font: { bold: true, size: 18, color: { argb: C.white }, name: 'Calibri' },
    fill: solidFill(C.darkBg),
    alignment: { horizontal: 'center', vertical: 'middle' },
  })
  ws.getRow(row).height = 38
  row++

  // Row 2: client name sub-header
  ws.mergeCells(`B${row}:I${row}`)
  const nameCell = ws.getCell(`B${row}`)
  nameCell.value = fullName
  styleCell(nameCell, {
    font: { bold: true, size: 13, color: { argb: C.white }, name: 'Calibri' },
    fill: solidFill(C.darkBg),
    alignment: { horizontal: 'center', vertical: 'middle' },
  })
  ws.getRow(row).height = 24
  row++

  // Spacer
  ws.getRow(row).height = 6
  row++

  // ── Meta info block ──────────────────────────────────────────────────────
  const metaRows: [string, string][] = [
    ['Report Period', periodLabel],
    ['Generated',     generatedAt],
  ]
  for (const [label, value] of metaRows) {
    ws.getCell(`B${row}`).value = label
    styleCell(ws.getCell(`B${row}`), {
      font: { bold: true, size: 10, color: { argb: C.gray }, name: 'Calibri' },
      alignment: { horizontal: 'left', vertical: 'middle' },
    })
    ws.mergeCells(`C${row}:I${row}`)
    ws.getCell(`C${row}`).value = value
    styleCell(ws.getCell(`C${row}`), {
      font: { size: 10, color: { argb: C.black }, name: 'Calibri' },
      alignment: { horizontal: 'left', vertical: 'middle' },
    })
    ws.getRow(row).height = 18
    row++
  }

  row++ // spacer

  // ── Wallet Balances section ───────────────────────────────────────────────
  ws.mergeCells(`B${row}:I${row}`)
  const balHeader = ws.getCell(`B${row}`)
  balHeader.value = 'WALLET BALANCES'
  styleCell(balHeader, {
    font: { bold: true, size: 11, color: { argb: C.white }, name: 'Calibri' },
    fill: solidFill(C.midBg),
    alignment: { horizontal: 'left', vertical: 'middle' },
    border: allBorders(C.midBg),
  })
  ws.getRow(row).height = 22
  row++

  // Column headers for balances
  const balColHeaders = ['Currency', 'Balance']
  const balCols = ['B', 'C']
  balColHeaders.forEach((h, i) => {
    const cell = ws.getCell(`${balCols[i]}${row}`)
    cell.value = h
    styleCell(cell, {
      font: { bold: true, size: 10, color: { argb: C.white }, name: 'Calibri' },
      fill: solidFill(C.accent),
      border: allBorders(),
      alignment: { horizontal: i === 1 ? 'right' : 'left', vertical: 'middle' },
    })
  })
  ws.getRow(row).height = 18
  row++

  if (wallets.length === 0) {
    ws.mergeCells(`B${row}:C${row}`)
    ws.getCell(`B${row}`).value = 'No wallets'
    styleCell(ws.getCell(`B${row}`), { font: { size: 10, color: { argb: C.gray }, name: 'Calibri' } })
    row++
  } else {
    wallets.forEach((w, idx) => {
      const c = currMap[w.currency_id]
      const isAlt = idx % 2 === 1
      const currCell = ws.getCell(`B${row}`)
      const balCell  = ws.getCell(`C${row}`)
      currCell.value = c?.name ?? w.currency_id
      balCell.value  = parseFloat(w.balance)
      ;[currCell, balCell].forEach((cell, ci) => {
        styleCell(cell, {
          font: { size: 10, color: { argb: C.black }, name: 'Calibri' },
          fill: solidFill(isAlt ? C.lightBg : C.white),
          border: allBorders(),
          alignment: { horizontal: ci === 1 ? 'right' : 'left', vertical: 'middle' },
          numFmt: ci === 1 ? '#,##0.00' : undefined,
        })
      })
      ws.getRow(row).height = 18
      row++
    })
  }

  row++ // spacer

  // ── Transaction History section ───────────────────────────────────────────
  ws.mergeCells(`B${row}:I${row}`)
  const txHeader = ws.getCell(`B${row}`)
  txHeader.value = `TRANSACTION HISTORY  (${txRows.length} transactions)`
  styleCell(txHeader, {
    font: { bold: true, size: 11, color: { argb: C.white }, name: 'Calibri' },
    fill: solidFill(C.midBg),
    alignment: { horizontal: 'left', vertical: 'middle' },
    border: allBorders(C.midBg),
  })
  ws.getRow(row).height = 22
  row++

  // Column headers for transactions
  const txColDefs: { label: string; col: string; align: ExcelAlignment['horizontal'] }[] = [
    { label: 'Date & Time',  col: 'B', align: 'left'   },
    { label: 'Category',     col: 'C', align: 'center' },
    { label: 'Type',         col: 'D', align: 'center' },
    { label: 'Description',  col: 'E', align: 'left'   },
    { label: 'Sent (Debit)', col: 'F', align: 'right'  },
    { label: 'Received (Credit)', col: 'G', align: 'right' },
    { label: 'Note',         col: 'H', align: 'left'   },
    { label: 'Status',       col: 'I', align: 'center' },
  ]
  txColDefs.forEach(({ label, col, align }) => {
    const cell = ws.getCell(`${col}${row}`)
    cell.value = label
    styleCell(cell, {
      font: { bold: true, size: 10, color: { argb: C.white }, name: 'Calibri' },
      fill: solidFill(C.darkBg),
      border: allBorders(C.darkBg),
      alignment: { horizontal: align, vertical: 'middle' },
    })
  })
  ws.getRow(row).height = 20
  row++

  if (txRows.length === 0) {
    ws.mergeCells(`B${row}:I${row}`)
    ws.getCell(`B${row}`).value = 'No transactions in this period'
    styleCell(ws.getCell(`B${row}`), {
      font: { size: 10, color: { argb: C.gray }, name: 'Calibri' },
      alignment: { horizontal: 'center', vertical: 'middle' },
    })
    ws.getRow(row).height = 20
    row++
  } else {
    txRows.forEach((tx, idx) => {
      const isAlt = idx % 2 === 1
      const baseFill = tx.voided ? solidFill('FFF3F3') : solidFill(isAlt ? C.lightBg : C.white)

      const vals: Record<string, string | number> = {
        B: tx.dateLabel,
        C: tx.category,
        D: tx.type,
        E: tx.description,
        F: tx.sent,
        G: tx.received,
        H: tx.note,
        I: tx.status,
      }

      for (const [col, val] of Object.entries(vals)) {
        const cell = ws.getCell(`${col}${row}`)
        cell.value = val

        const isRight = col === 'F' || col === 'G'
        const isCentre = col === 'C' || col === 'D' || col === 'I'
        const isVoidedStatus = col === 'I' && tx.voided

        styleCell(cell, {
          font: {
            size: 9,
            color: { argb: isVoidedStatus ? C.red : tx.voided ? C.gray : col === 'F' && tx.sent ? C.red : col === 'G' && tx.received ? C.green : C.black },
            bold: col === 'F' || col === 'G',
            name: 'Calibri',
          },
          fill: baseFill,
          border: allBorders(),
          alignment: {
            horizontal: isRight ? 'right' : isCentre ? 'center' : 'left',
            vertical: 'middle',
            wrapText: col === 'H',
          },
        })
      }

      ws.getRow(row).height = 18
      row++
    })
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  row++
  ws.mergeCells(`B${row}:I${row}`)
  const footer = ws.getCell(`B${row}`)
  footer.value = `This statement was generated on ${generatedAt} and reflects all transactions recorded in the system for the selected period.`
  styleCell(footer, {
    font: { size: 8, color: { argb: C.gray }, name: 'Calibri' },
    alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
  })
  ws.getRow(row).height = 28

  // ── Write file ──────────────────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const safeFilename = fullName.replace(/[^a-zA-Z0-9]/g, '_')
  a.href = url
  a.download = `${safeFilename}_statement_${fromDate}_to_${toDate}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Export Modal ──────────────────────────────────────────────────────────────
function ExportModal({ open, onClose, user, wallets, currencies, orders, journals, userWalletIds }: {
  open: boolean
  onClose: () => void
  user: { name: string; surname: string | null; username: string; role: string }
  wallets: WalletRead[]
  currencies: CurrencyRead[]
  orders: OrderRead[]
  journals: JournalEntryRead[]
  userWalletIds: Set<number>
}) {
  const today = new Date().toISOString().slice(0, 10)
  const monthAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  const [from, setFrom] = useState(monthAgo)
  const [to, setTo] = useState(today)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const filteredOrders = useMemo(() =>
    orders.filter(o => o.created_at.slice(0, 10) >= from && o.created_at.slice(0, 10) <= to),
    [orders, from, to]
  )
  const filteredJournals = useMemo(() =>
    journals.filter(j => j.created_at.slice(0, 10) >= from && j.created_at.slice(0, 10) <= to),
    [journals, from, to]
  )

  const handleExport = async () => {
    if (!from || !to) { setErr('Both dates are required'); return }
    if (from > to) { setErr('Start date must be before end date'); return }
    setLoading(true)
    try {
      await generateExcel({
        user, wallets, currencies, userWalletIds,
        orders: filteredOrders,
        journals: filteredJournals,
        fromDate: from,
        toDate: to,
      })
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Export Client Statement" size="sm">
      <div className="space-y-4">
        {err && <Alert type="error" message={err} />}
        <p className="text-sm text-gray-500">
          Select the report period. Orders and transfers will be combined in one table, sorted by date.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Input label="From date" type="date" value={from} onChange={e => setFrom(e.target.value)} />
          <Input label="To date" type="date" value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <div className="bg-blue-50 rounded-lg px-4 py-3 text-xs text-blue-700">
          <span className="font-medium">{filteredOrders.length}</span> orders &nbsp;·&nbsp;
          <span className="font-medium">{filteredJournals.length}</span> transfers in period
          &nbsp;·&nbsp; <span className="font-medium">{filteredOrders.length + filteredJournals.length}</span> total rows
        </div>
        <div className="flex gap-3 justify-end pt-1">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" icon={<FileSpreadsheet size={15} />} onClick={handleExport} loading={loading}>
            Download Excel
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function UserDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const userId = Number(id)
  const [exportOpen, setExportOpen] = useState(false)
  const [tab, setTab] = useState<'orders' | 'journals' | 'wallets'>('orders')

  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['user', userId],
    queryFn: () => getUser(userId),
    enabled: !!userId,
  })

  const { data: allWallets = [] } = useQuery({ queryKey: ['wallets'], queryFn: () => listWallets() })
  const { data: currencies = [] } = useQuery({ queryKey: ['currencies'], queryFn: () => listCurrencies() })
  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['orders', userId],
    queryFn: () => listOrders({ client_id: userId }),
    enabled: !!userId,
  })
  const { data: allJournals = [], isLoading: journalsLoading } = useQuery({
    queryKey: ['journal-entries'],
    queryFn: () => listJournalEntries(),
  })

  const currMap: Record<string, CurrencyRead> = {}
  currencies.forEach((c: CurrencyRead) => { currMap[c.ticker] = c })

  const walletMap: Record<number, WalletRead> = {}
  allWallets.forEach((w: WalletRead) => { walletMap[w.id] = w })

  // Wallets belonging to this user
  const userWallets: WalletRead[] = allWallets.filter((w: WalletRead) => w.user_id === userId)

  // Wallet IDs belonging to this user
  const userWalletIds = new Set(userWallets.map((w: WalletRead) => w.id))

  // Journal entries where this user is sender or receiver
  const userJournals: JournalEntryRead[] = allJournals.filter((j: JournalEntryRead) =>
    userWalletIds.has(j.from_wallet_id) || userWalletIds.has(j.to_wallet_id)
  )

  // ── Stats ──────────────────────────────────────────────────────────────────
  const activeOrders = orders.filter((o: OrderRead) => !o.voided_at).length
  const activeJournals = userJournals.filter((j: JournalEntryRead) => !j.voided_at).length

  // Position per currency (from active orders)
  const netPosition: Record<string, number> = {}
  orders.filter((o: OrderRead) => !o.voided_at).forEach((o: OrderRead) => {
    if (o.order_type === 'BUY') {
      netPosition[o.currency_in_id] = (netPosition[o.currency_in_id] ?? 0) - parseFloat(o.amount_in)
      netPosition[o.currency_out_id] = (netPosition[o.currency_out_id] ?? 0) + parseFloat(o.amount_out)
    } else {
      netPosition[o.currency_out_id] = (netPosition[o.currency_out_id] ?? 0) - parseFloat(o.amount_out)
      netPosition[o.currency_in_id] = (netPosition[o.currency_in_id] ?? 0) + parseFloat(o.amount_in)
    }
  })

  // ── Columns ────────────────────────────────────────────────────────────────
  const orderColumns = [
    { key: 'id', header: '#', render: (r: OrderRead) => <span className="font-mono text-xs text-gray-400">#{r.id}</span>, sortValue: (r: OrderRead) => r.id },
    { key: 'type', header: 'Type', render: (r: OrderRead) => <Badge variant={r.order_type === 'BUY' ? 'green' : 'blue'}>{r.order_type}</Badge>, sortValue: (r: OrderRead) => r.order_type },
    { key: 'pair', header: 'Pair', render: (r: OrderRead) => <span className="font-mono text-sm font-semibold">{r.currency_in_id}/{r.currency_out_id}</span>, sortValue: (r: OrderRead) => `${r.currency_in_id}/${r.currency_out_id}` },
    {
      key: 'amount', header: 'In → Out',
      render: (r: OrderRead) => <span className="text-sm">{fmtAmt(r.amount_in)} <span className="text-gray-400">→</span> {fmtAmt(r.amount_out)}</span>,
      sortValue: (r: OrderRead) => parseFloat(r.amount_in),
    },
    { key: 'rate', header: 'Rate', render: (r: OrderRead) => <span className="font-mono text-xs text-gray-600">{r.exchange_rate}</span>, sortValue: (r: OrderRead) => parseFloat(r.exchange_rate) },
    { key: 'status', header: 'Status', render: (r: OrderRead) => <VoidBadge voidedAt={r.voided_at} />, sortValue: (r: OrderRead) => r.voided_at ?? '' },
    { key: 'date', header: 'Date', render: (r: OrderRead) => <span className="text-xs text-gray-400">{fmtDateTimeShort(r.created_at)}</span>, sortValue: (r: OrderRead) => r.created_at },
  ]

  const journalColumns = [
    { key: 'id', header: '#', render: (r: JournalEntryRead) => <span className="font-mono text-xs text-gray-400">#{r.id}</span>, sortValue: (r: JournalEntryRead) => r.id },
    {
      key: 'direction', header: 'Direction',
      render: (r: JournalEntryRead) => {
        const isOut = userWalletIds.has(r.from_wallet_id)
        return isOut
          ? <Badge variant="red">Sent</Badge>
          : <Badge variant="green">Received</Badge>
      },
      sortValue: (r: JournalEntryRead) => userWalletIds.has(r.from_wallet_id) ? 'sent' : 'received',
    },
    {
      key: 'other', header: 'Other Party',
      render: (r: JournalEntryRead) => {
        const isOut = userWalletIds.has(r.from_wallet_id)
        const otherWalletId = isOut ? r.to_wallet_id : r.from_wallet_id
        const otherWallet = walletMap[otherWalletId]
        return <span className="text-xs text-gray-500">Wallet #{otherWalletId}{otherWallet ? ` (${otherWallet.currency_id})` : ''}</span>
      },
    },
    {
      key: 'transfer', header: 'Amount',
      render: (r: JournalEntryRead) => {
        const c = currMap[r.currency_id]
        const symbol = c?.symbol ?? r.currency_id
        const isOut = userWalletIds.has(r.from_wallet_id)
        return (
          <span className={`font-semibold text-sm ${isOut ? 'text-red-600' : 'text-green-600'}`}>
            {isOut ? '−' : '+'}{symbol} {fmtAmt(r.amount)}
          </span>
        )
      },
      sortValue: (r: JournalEntryRead) => parseFloat(r.amount),
    },
    { key: 'note', header: 'Note', render: (r: JournalEntryRead) => <span className="text-xs text-gray-500 max-w-[160px] block truncate">{r.description || '—'}</span> },
    { key: 'status', header: 'Status', render: (r: JournalEntryRead) => <VoidBadge voidedAt={r.voided_at} />, sortValue: (r: JournalEntryRead) => r.voided_at ?? '' },
    { key: 'date', header: 'Date', render: (r: JournalEntryRead) => <span className="text-xs text-gray-400">{fmtDateTimeShort(r.created_at)}</span>, sortValue: (r: JournalEntryRead) => r.created_at },
  ]

  if (userLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">Loading…</div>
    )
  }

  if (!user) {
    return (
      <div className="text-center py-20 text-gray-400">User not found.</div>
    )
  }

  const fullName = `${user.name}${user.surname ? ' ' + user.surname : ''}`

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/users')}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">{fullName}</h1>
              <Badge variant={user.role === 'CLIENT' ? 'blue' : 'purple'}>{user.role}</Badge>
            </div>
            <p className="text-sm text-gray-400 mt-0.5">@{user.username} · Member since {fmtDate(user.created_at)}</p>
          </div>
        </div>
        <Button icon={<FileSpreadsheet size={16} />} onClick={() => setExportOpen(true)}>
          Export Statement
        </Button>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg"><Wallet size={18} className="text-blue-600" /></div>
            <div>
              <p className="text-xs text-gray-500">Wallets</p>
              <p className="text-xl font-bold text-gray-900">{userWallets.length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-lg"><ShoppingCart size={18} className="text-green-600" /></div>
            <div>
              <p className="text-xs text-gray-500">Active Orders</p>
              <p className="text-xl font-bold text-gray-900">{activeOrders}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-50 rounded-lg"><BookOpen size={18} className="text-purple-600" /></div>
            <div>
              <p className="text-xs text-gray-500">Journal Entries</p>
              <p className="text-xl font-bold text-gray-900">{activeJournals}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-50 rounded-lg"><TrendingUp size={18} className="text-yellow-600" /></div>
            <div>
              <p className="text-xs text-gray-500">Currencies held</p>
              <p className="text-xl font-bold text-gray-900">{userWallets.length}</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Wallet balances */}
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><Wallet size={15} /> Wallet Balances</h2>
          {userWallets.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No wallets</p>
          ) : (
            <div className="space-y-2">
              {userWallets.map((w: WalletRead) => {
                const c = currMap[w.currency_id]
                return (
                  <div key={w.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                    <div>
                      <span className="text-sm font-medium text-gray-800">{w.currency_id}</span>
                      {c && <span className="text-xs text-gray-400 ml-1.5">{c.name}</span>}
                    </div>
                    <span className="font-mono text-sm font-semibold text-gray-900">
                      {c?.symbol ?? ''}{fmtAmt(w.balance, 2)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* Net position */}
        <Card className="p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <TrendingUp size={15} /> Net Position (from all active orders)
          </h2>
          {Object.keys(netPosition).length === 0 ? (
            <p className="text-xs text-gray-400 italic">No active orders</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(netPosition).map(([curr, net]) => {
                const c = currMap[curr]
                const isPos = net > 0
                const isNeg = net < 0
                return (
                  <div key={curr} className={`rounded-lg px-4 py-3 flex items-center justify-between ${isPos ? 'bg-green-50' : isNeg ? 'bg-red-50' : 'bg-gray-50'}`}>
                    <div>
                      <p className="text-xs font-medium text-gray-500">{curr}</p>
                      <p className="text-xs text-gray-400">{c?.name ?? curr}</p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1">
                        {isPos ? <TrendingUp size={13} className="text-green-600" /> : isNeg ? <TrendingDown size={13} className="text-red-600" /> : <Minus size={13} className="text-gray-400" />}
                        <span className={`font-mono font-semibold text-sm ${isPos ? 'text-green-700' : isNeg ? 'text-red-700' : 'text-gray-600'}`}>
                          {net > 0 ? '+' : ''}{fmtAmt(String(net), 2)}
                        </span>
                      </div>
                      <p className={`text-xs mt-0.5 ${isPos ? 'text-green-600' : isNeg ? 'text-red-600' : 'text-gray-400'}`}>
                        {isPos ? 'House owes client' : isNeg ? 'Client owes house' : 'Settled'}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Tabs */}
      <Card>
        <div className="border-b border-gray-100 px-4 pt-4">
          <div className="flex gap-0">
            {([
              { key: 'orders', label: 'Orders', count: orders.length },
              { key: 'journals', label: 'Journal Entries', count: userJournals.length },
              { key: 'wallets', label: 'Wallets', count: userWallets.length },
            ] as const).map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${
                  tab === t.key
                    ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${tab === t.key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {tab === 'orders' && (
          <Table
            columns={orderColumns}
            data={orders as OrderRead[]}
            keyFn={r => r.id}
            loading={ordersLoading}
            emptyMessage="No orders for this client"
            defaultSortKey="date"
            defaultSortDir="desc"
          />
        )}

        {tab === 'journals' && (
          <Table
            columns={journalColumns}
            data={userJournals}
            keyFn={r => r.id}
            loading={journalsLoading}
            emptyMessage="No journal entries for this client"
            defaultSortKey="date"
            defaultSortDir="desc"
          />
        )}

        {tab === 'wallets' && (
          <div className="p-6">
            {userWallets.length === 0 ? (
              <p className="text-sm text-gray-400 italic text-center py-8">No wallets found.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {userWallets.map((w: WalletRead) => {
                  const c = currMap[w.currency_id]
                  return (
                    <div key={w.id} className="border border-gray-200 rounded-xl p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-semibold text-gray-900">{w.currency_id}</p>
                          {c && <p className="text-xs text-gray-400">{c.name}</p>}
                        </div>
                        <span className="text-xs font-mono text-gray-400 bg-gray-50 px-2 py-0.5 rounded">#{w.id}</span>
                      </div>
                      <p className="text-2xl font-bold text-gray-900 mt-1">
                        <span className="text-base font-normal text-gray-500 mr-1">{c?.symbol ?? ''}</span>
                        {fmtAmt(w.balance, 2)}
                      </p>
                      <p className="text-xs text-gray-400 mt-2">Created {fmtDate(w.created_at)}</p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </Card>

      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        user={user}
        wallets={userWallets}
        currencies={currencies}
        orders={orders as OrderRead[]}
        journals={userJournals}
        userWalletIds={userWalletIds}
      />
    </div>
  )
}
