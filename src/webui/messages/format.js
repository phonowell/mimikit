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

const formatCount = (value) => {
  if (value === null) return ''
  const rounded = Math.round(value)
  if (Math.abs(rounded) < 1000)
    return new Intl.NumberFormat('en-US').format(rounded)
  const formatted = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 1,
  }).format(rounded / 1000)
  return `${formatted}k`
}

export const formatUsage = (usage) => {
  if (!usage) return ''
  const input = asNumber(usage.input)
  const output = asNumber(usage.output)
  const parts = []
  if (input !== null) parts.push(`↑ ${formatCount(input)}`)
  if (output !== null) parts.push(`↓ ${formatCount(output)}`)
  return parts.join(' · ')
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
