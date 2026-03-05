import { runManager } from './runner.js'

import type { RuntimeState } from './runtime-adapter.js'
import type { PromptSectionLimits } from '../config.js'
import type {
  HistoryLookupMessage,
  ManagerActionFeedback,
  ManagerEnv,
  ManagerWakeProfile,
  ReadFileLookupMessage,
  Task,
  TaskArchiveLookupMessage,
  TaskPlan,
  TaskResult,
  TokenUsage,
  UserInput,
} from '../types/index.js'

const buildManagerEnv = (
  runtime: RuntimeState,
  wakeProfile: ManagerWakeProfile,
): ManagerEnv | undefined => {
  const env: ManagerEnv = {
    ...(runtime.lastUserMeta ? { lastUser: runtime.lastUserMeta } : {}),
    wakeProfile,
  }
  if (!env.lastUser && !env.wakeProfile) return undefined
  return env
}

const hasSystemEvent = (item: UserInput, name: string): boolean =>
  item.role === 'system' && item.text.includes(`<M:system_event name="${name}"`)

const resolveWakeProfile = (
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
  const hasIdleWake = inputs.some((item) => hasSystemEvent(item, 'idle'))
  const activeKinds = [
    hasUserInput,
    hasTaskResult,
    hasTriggerWake,
    hasCapacityWake,
    hasIdleWake,
  ].filter(Boolean).length
  if (activeKinds !== 1) return 'mixed'
  if (hasUserInput) return 'user_input'
  if (hasTaskResult) return 'task_result'
  if (hasTriggerWake) return 'trigger'
  if (hasCapacityWake) return 'capacity'
  return 'idle'
}

const MIN_PROMPT_SECTION_BYTES = 512

const WAKE_PROFILE_SECTION_MULTIPLIERS: Partial<
  Record<ManagerWakeProfile, Partial<Record<keyof PromptSectionLimits, number>>>
> = {
  user_input: {
    inputsMaxBytes: 1.5,
    recentHistoryMaxBytes: 1.4,
    focusContextsMaxBytes: 1.2,
    historyLookupMaxBytes: 1.1,
    batchResultsMaxBytes: 0.6,
    tasksMaxBytes: 0.8,
    plansMaxBytes: 0.9,
  },
  task_result: {
    batchResultsMaxBytes: 1.6,
    tasksMaxBytes: 1.3,
    focusContextsMaxBytes: 1.2,
    inputsMaxBytes: 0.7,
    recentHistoryMaxBytes: 0.7,
    historyLookupMaxBytes: 0.8,
    plansMaxBytes: 0.8,
  },
  trigger: {
    plansMaxBytes: 1.4,
    tasksMaxBytes: 1.1,
    inputsMaxBytes: 0.7,
    recentHistoryMaxBytes: 0.8,
  },
  capacity: {
    plansMaxBytes: 1.4,
    tasksMaxBytes: 1.1,
    inputsMaxBytes: 0.7,
    recentHistoryMaxBytes: 0.8,
    batchResultsMaxBytes: 0.8,
  },
  idle: {
    plansMaxBytes: 1.2,
    tasksMaxBytes: 1.1,
    inputsMaxBytes: 0.6,
    recentHistoryMaxBytes: 0.8,
    batchResultsMaxBytes: 0.8,
  },
}

export const resolvePromptSectionLimitsForWakeProfile = (
  base: PromptSectionLimits,
  wakeProfile: ManagerWakeProfile,
): PromptSectionLimits => {
  const multipliers = WAKE_PROFILE_SECTION_MULTIPLIERS[wakeProfile]
  if (!multipliers) return base
  const entries = Object.entries(base) as Array<
    [keyof PromptSectionLimits, number]
  >
  return Object.fromEntries(
    entries.map(([key, value]) => {
      const multiplier = multipliers[key] ?? 1
      const next = Math.round(value * multiplier)
      return [key, Math.max(MIN_PROMPT_SECTION_BYTES, next)]
    }),
  ) as PromptSectionLimits
}

export const runManagerRoundWithRecovery = async (params: {
  runtime: RuntimeState
  round: number
  inputs: UserInput[]
  results: TaskResult[]
  tasks: Task[]
  plans: TaskPlan[]
  workingFocusIds: string[]
  extra: {
    historyLookup?: HistoryLookupMessage[]
    readFileLookup?: ReadFileLookupMessage[]
    taskArchiveLookup?: TaskArchiveLookupMessage[]
    actionFeedback?: ManagerActionFeedback[]
  }
}): Promise<{ output: string; elapsedMs: number; usage?: TokenUsage }> => {
  const wakeProfile = resolveWakeProfile(params.inputs, params.results)
  const managerEnv = buildManagerEnv(params.runtime, wakeProfile)
  const promptSectionLimits = resolvePromptSectionLimitsForWakeProfile(
    params.runtime.config.manager.promptSections,
    wakeProfile,
  )
  const result = await runManager({
    stateDir: params.runtime.config.workDir,
    workDir: params.runtime.config.workDir,
    inputs: params.inputs,
    results: params.results,
    tasks: params.tasks,
    promptSectionLimits,
    plans: params.plans,
    focuses: params.runtime.focuses,
    focusContexts: params.runtime.focusContexts,
    activeFocusIds: params.runtime.activeFocusIds,
    workingFocusIds: params.workingFocusIds,
    ...(params.extra.historyLookup
      ? { historyLookup: params.extra.historyLookup }
      : {}),
    ...(params.extra.readFileLookup
      ? { readFileLookup: params.extra.readFileLookup }
      : {}),
    ...(params.extra.taskArchiveLookup
      ? { taskArchiveLookup: params.extra.taskArchiveLookup }
      : {}),
    ...(params.extra.actionFeedback
      ? { actionFeedback: params.extra.actionFeedback }
      : {}),
    ...(managerEnv ? { env: managerEnv } : {}),
    model: params.runtime.config.manager.model,
    managerProvider: {
      ...params.runtime.config.manager.provider,
      modelReasoningEffort: params.runtime.config.manager.modelReasoningEffort,
    },
  })

  return {
    output: result.output,
    elapsedMs: result.elapsedMs,
    ...(result.usage ? { usage: result.usage } : {}),
  }
}
