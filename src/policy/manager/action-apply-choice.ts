import { newId, nowIso } from '../../foundation/shared/utils.js'
import { persistRuntimeState } from '../../kernel/orchestrator/runtime-persistence.js'
import { appendLog } from '../../persistence/log/append.js'
import { resolveDefaultFocusId } from '../../work/focus/index.js'
import { putPendingUserChoice } from '../../work/orchestrator/user-choice-state.js'

import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'
import type { Parsed } from '../actions/model/spec.js'

export const applyAskUserChoiceAction = async (
  runtime: ManagerRuntime,
  item: Parsed,
): Promise<void> => {
  if (item.type !== 'ask_user_choice') return
  const createdAt = nowIso()
  const focusId = resolveDefaultFocusId(runtime)
  const choiceId = `choice-${newId()}`
  putPendingUserChoice(runtime, {
    id: choiceId,
    question: item.question,
    options: item.options,
    defaultOptionId: item.default_option_id,
    createdAt,
    focusId,
  })
  await persistRuntimeState(runtime)
  await appendLog(runtime.paths.log, {
    event: 'user_choice_requested',
    choiceId,
    optionCount: item.options.length,
    defaultOptionId: item.default_option_id,
    focusId,
  })
}
