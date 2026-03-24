import { UI_TEXT } from '../system-text.js'

export const normalizeRole = (
  role: unknown,
): 'agent' | 'user' | 'system' | 'unknown' => {
  if (role === 'agent') return 'agent'
  if (role === 'user') return 'user'
  if (role === 'system') return 'system'
  return 'unknown'
}

export const formatRoleLabel = (role: unknown): string => {
  const normalized = normalizeRole(role)
  if (normalized === 'user') return 'You'
  if (normalized === 'agent') return 'Agent'
  if (normalized === 'system') return 'System'
  return UI_TEXT.quoteUnknown
}

const cleanText = (text: unknown): string =>
  String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()

export const formatQuotePreview = (text: unknown, maxLength = 120): string => {
  const cleaned = cleanText(text)
  if (!cleaned) return ''
  const max =
    typeof maxLength === 'number' && maxLength > 0 ? Math.floor(maxLength) : 120
  return cleaned.length > max ? `${cleaned.slice(0, max)}...` : cleaned
}
