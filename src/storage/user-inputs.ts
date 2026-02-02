import { appendJsonl, readJsonl, writeJsonl } from './jsonl.js'
import { withStoreLock } from './store-lock.js'

import type { UserInput } from '../types/user-input.js'

export const appendUserInputs = async (
  path: string,
  inputs: UserInput[],
): Promise<void> => {
  await appendJsonl(path, inputs)
}

export const readUserInputs = (path: string): Promise<UserInput[]> =>
  readJsonl<UserInput>(path)

export const hasUnprocessedUserInputs = async (
  path: string,
): Promise<boolean> => {
  const inputs = await readJsonl<UserInput>(path)
  return inputs.some((input) => !input.processedByThinker)
}

export const takeUnprocessedUserInputs = (path: string): Promise<UserInput[]> =>
  withStoreLock(path, async () => {
    const inputs = await readJsonl<UserInput>(path)
    const pending = inputs.filter((input) => !input.processedByThinker)
    if (pending.length === 0) return []
    const pendingIds = new Set(pending.map((input) => input.id))
    const next = inputs.map((input) =>
      pendingIds.has(input.id) ? { ...input, processedByThinker: true } : input,
    )
    await writeJsonl(path, next)
    return pending
  })
