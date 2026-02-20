type ProviderErrorCode =
  | 'provider_timeout'
  | 'provider_aborted'
  | 'provider_preflight_failed'
  | 'provider_circuit_open'
  | 'provider_transient_network'
  | 'provider_sdk_failure'

const PROVIDER_ERROR_CODE_SET = new Set<ProviderErrorCode>([
  'provider_timeout',
  'provider_aborted',
  'provider_preflight_failed',
  'provider_circuit_open',
  'provider_transient_network',
  'provider_sdk_failure',
])

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

const providerTag = (providerId: string): string => `[provider:${providerId}]`

const normalizeProviderErrorMessage = (params: {
  providerId: string
  message: string
  label: string
}): string => {
  const normalized = params.message.trim()
  const prefix = providerTag(params.providerId)
  if (normalized.startsWith(prefix)) return normalized
  return `${prefix} ${params.label}: ${normalized}`
}

export const buildProviderTimeoutError = (
  providerId: string,
  timeoutMs: number,
): ProviderError =>
  new ProviderError({
    code: 'provider_timeout',
    message: `${providerTag(providerId)} timed out after ${timeoutMs}ms`,
    retryable: true,
  })

export const buildProviderAbortedError = (providerId: string): ProviderError =>
  new ProviderError({
    code: 'provider_aborted',
    message: `${providerTag(providerId)} aborted`,
    retryable: false,
  })

export const buildProviderSdkError = (params: {
  providerId: string
  message: string
  transient: boolean
}): ProviderError =>
  new ProviderError({
    code: params.transient
      ? 'provider_transient_network'
      : 'provider_sdk_failure',
    message: normalizeProviderErrorMessage({
      providerId: params.providerId,
      message: params.message,
      label: 'sdk run failed',
    }),
    retryable: params.transient,
  })

export const buildProviderPreflightError = (params: {
  providerId: string
  message: string
}): ProviderError =>
  new ProviderError({
    code: 'provider_preflight_failed',
    message: normalizeProviderErrorMessage({
      providerId: params.providerId,
      message: params.message,
      label: 'preflight failed',
    }),
    retryable: false,
  })

export const buildProviderCircuitOpenError = (
  providerId: string,
): ProviderError =>
  new ProviderError({
    code: 'provider_circuit_open',
    message: `${providerTag(providerId)} circuit is open due to consecutive failures`,
    retryable: false,
  })

export const readProviderErrorCode = (
  error: unknown,
): ProviderErrorCode | undefined => {
  if (error instanceof ProviderError) return error.code
  if (!error || typeof error !== 'object') return undefined
  const maybeCode = (error as Record<string, unknown>)['code']
  if (typeof maybeCode !== 'string') return undefined
  return PROVIDER_ERROR_CODE_SET.has(maybeCode as ProviderErrorCode)
    ? (maybeCode as ProviderErrorCode)
    : undefined
}

export const isRetryableProviderError = (error: unknown): boolean => {
  if (error instanceof ProviderError) return error.retryable
  const code = readProviderErrorCode(error)
  if (!code) return false
  return code === 'provider_timeout' || code === 'provider_transient_network'
}

const TRANSIENT_PROVIDER_MESSAGE_PATTERNS = [
  /fetch failed/i,
  /socket hang up/i,
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /EAI_AGAIN/i,
  /ETIMEDOUT/i,
  /timed out/i,
  /network/i,
]

export const isTransientProviderMessage = (message: string): boolean =>
  TRANSIENT_PROVIDER_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))

export const isTransientProviderFailure = (error: unknown): boolean => {
  if (isRetryableProviderError(error)) return true
  const message = error instanceof Error ? error.message : String(error)
  return isTransientProviderMessage(message)
}
