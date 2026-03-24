import { resumeTask } from '../../execution/worker/resume-task.js'
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
import type { RuntimeState } from '../../kernel/orchestrator/runtime-state.js'

export type UserChoiceEffectResult =
  | { type: 'resume_task'; taskId: string; ok: true; status: 'pending' }
  | {
      type: 'resume_task'
      taskId: string
      ok: false
      status: 'not_found' | 'already_done' | 'not_paused' | 'invalid'
    }

export type SelectPendingUserChoiceResult =
  | {
      ok: true
      choiceId: string
      optionId: string
      source: UserChoiceSelectionSource
      effect?: UserChoiceEffectResult
    }
  | { ok: false; reason: 'not_found' | 'invalid_option' | 'expired' }

const applyChoiceEffect = async (params: {
  runtime: RuntimeState
  choice: PendingUserChoice
  option: UserChoiceOption
}): Promise<UserChoiceEffectResult | undefined> => {
  const { effect } = params.choice
  if (effect?.optionId !== params.option.id) return undefined
  const result = await resumeTask(params.runtime, effect.taskId, {
    source: 'user',
    ...(effect.reason ? { reason: effect.reason } : {}),
  })
  if (result.status === 'pending') {
    return {
      type: effect.type,
      taskId: effect.taskId,
      ok: true,
      status: 'pending',
    }
  }
  return {
    type: effect.type,
    taskId: effect.taskId,
    ok: false,
    status: result.status,
  }
}

const commitSelection = async (params: {
  runtime: RuntimeState
  choice: PendingUserChoice
  option: UserChoiceOption
  source: UserChoiceSelectionSource
  selectedAt: string
}): Promise<SelectPendingUserChoiceResult> => {
  const effectResult = await applyChoiceEffect(params)
  await publishChoiceSelectionInput({
    ...params,
    ...(effectResult ? { effectResult } : {}),
  })
  removePendingUserChoice(params.runtime, params.choice.id)
  await persistRuntimeState(params.runtime)
  return {
    ok: true,
    choiceId: params.choice.id,
    optionId: params.option.id,
    source: params.source,
    ...(effectResult ? { effect: effectResult } : {}),
  }
}

export const selectPendingUserChoice = async (params: {
  runtime: RuntimeState
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
  runtime: RuntimeState,
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
