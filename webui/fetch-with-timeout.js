const DEFAULT_TIMEOUT_MS = 10000

const normalizeTimeoutMs = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) 
    return DEFAULT_TIMEOUT_MS
  
  return Math.floor(value)
}

export const delay = (ms) =>
  new Promise((resolve) => {
    window.setTimeout(resolve, Math.max(0, ms))
  })

export const fetchWithTimeout = async (url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  const timeout = normalizeTimeoutMs(timeoutMs)
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeout)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    window.clearTimeout(timer)
  }
}
