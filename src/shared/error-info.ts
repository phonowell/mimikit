export type ErrorInfo = {
  message: string
  name?: string
  stack?: string
}

const trimStack = (stack?: string, lines = 6): string | undefined => {
  if (!stack) return undefined
  return stack.split(/\r?\n/).slice(0, lines).join('\n')
}

/** Normalizes an unknown error into serializable message, name, and trimmed stack fields. */
export const toErrorInfo = (error: unknown, stackLines = 6): ErrorInfo => {
  if (error instanceof Error) {
    const info: ErrorInfo = {
      message: error.message,
      name: error.name,
    }
    const stack = trimStack(error.stack, stackLines)
    if (stack) info.stack = stack
    return info
  }
  return { message: String(error) }
}
