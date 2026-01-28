export const isErrnoException = (
  error: unknown,
): error is NodeJS.ErrnoException => error instanceof Error && 'code' in error

export const formatError = (error: unknown): string => {
  if (error instanceof Error) return error.stack ?? error.message

  return String(error)
}
