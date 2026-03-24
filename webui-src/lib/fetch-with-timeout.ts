const DEFAULT_TIMEOUT_MS = 10_000

const normalizeTimeoutMs = (value: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
    return DEFAULT_TIMEOUT_MS
  return Math.floor(value)
}

export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, Math.max(0, ms))
  })

export const fetchWithTimeout = async (
  url: RequestInfo | URL,
  options: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> => {
  const timeout = normalizeTimeoutMs(timeoutMs)
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeout)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    window.clearTimeout(timer)
  }
}
