import { ProviderError } from '../../execution/providers/provider-error.js'

type ManagerAutoRetryMetaRecord = Record<PropertyKey, unknown>

const BYTE_STEP = 1_024
const TIMEOUT_STEP_MS = 2_500

export const MIN_MANAGER_TIMEOUT_MS = 60_000
export const MAX_MANAGER_TIMEOUT_MS = 120_000
export const MANAGER_PROVIDER = 'openai-responses' as const
const MANAGER_AUTO_RETRY_META_SYMBOL = Symbol.for(
  'mimikit.manager_auto_retry_meta',
)

export type ManagerAutoRetryMeta = {
  autoRetryAttempts: number
  autoRetryMaxAttempts: number
  autoRetryState: 'exhausted' | 'not_retryable'
  autoRetryStrategy: string
}

export const isManagerRetryableError = (error: unknown): boolean =>
  error instanceof ProviderError && error.retryable

export const attachManagerAutoRetryMeta = <TError extends Error>(
  error: TError,
  meta: ManagerAutoRetryMeta,
): TError => {
  Object.defineProperty(error, MANAGER_AUTO_RETRY_META_SYMBOL, {
    value: meta,
    configurable: true,
    enumerable: false,
    writable: false,
  })
  return error
}

export const readManagerAutoRetryMeta = (
  error: unknown,
): ManagerAutoRetryMeta | undefined => {
  if (!error || typeof error !== 'object') return undefined
  const meta = (error as ManagerAutoRetryMetaRecord)[
    MANAGER_AUTO_RETRY_META_SYMBOL
  ]
  if (!meta || typeof meta !== 'object') return undefined
  const record = meta as Record<string, unknown>
  const {
    autoRetryAttempts,
    autoRetryMaxAttempts,
    autoRetryState,
    autoRetryStrategy,
  } = record
  if (
    typeof autoRetryAttempts !== 'number' ||
    typeof autoRetryMaxAttempts !== 'number' ||
    (autoRetryState !== 'exhausted' && autoRetryState !== 'not_retryable') ||
    typeof autoRetryStrategy !== 'string'
  )
    return undefined
  return {
    autoRetryAttempts,
    autoRetryMaxAttempts,
    autoRetryState,
    autoRetryStrategy,
  }
}

export const resolveManagerTimeoutMs = (prompt: string): number => {
  const promptBytes = Buffer.byteLength(prompt, 'utf8')
  const stepCount = Math.ceil(promptBytes / BYTE_STEP)
  const computed = MIN_MANAGER_TIMEOUT_MS + stepCount * TIMEOUT_STEP_MS
  return Math.max(
    MIN_MANAGER_TIMEOUT_MS,
    Math.min(MAX_MANAGER_TIMEOUT_MS, computed),
  )
}
