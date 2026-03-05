import {
  collectPreferredFocusIds,
  resolveDefaultFocusId,
  selectWorkingFocusIds,
} from '../focus/index.js'
import { selectRecentPlans } from '../orchestrator/read-model/plan-select.js'

import { collectTriggeredPlanIds } from './loop-batch-context.js'
import { logManagerBatchStart } from './loop-batch-run-helpers.js'
import { runManagerCorrectionRounds } from './loop-batch-run-rounds.js'
import { type RuntimeState, selectRecentTasks } from './runtime-adapter.js'

import type { parseActions } from '../actions/protocol/parse.js'
import type { TaskResult, TokenUsage, UserInput } from '../types/index.js'

const runRounds = (params: {
  runtime: RuntimeState
  inputs: UserInput[]
  results: TaskResult[]
  maxCorrectionRounds: number
}): Promise<{
  parsed: ReturnType<typeof parseActions>
  usage?: TokenUsage
  elapsedMs: number
  roundLimitReached?: boolean
}> => {
  const { runtime, inputs, results, maxCorrectionRounds } = params
  const tasks = selectRecentTasks(runtime.tasks, {
    minCount: runtime.config.manager.taskWindow.minCount,
    maxCount: runtime.config.manager.taskWindow.maxCount,
  })
  const triggeredPlanIds = collectTriggeredPlanIds(inputs)
  const plansSource = runtime.taskPlans.filter(
    (plan) => !triggeredPlanIds.has(plan.id),
  )
  const plans = selectRecentPlans(plansSource, {
    minCount: runtime.config.manager.planWindow.minCount,
    maxCount: runtime.config.manager.planWindow.maxCount,
  })
  const preferredFocusIds = collectPreferredFocusIds(runtime, inputs, results)
  const workingFocusIds = selectWorkingFocusIds(runtime, preferredFocusIds)

  return runManagerCorrectionRounds({
    runtime,
    inputs,
    results,
    tasks,
    plans,
    workingFocusIds,
    maxCorrectionRounds,
    resolveFocusId: () => resolveDefaultFocusId(runtime),
  })
}

export const runManagerBatch = async (params: {
  runtime: RuntimeState
  inputs: UserInput[]
  results: TaskResult[]
}): Promise<{
  parsed: ReturnType<typeof parseActions>
  usage?: TokenUsage
  elapsedMs: number
  roundLimitReached?: boolean
}> => {
  const { runtime, inputs, results } = params
  await logManagerBatchStart(
    runtime,
    inputs.map((item) => item.id),
    results.map((item) => item.taskId),
  )

  const maxCorrectionRounds = Math.max(
    1,
    runtime.config.manager.maxCorrectionRounds,
  )
  return runRounds({
    runtime,
    inputs,
    results,
    maxCorrectionRounds,
  })
}
