import { resolveTaskResultSummary } from '../../work/shared/task-state.js'

import { appendHistory, readHistory } from './store.js'
import { appendTaskSystemMessage } from './task-events.js'

import type { TaskResult, UserInput } from '../../foundation/types/index.js'
import type {
  RuntimeTaskCollection,
  RuntimeTaskState,
} from '../../kernel/orchestrator/runtime-interfaces.js'

const summarizeResultOutput = (
  task: RuntimeTaskState,
  result: TaskResult,
  summaries?: Map<string, string>,
): string => {
  const summary = summaries?.get(result.taskId)?.trim()
  if (summary) return summary
  return resolveTaskResultSummary({
    task,
    result,
    maxChars: 280,
  })
}

const shouldIgnoreStaleResult = (
  task: RuntimeTaskState,
  result: TaskResult,
): boolean => {
  if (result.status !== 'partial') return false
  if (task.status !== (result.taskStatus ?? 'paused')) return true
  return Boolean(task.pausedAt && task.pausedAt !== result.completedAt)
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
  tasks: RuntimeTaskCollection,
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
    if (shouldIgnoreStaleResult(task, result)) {
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
            ...(result.taskStatus ? { taskStatus: result.taskStatus } : {}),
            ...(result.outcome ? { outcome: result.outcome } : {}),
            ...(result.stopReason ? { stopReason: result.stopReason } : {}),
            createdAt: result.completedAt,
          })

    if (!appended) break
    task.result = {
      ...result,
      output: summarizeResultOutput(task, result, summaries),
    }
    consumed += 1
  }
  return consumed
}
