import type { Result } from '../model/result.js'

export const safeRun = async (
  handler: () => Promise<Result>,
): Promise<Result> => {
  try {
    return await handler()
  } catch (error) {
    return {
      ok: false,
      output: '',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
