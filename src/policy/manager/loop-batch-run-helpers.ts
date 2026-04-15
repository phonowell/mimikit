import { appendLog } from '../../persistence/log/append.js'
import { resolveDefaultFocusId } from '../../work/focus/state.js'

import { canScheduleManagerRestart } from './restart-runtime.js'

import type {
  ManagerActionFeedback,
  ManagerWakeProfile,
  TaskPlanStatus,
  TaskStatus,
  TokenUsage,
  UserInput,
} from '../../foundation/types/index.js'
import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

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
  runtime: ManagerRuntime
  allowAskUserChoice: boolean
  resultTaskIds: Set<string>
  wakeProfile: ManagerWakeProfile
  defaultFocusId?: string
  inputs?: UserInput[]
}): {
  stateDir: string
  taskStatusById: Map<string, TaskStatus>
  taskById: Map<string, ManagerRuntime['domain']['tasks'][number]>
  planById: Map<string, ManagerRuntime['domain']['taskPlans'][number]>
  planStatusById: Map<string, TaskPlanStatus>
  resultTaskIds: Set<string>
  allowAskUserChoice: boolean
  wakeProfile: ManagerWakeProfile
  inputs: UserInput[]
  restartRuntimeAvailable: boolean
  restartRuntimeScheduled: boolean
  restartRuntimeBusy: boolean
  defaultFocusId: string
} => {
  const {
    runtime,
    allowAskUserChoice,
    resultTaskIds,
    wakeProfile,
    defaultFocusId,
    inputs,
  } = params
  const currentInputs = inputs ?? runtime.process.session.inflightInputs
  return {
    stateDir: runtime.config.workDir,
    taskStatusById: new Map(
      runtime.domain.tasks.map((task) => [task.id, task.status]),
    ),
    taskById: new Map(runtime.domain.tasks.map((task) => [task.id, task])),
    planById: new Map(runtime.domain.taskPlans.map((plan) => [plan.id, plan])),
    planStatusById: new Map(
      runtime.domain.taskPlans.map((plan) => [plan.id, plan.status]),
    ),
    resultTaskIds,
    allowAskUserChoice,
    wakeProfile,
    inputs: currentInputs,
    restartRuntimeAvailable: runtime.process.session.requestExit !== undefined,
    restartRuntimeScheduled: runtime.process.session.restartScheduled,
    restartRuntimeBusy: !canScheduleManagerRestart(runtime),
    defaultFocusId: defaultFocusId ?? resolveDefaultFocusId(runtime),
  }
}

export const logManagerBatchStart = (
  runtime: ManagerRuntime,
  batchId: string,
  inputIds: string[],
  resultIds: string[],
): Promise<void> =>
  appendLog(runtime.paths.log, {
    event: 'manager_start',
    batchId,
    inputCount: inputIds.length,
    resultCount: resultIds.length,
    inputIds,
    resultIds,
  })

export const buildRoundLimitResult = (params: {
  text: string
  elapsedMs: number
  usage?: TokenUsage
  diagnostics: {
    batchId: string
    roundCount: number
    roundId?: string
    providerCallId?: string
    traceRef?: string
    threadId?: string
  }
}): {
  parsed: { text: string; actions: [] }
  elapsedMs: number
  usage?: TokenUsage
  roundLimitReached: true
  diagnostics: {
    batchId: string
    roundCount: number
    roundId?: string
    providerCallId?: string
    traceRef?: string
    threadId?: string
  }
} => ({
  parsed: {
    text: params.text,
    actions: [],
  },
  elapsedMs: params.elapsedMs,
  ...(params.usage ? { usage: params.usage } : {}),
  roundLimitReached: true,
  diagnostics: params.diagnostics,
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
  diagnostics: {
    batchId: string
    roundCount: number
    roundId?: string
    providerCallId?: string
    traceRef?: string
    threadId?: string
  }
}): {
  parsed: TParsed
  elapsedMs: number
  usage?: TokenUsage
  diagnostics: {
    batchId: string
    roundCount: number
    roundId?: string
    providerCallId?: string
    traceRef?: string
    threadId?: string
  }
} => ({
  parsed: params.parsed,
  elapsedMs: params.elapsedMs,
  ...(params.usage ? { usage: params.usage } : {}),
  diagnostics: params.diagnostics,
})
