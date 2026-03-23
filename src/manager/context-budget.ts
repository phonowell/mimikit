import { hasSystemEvent } from '../shared/system-event.js'

import type { PromptSectionLimits } from '../config.js'
import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type {
  ManagerWakeProfile,
  TaskResult,
  UserInput,
} from '../types/index.js'

const MIN_PROMPT_SECTION_BYTES = 512

export type ManagerContextBudgetDecision = {
  policy: 'fixed'
  wakeProfile: ManagerWakeProfile
  inputCount: number
  resultCount: number
  activeFocusCount: number
  promptSectionLimits: PromptSectionLimits
}

export const resolveWakeProfile = (
  inputs: UserInput[],
  results: TaskResult[],
): ManagerWakeProfile => {
  const hasUserInput = inputs.some((item) => item.role === 'user')
  const hasTaskResult = results.length > 0
  const hasTriggerWake = inputs.some((item) =>
    hasSystemEvent(item, 'trigger_fire'),
  )
  const hasCapacityWake = inputs.some((item) =>
    hasSystemEvent(item, 'worker_slot_freed'),
  )
  const activeKinds = [
    hasUserInput,
    hasTaskResult,
    hasTriggerWake,
    hasCapacityWake,
  ].filter(Boolean).length
  if (activeKinds !== 1) return 'mixed'
  if (hasUserInput) return 'user_input'
  if (hasTaskResult) return 'task_result'
  if (hasTriggerWake) return 'trigger'
  return 'capacity'
}

const countActiveFocuses = (runtime: RuntimeState): number =>
  runtime.focuses.filter((focus) => focus.status === 'active').length

export const normalizePromptSectionLimits = (
  base: PromptSectionLimits,
): PromptSectionLimits =>
  Object.fromEntries(
    Object.entries(base).map(([key, value]) => [
      key,
      Math.max(MIN_PROMPT_SECTION_BYTES, Math.floor(value)),
    ]),
  ) as PromptSectionLimits

export const resolveManagerContextBudgetDecision = (params: {
  runtime: RuntimeState
  inputs: UserInput[]
  results: TaskResult[]
}): ManagerContextBudgetDecision => ({
  policy: 'fixed',
  wakeProfile: resolveWakeProfile(params.inputs, params.results),
  inputCount: params.inputs.length,
  resultCount: params.results.length,
  activeFocusCount: countActiveFocuses(params.runtime),
  promptSectionLimits: normalizePromptSectionLimits(
    params.runtime.config.manager.promptSections,
  ),
})
