import { resolveStatusText } from './system-text.js'

const normalizeStatusValue = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  const text = typeof value === 'string' ? value : String(value)
  return text.trim()
}

export const formatStatusText = (value: unknown): string => {
  const text = normalizeStatusValue(value)
  return text ? resolveStatusText(text) : ''
}
