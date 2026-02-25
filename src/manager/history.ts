import { appendTaskSystemMessage } from '../orchestrator/read-model/task-history.js'
import { loadPromptTemplate } from '../prompts/prompt-loader.js'
import { formatSystemEventText } from '../shared/system-event.js'
import { nowIso } from '../shared/utils.js'
import { appendHistory, readHistory } from '../storage/history-jsonl.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type {
  ManagerActionFeedback,
  TaskResult,
  UserInput,
} from '../types/index.js'

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

export const appendManagerFallbackReply = async (
  paths: RuntimeState['paths'],
): Promise<void> => {
  const fallback = (
    await loadPromptTemplate('manager/system-fallback-reply.md')
  ).trim()
  if (!fallback)
    throw new Error('missing_prompt_template:manager/system-fallback-reply.md')
  const createdAt = nowIso()
  await appendHistory(paths.history, {
    id: `sys-${Date.now()}`,
    role: 'system',
    visibility: 'user',
    text: formatSystemEventText({
      summary: fallback,
      event: 'manager_fallback_reply',
      payload: {
        reply: fallback,
      },
    }),
    createdAt,
  })
}

const compactManagerErrorText = (value: string): string =>
  value.replace(/\s+/g, ' ').trim()

export const appendManagerErrorSystemMessage = async (
  paths: RuntimeState['paths'],
  error: string,
): Promise<void> => {
  const detail = compactManagerErrorText(error)
  const createdAt = nowIso()
  await appendHistory(paths.history, {
    id: `sys-manager-error-${Date.now()}`,
    role: 'system',
    visibility: 'all',
    text: formatSystemEventText({
      summary: detail ? `Manager failed: ${detail}` : 'Manager failed.',
      event: 'manager_error',
      payload: detail ? { error: detail } : {},
    }),
    createdAt,
  })
}

type ActionFeedbackEntry = {
  action: string
  error: string
  hint: string
  attempted?: string
}

const toActionFeedbackEntries = (
  feedback: ManagerActionFeedback[],
): ActionFeedbackEntry[] =>
  feedback
    .map((item) => {
      const action = item.action.replace(/\s+/g, ' ').trim()
      const error = item.error.replace(/\s+/g, ' ').trim()
      const hint = item.hint.replace(/\s+/g, ' ').trim()
      if (!action || !error || !hint) return null
      const attempted = item.attempted?.replace(/\s+/g, ' ').trim()
      return {
        action,
        error,
        hint,
        ...(attempted ? { attempted } : {}),
      }
    })
    .filter((item): item is ActionFeedbackEntry => Boolean(item))

const formatActionFeedbackSummary = (
  entries: ActionFeedbackEntry[],
): string => {
  if (entries.length === 0) return ''
  const header = `Received ${entries.length} action feedback item${
    entries.length === 1 ? '' : 's'
  }.`
  const details = entries.map(
    (item, index) =>
      `${index + 1}. Action "${item.action}" failed with "${item.error}". Suggested fix: ${item.hint}${
        item.attempted ? ` Attempted: ${item.attempted}.` : ''
      }`,
  )
  return [header, ...details].join('\n')
}

const formatActionFeedbackSystemText = (
  feedback: ManagerActionFeedback[],
): string => {
  const entries = toActionFeedbackEntries(feedback)
  if (entries.length === 0) return ''
  return formatSystemEventText({
    summary: formatActionFeedbackSummary(entries),
    event: 'action_feedback',
    payload: {
      count: entries.length,
      items: entries,
    },
  })
}

export const appendActionFeedbackSystemMessage = (
  historyPath: string,
  feedback: ManagerActionFeedback[],
): Promise<boolean> => {
  const text = formatActionFeedbackSystemText(feedback)
  if (!text) return Promise.resolve(false)
  return appendHistory(historyPath, {
    id: `sys-action-feedback-${Date.now()}`,
    role: 'system',
    visibility: 'all',
    text,
    createdAt: nowIso(),
  }).then(() => true)
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

    const appended =
      result.status === 'canceled'
        ? await appendTaskSystemMessage(historyPath, 'canceled', task, {
            createdAt: result.completedAt,
            ...((result.cancel ?? task.cancel)
              ? { cancel: result.cancel ?? task.cancel }
              : {}),
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
