import { readJson, writeJson } from '../fs/json.js'

import { withStoreLock } from './store-lock.js'

import type { PendingQuestion } from '../types/history.js'

export const readPendingQuestion = (
  path: string,
): Promise<PendingQuestion | null> =>
  readJson<PendingQuestion | null>(path, null)

export const writePendingQuestion = async (
  path: string,
  question: PendingQuestion | null,
): Promise<void> => {
  await withStoreLock(path, async () => {
    if (!question) {
      await writeJson(path, null)
      return
    }
    await writeJson(path, question)
  })
}
