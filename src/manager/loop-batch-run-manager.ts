import { MAX_WORKING_FOCUSES } from '../focus/constants.js'
import { resolveDefaultFocusId } from '../focus/index.js'
import { selectRecentPlans } from '../orchestrator/read-model/plan-select.js'
import { compareIsoDesc } from '../shared/time.js'

import { collectTriggeredPlanIds } from './loop-batch-context.js'
import { logManagerBatchStart } from './loop-batch-run-helpers.js'
import { runManagerCorrectionRounds } from './loop-batch-run-rounds.js'
import { type RuntimeState, selectRecentTasks } from './runtime-adapter.js'

import type { parseActions } from '../actions/protocol/parse.js'
import type {
  FocusId,
  TaskResult,
  TokenUsage,
  UserInput,
} from '../types/index.js'

const collectPreferredFocusIds = (
  runtime: RuntimeState,
  inputs: UserInput[],
  results: TaskResult[],
): FocusId[] => {
  const ids: FocusId[] = []
  for (const input of inputs) ids.push(input.focusId)
  for (const result of results) {
    const task = runtime.tasks.find((item) => item.id === result.taskId)
    if (task) ids.push(task.focusId)
  }
  return Array.from(new Set(ids.filter((id) => id.trim().length > 0)))
}

const selectWorkingFocusIds = (
  runtime: RuntimeState,
  preferred: FocusId[],
): FocusId[] => {
  const ranked = runtime.focuses
    .filter((item) => item.status !== 'archived')
    .sort((a, b) => {
      const diff = compareIsoDesc(a.lastActivityAt, b.lastActivityAt)
      if (diff !== 0) return diff
      return a.id.localeCompare(b.id)
    })
    .map((item) => item.id)
  const active = runtime.focuses
    .filter((item) => item.status === 'active')
    .map((item) => item.id)
  return Array.from(new Set([...preferred, ...active, ...ranked])).slice(
    0,
    MAX_WORKING_FOCUSES,
  )
}

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
