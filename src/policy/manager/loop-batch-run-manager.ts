import { createBatchId } from '../../persistence/log/diagnostics.js'
import {
  selectRecentPlans,
  selectRecentTasks,
} from '../../surface/read-model/plan-select.js'

import { collectTriggeredPlanIds } from './loop-batch-context.js'
import { resolveBatchWorkingFocusIds } from './loop-batch-primary-focus.js'
import { logManagerBatchStart } from './loop-batch-run-helpers.js'
import { runManagerCorrectionRounds } from './loop-batch-run-rounds.js'

import type { ManagerTurnDecision } from './manager-turn-schema.js'
import type {
  TaskResult,
  TokenUsage,
  UserInput,
} from '../../foundation/types/index.js'
import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'
import type { Parsed } from '../actions/model/spec.js'

type ManagerParsedTurn = {
  text: string
  actions: Parsed[]
  decision?: ManagerTurnDecision
}

const runRounds = (params: {
  runtime: ManagerRuntime
  batchId: string
  inputs: UserInput[]
  results: TaskResult[]
  maxCorrectionRounds: number
  abortSignal?: AbortSignal
}): Promise<{
  parsed: ManagerParsedTurn
  usage?: TokenUsage
  elapsedMs: number
  roundLimitReached?: boolean
  diagnostics: {
    batchId: string
    roundCount: number
    roundId?: string
    providerCallId?: string
    traceRef?: string
    threadId?: string
  }
}> => {
  const { runtime, inputs, results, maxCorrectionRounds } = params
  const workingFocusIds = resolveBatchWorkingFocusIds({
    runtime,
    inputs,
    results,
  })
  const tasks = selectRecentTasks(runtime.domain.tasks, {
    minCount: runtime.config.manager.taskWindow.minCount,
    maxCount: runtime.config.manager.taskWindow.maxCount,
    workingFocusIds,
    latestResultTaskId: results[0]?.taskId,
  })
  const triggeredPlanIds = collectTriggeredPlanIds(inputs)
  const plansSource = runtime.domain.taskPlans.filter(
    (plan) => !triggeredPlanIds.has(plan.id),
  )
  const plans = selectRecentPlans(plansSource, {
    minCount: runtime.config.manager.planWindow.minCount,
    maxCount: runtime.config.manager.planWindow.maxCount,
    workingFocusIds,
    latestResultTaskId: results[0]?.taskId,
  })

  return runManagerCorrectionRounds({
    runtime,
    batchId: params.batchId,
    inputs,
    results,
    tasks,
    plans,
    workingFocusIds,
    maxCorrectionRounds,
    ...(params.abortSignal ? { abortSignal: params.abortSignal } : {}),
  })
}

export const runManagerBatch = async (params: {
  runtime: ManagerRuntime
  inputs: UserInput[]
  results: TaskResult[]
  abortSignal?: AbortSignal
}): Promise<{
  parsed: ManagerParsedTurn
  usage?: TokenUsage
  elapsedMs: number
  roundLimitReached?: boolean
  diagnostics: {
    batchId: string
    roundCount: number
    roundId?: string
    providerCallId?: string
    traceRef?: string
    threadId?: string
  }
}> => {
  const { runtime, inputs, results } = params
  const batchId = createBatchId()
  await logManagerBatchStart(
    runtime,
    batchId,
    inputs.map((item) => item.id),
    results.map((item) => item.taskId),
  )

  const maxCorrectionRounds = Math.max(
    1,
    runtime.config.manager.maxCorrectionRounds,
  )
  return runRounds({
    runtime,
    batchId,
    inputs,
    results,
    maxCorrectionRounds,
    ...(params.abortSignal ? { abortSignal: params.abortSignal } : {}),
  })
}
