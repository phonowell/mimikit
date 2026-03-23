import { appendLog } from '../log/append.js'

import { resolveManagerActionSurface } from './action-surface.js'
import { collectConfirmedRunTaskChoiceIds } from './run-task-confirmation.js'

import type { SupplementalEvidenceSource } from './action-intent-evidence.js'
import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type {
  ManagerActionFeedback,
  ManagerWakeProfile,
  TaskPlanStatus,
  TaskStatus,
  TokenUsage,
  UserInput,
} from '../types/index.js'

export type ManagerRoundExtra = {
  actionFeedback?: ManagerActionFeedback[]
}
export const hasNoFollowupRequests = (params: {
  feedbackCount: number
}): boolean => {
  const { feedbackCount } = params
  return feedbackCount === 0
}

export const buildActionFeedbackContext = (params: {
  runtime: RuntimeState
  allowAskUserChoice: boolean
  resultTaskIds: Set<string>
  wakeProfile: ManagerWakeProfile
  inputs?: UserInput[]
}): {
  taskStatusById: Map<string, TaskStatus>
  taskById: Map<string, RuntimeState['tasks'][number]>
  planStatusById: Map<string, TaskPlanStatus>
  resultTaskIds: Set<string>
  allowAskUserChoice: boolean
  confirmedRunTaskChoiceIds: Set<string>
  wakeProfile: ManagerWakeProfile
  allowedActions: Set<string>
  inputs: UserInput[]
  supplementalEvidenceSources: Set<SupplementalEvidenceSource>
} => {
  const { runtime, allowAskUserChoice, resultTaskIds, wakeProfile, inputs } =
    params
  const currentInputs = inputs ?? runtime.session.inflightInputs
  const confirmedRunTaskChoiceIds =
    collectConfirmedRunTaskChoiceIds(currentInputs)
  const actionSurface = resolveManagerActionSurface(wakeProfile)
  const supplementalEvidenceSources = new Set<SupplementalEvidenceSource>()
  if (resultTaskIds.size > 0) supplementalEvidenceSources.add('task_result')
  return {
    taskStatusById: new Map(
      runtime.tasks.map((task) => [task.id, task.status]),
    ),
    taskById: new Map(runtime.tasks.map((task) => [task.id, task])),
    planStatusById: new Map(
      runtime.taskPlans.map((plan) => [plan.id, plan.status]),
    ),
    resultTaskIds,
    allowAskUserChoice,
    confirmedRunTaskChoiceIds,
    wakeProfile,
    allowedActions: actionSurface.actionNames,
    inputs: currentInputs,
    supplementalEvidenceSources,
  }
}

export const logManagerBatchStart = (
  runtime: RuntimeState,
  inputIds: string[],
  resultIds: string[],
): Promise<void> =>
  appendLog(runtime.paths.log, {
    event: 'manager_start',
    inputCount: inputIds.length,
    resultCount: resultIds.length,
    inputIds,
    resultIds,
  })

export const buildRoundLimitResult = (params: {
  text: string
  elapsedMs: number
  usage?: TokenUsage
}): {
  parsed: { text: string; actions: [] }
  elapsedMs: number
  usage?: TokenUsage
  roundLimitReached: true
} => ({
  parsed: {
    text: params.text,
    actions: [],
  },
  elapsedMs: params.elapsedMs,
  ...(params.usage ? { usage: params.usage } : {}),
  roundLimitReached: true,
})

export const buildBatchSuccessResult = <
  TParsed extends {
    text: string
    actions: unknown[]
  },
>(params: {
  parsed: TParsed
  elapsedMs: number
  usage?: TokenUsage
}): {
  parsed: TParsed
  elapsedMs: number
  usage?: TokenUsage
} => ({
  parsed: params.parsed,
  elapsedMs: params.elapsedMs,
  ...(params.usage ? { usage: params.usage } : {}),
})
