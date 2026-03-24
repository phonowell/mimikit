import { nowIso } from '../../foundation/shared/utils.js'
import { persistRuntimeState } from '../../kernel/orchestrator/runtime-persistence.js'
import { appendLog } from '../../persistence/log/append.js'
import { resolveDefaultFocusId } from '../../work/focus/index.js'
import { putPendingUserChoice } from '../../work/orchestrator/user-choice-state.js'

import { parseAskUserChoiceAttrs } from './action-apply-schema.js'

import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'
import type { Parsed } from '../actions/model/spec.js'

export const applyAskUserChoiceAction = async (
  runtime: ManagerRuntime,
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
