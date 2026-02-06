import { appendLog } from './append.js'

type SafeErrorInfo = {
  message: string
  name?: string
  stack?: string
}

export type SafeOptions<T> = {
  logPath?: string
  meta?: Record<string, unknown>
  fallback?: T | ((error: unknown) => T)
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

const trimStack = (stack?: string, lines = 6): string | undefined => {
  if (!stack) return undefined
  return stack.split(/\r?\n/).slice(0, lines).join('\n')
}

const normalizeError = (error: unknown): SafeErrorInfo => {
  if (error instanceof Error) {
    const info: SafeErrorInfo = {
      message: error.message,
      name: error.name,
    }
    const stack = trimStack(error.stack)
    if (stack) info.stack = stack
    return info
  }
  return { message: String(error) }
}

const getErrorCode = (error: unknown): string | undefined => {
  if (!error || typeof error !== 'object' || !('code' in error))
    return undefined
  const { code } = error as { code?: unknown }
  if (typeof code === 'string' && code) return code
  if (typeof code === 'number') return String(code)
  return undefined
}

export const logSafeError = async (
  context: string,
  error: unknown,
  options?: SafeLogOptions,
): Promise<void> => {
  const info = normalizeError(error)
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
    const code = getErrorCode(error)
    const shouldIgnore =
      code && options.ignoreCodes ? options.ignoreCodes.includes(code) : false
    if (!shouldIgnore) await logSafeError(context, error, options)
    if (Object.prototype.hasOwnProperty.call(options, 'fallback')) {
      const { fallback } = options
      if (typeof fallback === 'function')
        return (fallback as (err: unknown) => T)(error)
      return fallback as T
    }
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
