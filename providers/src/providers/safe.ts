type SafeErrorInfo = {
  message: string
  name?: string
  stack?: string
}

export type SafeOptions<T> = {
  meta?: Record<string, unknown>
  ignoreCodes?: string[]
  fallback?: T | ((error: unknown) => T)
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

export const logSafeError = (context: string, error: unknown): void => {
  const info = normalizeError(error)
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
    if (Object.prototype.hasOwnProperty.call(options, 'fallback')) {
      const { fallback } = options
      if (typeof fallback === 'function')
        return (fallback as (err: unknown) => T)(error)
      return fallback as T
    }
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
