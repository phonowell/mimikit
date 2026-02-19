import { safe } from '../log/safe.js'
import { appendTaskSystemMessage } from '../orchestrator/read-model/task-history.js'
import { loadPromptTemplate } from '../prompts/prompt-loader.js'
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
  const maxChars = 280
  if (compacted.length <= maxChars) return compacted
  return `${compacted.slice(0, maxChars - 1).trimEnd()}…`
}

export const appendManagerFallbackReply = async (
  paths: RuntimeState['paths'],
): Promise<void> => {
  const fallback = (
    await loadPromptTemplate('manager/system-fallback-reply.md')
  ).trim()
  if (!fallback)
    throw new Error('missing_prompt_template:manager/system-fallback-reply.md')
  await appendHistory(paths.history, {
    id: `sys-${Date.now()}`,
    role: 'system',
    text: fallback,
    createdAt: nowIso(),
  })
}

const compactManagerErrorText = (value: string): string =>
  value.replace(/\s+/g, ' ').trim()

export const appendManagerErrorSystemMessage = async (
  paths: RuntimeState['paths'],
  error: string,
): Promise<void> => {
  const detail = compactManagerErrorText(error)
  const text = detail ? `Manager failed · ${detail}` : 'Manager failed'
  await appendHistory(paths.history, {
    id: `sys-manager-error-${Date.now()}`,
    role: 'system',
    text,
    createdAt: nowIso(),
  })
}

const compactActionFeedbackText = (value: string): string =>
  value.replace(/\s+/g, ' ').trim()

const formatActionFeedbackSystemText = (
  feedback: ManagerActionFeedback[],
): string => {
  const details = feedback
    .map((item, index) => {
      const action = compactActionFeedbackText(item.action)
      const error = compactActionFeedbackText(item.error)
      const hint = compactActionFeedbackText(item.hint)
      if (!action || !error || !hint) return null
      return `${index + 1}. action=${action} error=${error} hint=${hint}`
    })
    .filter((line): line is string => Boolean(line))
  if (details.length === 0) return ''
  return ['M:action_feedback', ...details].join('\n')
}

export const appendActionFeedbackSystemMessage = (
  historyPath: string,
  feedback: ManagerActionFeedback[],
): Promise<boolean> => {
  const text = formatActionFeedbackSystemText(feedback)
  if (!text) return Promise.resolve(false)
  return safe(
    'appendHistory: manager_action_feedback',
    async () => {
      await appendHistory(historyPath, {
        id: `sys-action-feedback-${Date.now()}`,
        role: 'system',
        text,
        createdAt: nowIso(),
      })
      return true
    },
    {
      fallback: false,
      meta: {
        count: feedback.length,
        names: feedback.map((item) => item.action),
        errors: feedback.map((item) => item.error),
      },
    },
  )
}

export const appendConsumedInputsToHistory = async (
  historyPath: string,
  inputs: UserInput[],
): Promise<number> => {
  const existing = await readHistory(historyPath)
  const existingIds = new Set(existing.map((item) => item.id))
  let consumed = 0
  for (const input of inputs) {
    if (existingIds.has(input.id)) {
      consumed += 1
      continue
    }
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
    if (!task) {
      consumed += 1
      continue
    }
    if (task.result) {
      consumed += 1
      continue
    }
    let appended = false
    if (result.status === 'canceled') {
      const cancel = result.cancel ?? task.cancel
      appended = await appendTaskSystemMessage(historyPath, 'canceled', task, {
        createdAt: result.completedAt,
        ...(cancel ? { cancel } : {}),
      })
    } else {
      appended = await appendTaskSystemMessage(historyPath, 'completed', task, {
        status: result.status,
        createdAt: result.completedAt,
      })
    }
    if (!appended) break
    task.result = {
      ...result,
      output: summarizeResultOutput(result, summaries),
    }
    consumed += 1
  }
  return consumed
}
