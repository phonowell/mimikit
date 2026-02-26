import { appendHistory, readHistory } from './store.js'
import { appendTaskSystemMessage } from './task-events.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { TaskResult, UserInput } from '../types/index.js'

const summarizeResultOutput = (
  result: TaskResult,
  summaries?: Map<string, string>,
): string => {
  const summary = summaries?.get(result.taskId)?.trim()
  if (summary) return summary
  const compacted = result.output.replace(/\s+/g, ' ').trim()
  return compacted.length <= 280
    ? compacted
    : `${compacted.slice(0, 279).trimEnd()}…`
}

export const appendConsumedInputsToHistory = async (
  historyPath: string,
  inputs: UserInput[],
): Promise<number> => {
  const existingIds = new Set(
    (await readHistory(historyPath)).map((item) => item.id),
  )
  let consumed = 0
  for (const input of inputs) {
    if (existingIds.has(input.id)) {
      consumed += 1
      continue
    }
    await appendHistory(historyPath, { ...input })
    existingIds.add(input.id)
    consumed += 1
  }
  return consumed
}

export const appendConsumedResultsToHistory = async (
  historyPath: string,
  tasks: RuntimeState['tasks'],
  results: TaskResult[],
  summaries?: Map<string, string>,
): Promise<number> => {
  let consumed = 0
  for (const result of results) {
    const task = tasks.find((item) => item.id === result.taskId)
    if (!task || task.result) {
      consumed += 1
      continue
    }

    const resolvedCancel = result.cancel ?? task.cancel
    const appended =
      result.status === 'canceled'
        ? await appendTaskSystemMessage(historyPath, 'canceled', task, {
            createdAt: result.completedAt,
            ...(resolvedCancel ? { cancel: resolvedCancel } : {}),
          })
        : await appendTaskSystemMessage(historyPath, 'completed', task, {
            status: result.status,
            createdAt: result.completedAt,
          })

    if (!appended) break
    task.result = {
      ...result,
      output: summarizeResultOutput(result, summaries),
    }
    consumed += 1
  }
  return consumed
}
