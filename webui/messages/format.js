export function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString()
  } catch (error) {
    console.warn('[webui] formatTime failed', error)
    return ''
  }
}

export function formatDateTime(iso) {
  try {
    return new Date(iso).toLocaleString()
  } catch (error) {
    console.warn('[webui] formatDateTime failed', error)
    return ''
  }
}

const asNumber = (value) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const integerFormatter = new Intl.NumberFormat('en-US')
const compactFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  compactDisplay: 'short',
  maximumFractionDigits: 1,
})

const formatIntegerCount = (value) => {
  if (value === null) return ''
  return integerFormatter.format(Math.round(value))
}

const formatCompactCount = (value) => {
  if (value === null) return ''
  return compactFormatter.format(Math.round(value))
}

export const formatUsage = (usage) => {
  if (!usage) return null
  const input = asNumber(usage.input)
  const output = asNumber(usage.output)
  const inputCacheRead = asNumber(usage.inputCacheRead)
  const inputCacheWrite = asNumber(usage.inputCacheWrite)
  const outputCache = asNumber(usage.outputCache)
  const hasInputSide =
    input !== null || inputCacheRead !== null || inputCacheWrite !== null
  const hasOutputSide = output !== null || outputCache !== null

  if (!hasInputSide && !hasOutputSide) return null

  const inputTotal = hasInputSide
    ? Math.round(input ?? 0) +
      Math.round(inputCacheRead ?? 0) +
      Math.round(inputCacheWrite ?? 0)
    : null
  const outputTotal = hasOutputSide
    ? Math.round(output ?? 0) + Math.round(outputCache ?? 0)
    : null

  const textParts = []
  if (inputTotal !== null) textParts.push(`\u2191 ${formatIntegerCount(inputTotal)}`)
  if (outputTotal !== null) textParts.push(`\u2193 ${formatIntegerCount(outputTotal)}`)
  const text = textParts.join(' \u00b7 ')
  const title = [
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
  ].join('\n')
  return { text, title }
}

export const formatElapsedLabel = (elapsedMs) => {
  const ms = asNumber(elapsedMs)
  if (ms === null) return ''
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  if (totalSeconds < 60) return `${totalSeconds}s`
  const totalMinutes = Math.floor(totalSeconds / 60)
  const totalHours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const seconds = totalSeconds % 60
  const parts = []
  if (totalHours > 0) {
    parts.push(`${totalHours}h`)
    parts.push(`${minutes}m`)
  } else 
    parts.push(`${totalMinutes}m`)
  
  parts.push(`${seconds}s`)
  return parts.join(' ')
}
