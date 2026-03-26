import { nowIso } from '../../foundation/shared/utils.js'
import { persistRuntimeState } from '../../kernel/orchestrator/runtime-persistence.js'
import {
  notifyManagerLoop,
  notifyUiSignal,
} from '../../kernel/orchestrator/signals.js'

import { publishChoiceSelectionInput } from './user-choice-input.js'
import {
  isPendingUserChoiceExpired,
  removePendingUserChoice,
  resolvePendingUserChoiceDefaultOption,
  resolvePendingUserChoiceOption,
} from './user-choice-state.js'

import type {
  PendingUserChoice,
  UserChoiceOption,
  UserChoiceSelectionSource,
} from '../../foundation/types/index.js'
import type { OrchestratorRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

export type SelectPendingUserChoiceResult =
  | {
      ok: true
      choiceId: string
      optionId: string
      source: UserChoiceSelectionSource
    }
  | { ok: false; reason: 'not_found' | 'invalid_option' | 'expired' }

const commitSelection = async (params: {
  runtime: OrchestratorRuntime
  choice: PendingUserChoice
  option: UserChoiceOption
  source: UserChoiceSelectionSource
  selectedAt: string
}): Promise<SelectPendingUserChoiceResult> => {
  await publishChoiceSelectionInput(params)
  removePendingUserChoice(params.runtime, params.choice.id)
  await persistRuntimeState(params.runtime)
  return {
    ok: true,
    choiceId: params.choice.id,
    optionId: params.option.id,
    source: params.source,
  }
}

export const selectPendingUserChoice = async (params: {
  runtime: OrchestratorRuntime
  choiceId: string
  optionId: string
  source: UserChoiceSelectionSource
  selectedAt?: string
}): Promise<SelectPendingUserChoiceResult> => {
  const { runtime, choiceId, optionId, source } = params
  const choice = runtime.ui.pendingUserChoices.find(
    (item) => item.id === choiceId,
  )
  if (!choice) return { ok: false, reason: 'not_found' }

  const selectedAt = params.selectedAt ?? nowIso()
  const nowMs = Date.parse(selectedAt)
  if (
    source === 'user' &&
    Number.isFinite(nowMs) &&
    isPendingUserChoiceExpired(choice, Number(nowMs))
  ) {
    const defaultOption = resolvePendingUserChoiceDefaultOption(choice)
    if (defaultOption) {
      await commitSelection({
        runtime,
        choice,
        option: defaultOption,
        source: 'timeout',
        selectedAt,
      })
    } else {
      removePendingUserChoice(runtime, choice.id)
      await persistRuntimeState(runtime)
    }
    return { ok: false, reason: 'expired' }
  }

  const option = resolvePendingUserChoiceOption(choice, optionId)
  if (!option) return { ok: false, reason: 'invalid_option' }

  return commitSelection({
    runtime,
    choice,
    option,
    source,
    selectedAt,
  })
}

export const selectPendingUserChoiceFromUser = async (
  runtime: OrchestratorRuntime,
  choiceId: string,
  optionId: string,
): Promise<SelectPendingUserChoiceResult> => {
  const result = await selectPendingUserChoice({
    runtime,
    choiceId,
    optionId,
    source: 'user',
  })
  if (result.ok || result.reason === 'expired') {
    notifyUiSignal(runtime)
    notifyManagerLoop(runtime)
  }
  return result
}
