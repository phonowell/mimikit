import { toErrorInfo } from '../../foundation/shared/error-info.js'
import {
  type ErrorFallback,
  resolveErrorFallback,
} from '../../foundation/shared/utils.js'

export type SafeOptions<T> = {
  meta?: Record<string, unknown>
  ignoreCodes?: string[]
  fallback?: ErrorFallback<T>
}

export const logSafeError = (context: string, error: unknown): void => {
  const info = toErrorInfo(error)
  const payload = {
    event: 'error',
    context,
    error: info.message,
    ...(info.name ? { errorName: info.name } : {}),
    ...(info.stack ? { errorStack: info.stack } : {}),
  }
  console.error(`[provider-safe] ${context}`, payload)
}

export const safe = async <T>(
  _context: string,
  fn: () => T | Promise<T>,
  options: SafeOptions<T> = {},
): Promise<T> => {
  try {
    return await fn()
  } catch (error) {
    const fallback = resolveErrorFallback(options, error)
    if (fallback.handled) return fallback.value
    throw error
  }
}

export const bestEffort = async (
  context: string,
  fn: () => unknown | Promise<unknown>,
): Promise<void> => {
  try {
    await fn()
  } catch (error) {
    logSafeError(context, error)
  }
}
