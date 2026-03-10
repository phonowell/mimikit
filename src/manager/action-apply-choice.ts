import { resolveDefaultFocusId } from '../focus/index.js'
import { appendLog } from '../log/append.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import { putPendingUserChoice } from '../orchestrator/core/user-choice-state.js'
import { nowIso } from '../shared/utils.js'

import { parseAskUserChoiceAttrs } from './action-apply-schema.js'

import type { RuntimeState } from './runtime-adapter.js'
import type { Parsed } from '../actions/model/spec.js'

export const applyAskUserChoiceAction = async (
  runtime: RuntimeState,
  item: Parsed,
): Promise<void> => {
  const parsed = parseAskUserChoiceAttrs(item.attrs)
  if (!parsed) return
  const createdAt = nowIso()
  const focusId = parsed.focusId ?? resolveDefaultFocusId(runtime)
  putPendingUserChoice(runtime, {
    id: parsed.id,
    question: parsed.question,
    options: parsed.options,
    defaultOptionId: parsed.defaultOptionId,
    createdAt,
    focusId,
  })
  await persistRuntimeState(runtime)
  await appendLog(runtime.paths.log, {
    event: 'user_choice_requested',
    choiceId: parsed.id,
    optionCount: parsed.options.length,
    defaultOptionId: parsed.defaultOptionId,
    focusId,
  })
}
