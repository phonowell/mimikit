import { GLOBAL_FOCUS_ID } from '../focus/index.js'
import { loadPromptTemplate } from '../prompts/prompt-loader.js'
import { formatSystemEventText } from '../shared/system-event.js'
import { nowIso } from '../shared/utils.js'
import { appendHistory } from './store.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { FocusId, ManagerActionFeedback } from '../types/index.js'

export const appendManagerFallbackReply = async (
  paths: RuntimeState['paths'],
  focusId: FocusId = GLOBAL_FOCUS_ID,
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
    focusId,
  })
}

const compactManagerErrorText = (value: string): string =>
  value.replace(/\s+/g, ' ').trim()

export const appendManagerErrorSystemMessage = async (
  paths: RuntimeState['paths'],
  error: string,
  focusId: FocusId = GLOBAL_FOCUS_ID,
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
    focusId,
  })
}

export const appendManagerCorrectionLimitSystemMessage = async (
  paths: RuntimeState['paths'],
  maxRounds: number,
  focusId: FocusId = GLOBAL_FOCUS_ID,
): Promise<void> => {
  const createdAt = nowIso()
  await appendHistory(paths.history, {
    id: `sys-manager-round-limit-${Date.now()}`,
    role: 'system',
    visibility: 'all',
    text: formatSystemEventText({
      summary: `Manager reached correction round limit (${maxRounds}). Returned best-effort answer without further actions.`,
      event: 'manager_round_limit',
      payload: { max_rounds: maxRounds },
    }),
    createdAt,
    focusId,
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
  focusId: FocusId = GLOBAL_FOCUS_ID,
): Promise<boolean> => {
  const text = formatActionFeedbackSystemText(feedback)
  if (!text) return Promise.resolve(false)
  return appendHistory(historyPath, {
    id: `sys-action-feedback-${Date.now()}`,
    role: 'system',
    visibility: 'all',
    text,
    createdAt: nowIso(),
    focusId,
  }).then(() => true)
}
