import { useEffect } from 'react'
import { formatNumericInput, stripNumberFormatting } from '../../utils/number'

function parseAmount(value: string): number | null {
  if (value.trim() === '') return null
  const parsed = Number(stripNumberFormatting(value))
  return Number.isFinite(parsed) ? parsed : null
}

function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return ''
  return Number(value.toFixed(8)).toString()
}

interface RateCalculatorProps {
  label?: string
  rate: string
  setRate: (value: string) => void
  amountIn: string
  setAmountIn: (value: string) => void
  amountOut: string
  setAmountOut: (value: string) => void
}

export function RateCalculator({
  label = 'Exchange Rate *',
  rate,
  setRate,
  amountIn,
  setAmountIn,
  amountOut,
  setAmountOut,
}: RateCalculatorProps) {
  const amountInNum = parseAmount(amountIn)
  const amountOutNum = parseAmount(amountOut)
  const rateNum = parseAmount(rate)
  const hasAmountIn = amountIn.trim() !== ''
  const hasAmountOut = amountOut.trim() !== ''
  const hasBothAmounts = hasAmountIn && hasAmountOut
  const canCalculateMissing =
    !hasBothAmounts &&
    rateNum !== null &&
    rateNum !== 0 &&
    ((amountInNum !== null && !hasAmountOut) || (amountOutNum !== null && !hasAmountIn))

  useEffect(() => {
    if (amountInNum === null || amountOutNum === null || amountInNum === 0 || amountOutNum === 0) return
    const bigger = Math.max(Math.abs(amountInNum), Math.abs(amountOutNum))
    const smaller = Math.min(Math.abs(amountInNum), Math.abs(amountOutNum))
    if (smaller === 0) return

    const nextRate = formatAmount(bigger / smaller)
    setRate(nextRate)
  }, [amountInNum, amountOutNum, setRate])

  const calculateMissing = (operation: 'multiply' | 'divide') => {
    if (!canCalculateMissing || rateNum === null || rateNum === 0) return

    if (amountInNum !== null && !hasAmountOut) {
      setAmountOut(formatAmount(operation === 'multiply' ? amountInNum * rateNum : amountInNum / rateNum))
      return
    }

    if (amountOutNum !== null && !hasAmountIn) {
      setAmountIn(formatAmount(operation === 'multiply' ? amountOutNum * rateNum : amountOutNum / rateNum))
    }
  }

  const buttonClass = 'h-10 w-10 shrink-0 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <div className="flex gap-2">
        <input
          type="text"
          inputMode="decimal"
          value={formatNumericInput(rate)}
          onChange={e => setRate(stripNumberFormatting(e.target.value))}
          placeholder="1.2345"
          className="min-w-0 flex-1 px-3 py-2 border rounded-lg text-sm bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent transition border-gray-300"
        />
        <button
          type="button"
          onClick={() => calculateMissing('multiply')}
          disabled={!canCalculateMissing}
          className={buttonClass}
          title="Calculate missing amount by multiplying with rate"
        >
          x
        </button>
        <button
          type="button"
          onClick={() => calculateMissing('divide')}
          disabled={!canCalculateMissing}
          className={buttonClass}
          title="Calculate missing amount by dividing by rate"
        >
          ÷
        </button>
      </div>
    </div>
  )
}
