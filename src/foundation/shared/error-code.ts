export const readErrorCode = (error: unknown): string | undefined => {
  if (!error || typeof error !== 'object' || !('code' in error))
    return undefined
  const { code } = error as { code?: unknown }
  if (typeof code === 'string' && code) return code
  if (typeof code === 'number') return String(code)
  return undefined
}
