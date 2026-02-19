export const PROVIDER_ERROR_CODES = [
  'provider_timeout',
  'provider_aborted',
  'provider_preflight_failed',
  'provider_circuit_open',
  'provider_transient_network',
  'provider_sdk_failure',
] as const

export type ProviderErrorCode = (typeof PROVIDER_ERROR_CODES)[number]

const PROVIDER_ERROR_CODE_SET = new Set<string>(PROVIDER_ERROR_CODES)

export const isProviderErrorCode = (
  value: unknown,
): value is ProviderErrorCode =>
  typeof value === 'string' && PROVIDER_ERROR_CODE_SET.has(value)

export class ProviderError extends Error {
  readonly code: ProviderErrorCode
  readonly retryable: boolean

  constructor(params: {
    code: ProviderErrorCode
    message: string
    retryable: boolean
  }) {
    super(params.message)
    this.name = 'ProviderError'
    this.code = params.code
    this.retryable = params.retryable
  }
}

export const readProviderErrorCode = (
  error: unknown,
): ProviderErrorCode | undefined => {
  if (error instanceof ProviderError) return error.code
  if (!error || typeof error !== 'object') return undefined
  const maybeCode = (error as Record<string, unknown>)['code']
  if (!isProviderErrorCode(maybeCode)) return undefined
  return maybeCode
}

export const isRetryableProviderError = (error: unknown): boolean => {
  if (error instanceof ProviderError) return error.retryable
  const code = readProviderErrorCode(error)
  if (!code) return false
  return code === 'provider_timeout' || code === 'provider_transient_network'
}
