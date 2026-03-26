import { nowIso } from '../../foundation/shared/utils.js'
import { persistRuntimeState } from '../../kernel/orchestrator/runtime-persistence.js'

import { publishChoiceSkippedInput } from './user-choice-input.js'
import { selectPendingUserChoice } from './user-choice-select.js'
import {
  clonePendingUserChoices,
  isPendingUserChoiceExpired,
  removePendingUserChoice,
  resolvePendingUserChoiceDefaultOption,
} from './user-choice-state.js'

import type { OrchestratorRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'
export {
  selectPendingUserChoice,
  selectPendingUserChoiceFromUser,
} from './user-choice-select.js'
export type { SelectPendingUserChoiceResult } from './user-choice-select.js'

export const cancelPendingUserChoiceByUserInput = async (params: {
  runtime: OrchestratorRuntime
  triggerInputId: string
  createdAt?: string
}): Promise<boolean> => {
  const { runtime, triggerInputId } = params
  const choices = clonePendingUserChoices(runtime.ui.pendingUserChoices)
  if (choices.length === 0) return false
  const canceledAt = params.createdAt ?? nowIso()
  runtime.ui.pendingUserChoices = []
  for (const choice of choices) {
    await publishChoiceSkippedInput({
      runtime,
      choice,
      canceledAt,
      triggerInputId,
    })
  }
  await persistRuntimeState(runtime)
  return true
}

export const resolvePendingUserChoiceTimeout = async (
  runtime: OrchestratorRuntime,
  nowMs: number = Date.now(),
): Promise<boolean> => {
  const expiredChoices = runtime.ui.pendingUserChoices.filter((choice) =>
    isPendingUserChoiceExpired(choice, nowMs),
  )
  if (expiredChoices.length === 0) return false

  let changed = false
  const selectedAt = new Date(nowMs).toISOString()
  for (const choice of expiredChoices) {
    const defaultOption = resolvePendingUserChoiceDefaultOption(choice)
    if (!defaultOption) {
      changed = removePendingUserChoice(runtime, choice.id) !== null || changed
      continue
    }
    const result = await selectPendingUserChoice({
      runtime,
      choiceId: choice.id,
      optionId: defaultOption.id,
      source: 'timeout',
      selectedAt,
    })
    changed = result.ok || changed
  }
  return changed
}
