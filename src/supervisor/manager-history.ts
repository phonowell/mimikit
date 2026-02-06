import { safe } from '../log/safe.js'
import { nowIso } from '../shared/utils.js'
import { appendHistory } from '../storage/jsonl.js'

import { appendTaskSystemMessage } from './task-history.js'

import type { RuntimeState } from './runtime.js'
import type { TaskResult, UserInput } from '../types/index.js'

export const appendFallbackReply = async (
  paths: RuntimeState['paths'],
): Promise<void> => {
  await appendHistory(paths.history, {
    id: `sys-${Date.now()}`,
    role: 'system',
    text: '系统暂时不可用，请稍后再试。',
    createdAt: nowIso(),
  })
}

export const appendConsumedInputsToHistory = async (
  historyPath: string,
  inputs: UserInput[],
): Promise<number> => {
  let consumed = 0
  for (const input of inputs) {
    const appended = await safe(
      'appendHistory: consumed_input',
      async () => {
        await appendHistory(historyPath, {
          id: input.id,
          role: 'user',
          text: input.text,
          createdAt: input.createdAt,
          ...(input.quote ? { quote: input.quote } : {}),
        })
        return true
      },
      { fallback: false, meta: { inputId: input.id } },
    )
    if (!appended) break
    consumed += 1
  }
  return consumed
}

export const appendConsumedResultsToHistory = async (
  historyPath: string,
  tasks: RuntimeState['tasks'],
  results: TaskResult[],
): Promise<number> => {
  let consumed = 0
  for (const result of results) {
    const task = tasks.find((item) => item.id === result.taskId)
    if (!task) {
      consumed += 1
      continue
    }
    if (task.result) {
      consumed += 1
      continue
    }
    const appended =
      result.status === 'canceled'
        ? await appendTaskSystemMessage(historyPath, 'canceled', task, {
            createdAt: result.completedAt,
          })
        : await appendTaskSystemMessage(historyPath, 'completed', task, {
            status: result.status,
            createdAt: result.completedAt,
          })
    if (!appended) break
    task.result = result
    consumed += 1
  }
  return consumed
}
