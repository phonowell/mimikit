const PROVIDER_THREAD_ID_SYMBOL = Symbol.for('mimikit.provider_thread_id')

const normalizeThreadId = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

const asRecord = (value: unknown): Record<PropertyKey, unknown> | undefined =>
  typeof value === 'object' && value
    ? (value as Record<PropertyKey, unknown>)
    : undefined

export const attachProviderThreadId = <TError extends Error>(
  error: TError,
  threadId: string | null | undefined,
): TError => {
  const normalized = normalizeThreadId(threadId)
  if (!normalized) return error
  Object.defineProperty(error, PROVIDER_THREAD_ID_SYMBOL, {
    value: normalized,
    configurable: true,
    enumerable: false,
    writable: false,
  })
  return error
}

export const readProviderThreadId = (error: unknown): string | undefined => {
  const record = asRecord(error)
  if (!record) return undefined
  return (
    normalizeThreadId(record[PROVIDER_THREAD_ID_SYMBOL]) ??
    normalizeThreadId(record.threadId)
  )
}
