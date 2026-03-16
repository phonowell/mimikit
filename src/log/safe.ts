import { readErrorCode } from '../shared/error-code.js'
import { toErrorInfo } from '../shared/error-info.js'
import { type ErrorFallback, resolveErrorFallback } from '../shared/utils.js'

import { appendLog } from './append.js'

export type SafeOptions<T> = {
  logPath?: string
  meta?: Record<string, unknown>
  fallback?: ErrorFallback<T>
  ignoreCodes?: string[]
}

export type SafeLogOptions = Omit<SafeOptions<unknown>, 'fallback'>

let defaultLogPath: string | null = null

export const setDefaultLogPath = (path?: string | null): void => {
  if (typeof path !== 'string') {
    defaultLogPath = null
    return
  }
  const trimmed = path.trim()
  defaultLogPath = trimmed.length > 0 ? trimmed : null
}

export const logSafeError = async (
  context: string,
  error: unknown,
  options?: SafeLogOptions,
): Promise<void> => {
  const info = toErrorInfo(error)
  const payload = {
    event: 'error',
    context,
    error: info.message,
    ...(info.name ? { errorName: info.name } : {}),
    ...(info.stack ? { errorStack: info.stack } : {}),
    ...(options?.meta ? { meta: options.meta } : {}),
  }
  const logPath = options?.logPath ?? defaultLogPath
  if (logPath) {
    try {
      await appendLog(logPath, payload)
      return
    } catch (appendError) {
      console.error(`[safe] failed to append log for ${context}`, appendError)
    }
  }
  console.error(`[safe] ${context}`, payload)
}

export const safe = async <T>(
  context: string,
  fn: () => T | Promise<T>,
  options: SafeOptions<T> = {},
): Promise<T> => {
  try {
    return await fn()
  } catch (error) {
    const code = readErrorCode(error)
    const shouldIgnore =
      code && options.ignoreCodes ? options.ignoreCodes.includes(code) : false
    if (!shouldIgnore) await logSafeError(context, error, options)
    const fallback = resolveErrorFallback(options, error)
    if (fallback.handled) return fallback.value
    throw error
  }
}

export const safeOrUndefined = <T>(
  context: string,
  fn: () => T | Promise<T>,
  options: SafeLogOptions = {},
): Promise<T | undefined> =>
  safe<T | undefined>(context, fn, { ...options, fallback: undefined })

export const bestEffort = async (
  context: string,
  fn: () => unknown | Promise<unknown>,
  options: SafeLogOptions = {},
): Promise<void> => {
  await safeOrUndefined(context, fn, options)
}
