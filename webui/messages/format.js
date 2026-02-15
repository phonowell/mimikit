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

const COUNT_SUFFIXES = ['', 'k', 'M', 'B', 'T']

const integerFormatter = new Intl.NumberFormat('en-US')

const compactFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
})

const formatCount = (value) => {
  if (value === null) return ''
  const rounded = Math.round(value)
  let scaled = rounded
  let suffixIndex = 0

  while (Math.abs(scaled) >= 1000 && suffixIndex < COUNT_SUFFIXES.length - 1) {
    scaled /= 1000
    suffixIndex += 1
  }

  if (suffixIndex === 0) return integerFormatter.format(rounded)

  let normalized = Math.round(scaled * 10) / 10
  if (Math.abs(normalized) >= 1000 && suffixIndex < COUNT_SUFFIXES.length - 1) {
    normalized /= 1000
    suffixIndex += 1
  }

  return `${compactFormatter.format(normalized)}${COUNT_SUFFIXES[suffixIndex]}`
}

export const formatUsage = (usage) => {
  if (!usage) return ''
  const input = asNumber(usage.input)
  const output = asNumber(usage.output)
  const total = asNumber(usage.total)
  const parts = []
  if (input !== null) parts.push(`\u2191 ${formatCount(input)}`)
  if (output !== null) parts.push(`\u2193 ${formatCount(output)}`)
  if (parts.length === 0 && total !== null) parts.push(`\u2195 ${formatCount(total)}`)
  return parts.join(' \u00b7 ')
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
  } else {
    parts.push(`${totalMinutes}m`)
  }
  parts.push(`${seconds}s`)
  return parts.join(' ')
}
