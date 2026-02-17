import { UI_TEXT } from '../system-text.js'

export const normalizeRole = (role) => {
  if (role === 'assistant') return 'agent'
  if (role === 'user') return 'user'
  if (role === 'system') return 'system'
  return 'unknown'
}

export const formatRoleLabel = (role) => {
  const normalized = normalizeRole(role)
  if (normalized === 'user') return 'You'
  if (normalized === 'agent') return 'Agent'
  if (normalized === 'system') return 'System'
  return UI_TEXT.quoteUnknown
}

const cleanText = (text) => String(text ?? '').replace(/\s+/g, ' ').trim()

export const formatQuotePreview = (text, maxLength = 120) => {
  const cleaned = cleanText(text)
  if (!cleaned) return ''
  const max = typeof maxLength === 'number' && maxLength > 0 ? Math.floor(maxLength) : 120
  return cleaned.length > max ? `${cleaned.slice(0, max)}...` : cleaned
}
