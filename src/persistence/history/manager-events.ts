import { loadPromptTemplate } from '../../foundation/prompting/prompt-loader.js'
import { nowIso } from '../../foundation/shared/utils.js'
import { createSystemEventRecord } from '../../surface/shared/system-event.js'
import { GLOBAL_FOCUS_ID } from '../../work/focus/index.js'

import { appendHistory } from './store.js'

import type {
  FocusId,
  ManagerActionFeedback,
} from '../../foundation/types/index.js'
import type { RuntimePathsState } from '../../kernel/orchestrator/runtime-interfaces.js'

type ManagerFallbackMeta = {
  sourceInputId?: string
  autoRetryAttempts: number
  autoRetryMaxAttempts: number
  autoRetryState: 'exhausted' | 'not_retryable'
  autoRetryStrategy: string
}

export const appendManagerFallbackReply = async (
  paths: RuntimePathsState['paths'],
  focusId: FocusId = GLOBAL_FOCUS_ID,
  fallbackMeta?: ManagerFallbackMeta,
): Promise<string> => {
  const fallback = (
    await loadPromptTemplate('manager/system-fallback-reply.md')
  ).trim()
  if (!fallback)
    throw new Error('missing_prompt_template:manager/system-fallback-reply.md')
  const createdAt = nowIso()
  const eventRecord = createSystemEventRecord({
    summary: fallback,
    event: 'manager_fallback_reply',
    payload: {
      reply: fallback,
      ...(fallbackMeta?.sourceInputId
        ? { source_input_id: fallbackMeta.sourceInputId }
        : {}),
      ...(fallbackMeta
        ? {
            auto_retry_attempts: fallbackMeta.autoRetryAttempts,
            auto_retry_max_attempts: fallbackMeta.autoRetryMaxAttempts,
            auto_retry_state: fallbackMeta.autoRetryState,
            auto_retry_strategy: fallbackMeta.autoRetryStrategy,
          }
        : {}),
    },
  })
  await appendHistory(paths.history, {
    id: `sys-${Date.now()}`,
    role: 'system',
    visibility: 'user',
    ...eventRecord,
    createdAt,
    focusId,
  })
  return fallback
}

const compactManagerErrorText = (value: string): string =>
  value.replace(/\s+/g, ' ').trim()

export const appendManagerErrorSystemMessage = async (
  paths: RuntimePathsState['paths'],
  error: string,
  focusId: FocusId = GLOBAL_FOCUS_ID,
): Promise<void> => {
  const detail = compactManagerErrorText(error)
  const createdAt = nowIso()
  const eventRecord = createSystemEventRecord({
    summary: detail ? `Manager failed: ${detail}` : 'Manager failed.',
    event: 'manager_error',
    payload: detail ? { error: detail } : {},
  })
  await appendHistory(paths.history, {
    id: `sys-manager-error-${Date.now()}`,
    role: 'system',
    visibility: 'all',
    ...eventRecord,
    createdAt,
    focusId,
  })
}

export const appendManagerCorrectionLimitSystemMessage = async (
  paths: RuntimePathsState['paths'],
  maxRounds: number,
  focusId: FocusId = GLOBAL_FOCUS_ID,
): Promise<void> => {
  const createdAt = nowIso()
  const eventRecord = createSystemEventRecord({
    summary: `Manager reached correction round limit (${maxRounds}). Returned best-effort answer without further actions.`,
    event: 'manager_round_limit',
    payload: { max_rounds: maxRounds },
  })
  await appendHistory(paths.history, {
    id: `sys-manager-round-limit-${Date.now()}`,
    role: 'system',
    visibility: 'all',
    ...eventRecord,
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
  const header = `Received ${entries.length} action feedback item${entries.length === 1 ? '' : 's'}.`
  const details = entries.map(
    (item, index) =>
      `${index + 1}. Action "${item.action}" failed with "${item.error}". Suggested fix: ${item.hint}${item.attempted ? ` Attempted: ${item.attempted}.` : ''}`,
  )
  return [header, ...details].join('\n')
}

const createActionFeedbackEventRecord = (
  feedback: ManagerActionFeedback[],
): ReturnType<typeof createSystemEventRecord> | null => {
  const entries = toActionFeedbackEntries(feedback)
  if (entries.length === 0) return null
  return createSystemEventRecord({
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
  const eventRecord = createActionFeedbackEventRecord(feedback)
  if (!eventRecord) return Promise.resolve(false)
  return appendHistory(historyPath, {
    id: `sys-action-feedback-${Date.now()}`,
    role: 'system',
    visibility: 'all',
    ...eventRecord,
    createdAt: nowIso(),
    focusId,
  }).then(() => true)
}
