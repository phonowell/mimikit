import type { MessageUsage } from '../../types.js'

type UsageSummary = {
  text: string
  title: string
}

const asNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const integerFormatter = new Intl.NumberFormat('en-US')
const compactFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  compactDisplay: 'short',
  maximumFractionDigits: 1,
})

const formatIntegerCount = (value: number | null): string =>
  value === null ? '' : integerFormatter.format(Math.round(value))

const formatCompactCount = (value: number | null): string =>
  value === null
    ? ''
    : compactFormatter.format(Math.round(value)).replace(/K$/u, 'k')

export const formatUsage = (
  usage: MessageUsage | null | undefined,
): UsageSummary | null => {
  if (!usage) return null
  const input = asNumber(usage.input)
  const output = asNumber(usage.output)
  const inputCacheRead = asNumber(usage.inputCacheRead)
  const inputCacheWrite = asNumber(usage.inputCacheWrite)
  const outputCache = asNumber(usage.outputCache)
  const total = asNumber(usage.total)
  const sessionTotal = asNumber(usage.sessionTotal)
  const hasInputSide =
    input !== null || inputCacheRead !== null || inputCacheWrite !== null
  const hasOutputSide = output !== null || outputCache !== null
  if (
    !hasInputSide &&
    !hasOutputSide &&
    total === null &&
    sessionTotal === null
  )
    return null

  const inputTotal = hasInputSide
    ? Math.round(input ?? 0) +
      Math.round(inputCacheRead ?? 0) +
      Math.round(inputCacheWrite ?? 0)
    : null
  const outputTotal = hasOutputSide
    ? Math.round(output ?? 0) + Math.round(outputCache ?? 0)
    : null

  const textParts = []
  if (inputTotal !== null) textParts.push(`↑ ${formatCompactCount(inputTotal)}`)
  if (outputTotal !== null)
    textParts.push(`↓ ${formatCompactCount(outputTotal)}`)
  if (inputTotal === null && outputTotal === null && total !== null)
    textParts.push(`Σ ${formatCompactCount(total)}`)
  if (sessionTotal !== null)
    textParts.push(`S ${formatCompactCount(sessionTotal)}`)
  return {
    text: textParts.join(' · '),
    title: [
      ...(inputTotal !== null
        ? [
            `Input total tokens: ${formatCompactCount(inputTotal)}`,
            `Input tokens: ${formatCompactCount(input ?? 0)}`,
            `Input cache read tokens: ${formatCompactCount(inputCacheRead ?? 0)}`,
            `Input cache write tokens: ${formatCompactCount(inputCacheWrite ?? 0)}`,
          ]
        : []),
      ...(outputTotal !== null
        ? [
            `Output total tokens: ${formatCompactCount(outputTotal)}`,
            `Output tokens: ${formatCompactCount(output ?? 0)}`,
            `Output cache tokens: ${formatCompactCount(outputCache ?? 0)}`,
          ]
        : []),
      ...(total !== null ? [`Total tokens: ${formatIntegerCount(total)}`] : []),
      ...(sessionTotal !== null
        ? [`Session total tokens: ${formatIntegerCount(sessionTotal)}`]
        : []),
    ].join('\n'),
  }
}

export const formatElapsedLabel = (elapsedMs: unknown): string => {
  const ms = asNumber(elapsedMs)
  if (ms === null) return ''
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  if (totalSeconds < 60) return `${totalSeconds}s`
  const totalMinutes = Math.floor(totalSeconds / 60)
  const totalHours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const seconds = totalSeconds % 60
  const parts =
    totalHours > 0 ? [`${totalHours}h`, `${minutes}m`] : [`${totalMinutes}m`]
  parts.push(`${seconds}s`)
  return parts.join(' ')
}
