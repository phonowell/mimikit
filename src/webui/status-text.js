export const formatStatusText = (value) => {
  if (value == null) return ''
  const text = typeof value === 'string' ? value : String(value)
  if (!text) return ''
  return text.toUpperCase()
}
