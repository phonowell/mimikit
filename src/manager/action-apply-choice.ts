import { resolveDefaultFocusId } from '../focus/index.js'
import { appendLog } from '../log/append.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import { USER_CHOICE_TIMEOUT_MS } from '../orchestrator/core/user-choice.js'
import { nowIso } from '../shared/utils.js'

import { parseAskUserChoiceAttrs } from './action-apply-schema.js'

import type { RuntimeState } from './runtime-adapter.js'
import type { Parsed } from '../actions/model/spec.js'

const resolveExpiresAt = (createdAtIso: string): string => {
  const createdAtMs = Date.parse(createdAtIso)
  if (!Number.isFinite(createdAtMs)) return new Date().toISOString()
  return new Date(createdAtMs + USER_CHOICE_TIMEOUT_MS).toISOString()
}

export const applyAskUserChoiceAction = async (
  runtime: RuntimeState,
  item: Parsed,
): Promise<void> => {
  const parsed = parseAskUserChoiceAttrs(item.attrs)
  if (!parsed) return
  const createdAt = nowIso()
  const focusId = parsed.focusId ?? resolveDefaultFocusId(runtime)
  runtime.ui.pendingUserChoice = {
    id: parsed.id,
    question: parsed.question,
    options: parsed.options,
    defaultOptionId: parsed.defaultOptionId,
    createdAt,
    expiresAt: resolveExpiresAt(createdAt),
    focusId,
  }
  await persistRuntimeState(runtime)
  await appendLog(runtime.paths.log, {
    event: 'user_choice_requested',
    choiceId: parsed.id,
    optionCount: parsed.options.length,
    defaultOptionId: parsed.defaultOptionId,
    focusId,
  })
}
