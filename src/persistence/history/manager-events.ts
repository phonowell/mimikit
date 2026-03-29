import { renderPromptTemplate } from '../../foundation/prompting/format.js'
import { loadPromptTemplate } from '../../foundation/prompting/prompt-loader.js'
import { nowIso } from '../../foundation/shared/utils.js'
import { createSystemEventRecord } from '../../surface/shared/system-event.js'
import { GLOBAL_FOCUS_ID } from '../../work/focus/index.js'

import { appendHistory } from './store.js'

import type { FocusId } from '../../foundation/types/index.js'
import type { RuntimePathsState } from '../../kernel/orchestrator/runtime-interfaces.js'

type ManagerFallbackMeta = {
  sourceInputId?: string
  inputRetained?: boolean
  pendingResultCount?: number
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
  const fallbackTemplate = await loadPromptTemplate(
    'manager/system-fallback-reply.md',
  )
  const fallback = renderPromptTemplate(
    fallbackTemplate,
    {
      auto_retry_attempts: String(fallbackMeta?.autoRetryAttempts ?? 0),
      auto_retry_max_attempts: String(fallbackMeta?.autoRetryMaxAttempts ?? 0),
      auto_retry_state: fallbackMeta?.autoRetryState ?? 'not_retryable',
      auto_retry_strategy:
        fallbackMeta?.autoRetryStrategy ?? 'reuse_worker_retry_config',
      input_retained: fallbackMeta?.inputRetained ? 'true' : 'false',
      pending_result_count: String(fallbackMeta?.pendingResultCount ?? 0),
    },
    'manager/system-fallback-reply.md',
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
      ...(fallbackMeta?.inputRetained !== undefined
        ? { input_retained: fallbackMeta.inputRetained }
        : {}),
      ...(fallbackMeta?.pendingResultCount !== undefined
        ? { pending_result_count: fallbackMeta.pendingResultCount }
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
