export function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString()
  } catch {
    return ''
  }
}

export function formatDateTime(iso) {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return ''
  }
}
