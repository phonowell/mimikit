import { AbortError } from 'p-retry'

export const isAbortLikeError = (error: unknown): boolean => {
  if (error instanceof AbortError) return true
  if (!(error instanceof Error)) return false
  return error.name === 'AbortError' || /aborted|canceled/i.test(error.message)
}
