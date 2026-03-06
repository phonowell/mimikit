import { appendMemoryRememberedSystemMessage } from '../history/memory-events.js'
import { rememberMemoryEntry } from '../memory/remember-entry.js'

import { resolveActionFocusId } from './action-apply-create.js'
import { rememberMemorySchema } from './action-apply-schema.js'

import type { Parsed } from '../actions/model/spec.js'
import type { RuntimeState } from '../orchestrator/core/runtime-state.js'

export const applyRememberMemoryAction = async (
  runtime: RuntimeState,
  item: Parsed,
): Promise<void> => {
  const parsed = rememberMemorySchema.safeParse(item.attrs)
  if (!parsed.success) return
  const payload = parsed.data
  const remembered = await rememberMemoryEntry(runtime.paths.memoryFile, {
    content: payload.content,
    ...(payload.category ? { category: payload.category } : {}),
    ...(payload.priority ? { priority: payload.priority } : {}),
    ...(payload.confidence !== undefined
      ? { confidence: payload.confidence }
      : {}),
    ...(payload.dedupe_key ? { dedupeKey: payload.dedupe_key } : {}),
    ...(payload.replace_policy
      ? { replacePolicy: payload.replace_policy }
      : {}),
    ...(payload.source ? { source: payload.source } : {}),
    ...(payload.max_chars !== undefined ? { maxChars: payload.max_chars } : {}),
  })
  const focusId = resolveActionFocusId(runtime, payload.focus_id)
  await appendMemoryRememberedSystemMessage(runtime.paths.history, focusId, {
    ...remembered,
    source: payload.source ?? 'explicit_user_request',
  })
}
