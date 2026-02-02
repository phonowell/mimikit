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
