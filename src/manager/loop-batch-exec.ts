import { appendLog } from '../log/append.js'
import { resolveSlotStatus } from '../worker/task-state-shared.js'

import { runManager } from './runner.js'
import {
  compareWorkerProviderPreference,
  listEnabledWorkerProviders,
} from './worker-provider-selection.js'

import type { RuntimeState } from './runtime-adapter.js'
import type { PromptSectionLimits } from '../config.js'
import type {
  HistoryLookupMessage,
  ManagerActionFeedback,
  ManagerEnv,
  ManagerWakeProfile,
  QueryLookupMessage,
  ReadFileLookupMessage,
  Task,
  TaskPlan,
  TaskResult,
  TokenUsage,
  UserInput,
} from '../types/index.js'

const resolveEnabledWorkerProviders = (
  runtime: RuntimeState,
): NonNullable<ManagerEnv['workerProviders']> =>
  listEnabledWorkerProviders(runtime.config)
    .sort(compareWorkerProviderPreference)
    .map((item) => ({
      provider: item.provider,
      model:
        item.provider === 'codex'
          ? runtime.config.codex.model
          : runtime.config.opencode.model,
      capability: item.capability,
      billing: item.billing,
    }))

const buildManagerEnv = (
  runtime: RuntimeState,
  wakeProfile: ManagerWakeProfile,
): ManagerEnv => {
  const slots = resolveSlotStatus(runtime)
  const enabledProviders = resolveEnabledWorkerProviders(runtime)
  const env: ManagerEnv = {
    ...(runtime.session.lastUserMeta
      ? { lastUser: runtime.session.lastUserMeta }
      : {}),
    wakeProfile,
    workerSlots: {
      maxSlots: slots.max_slots,
      occupiedSlots: slots.occupied_slots,
      availableSlots: slots.available_slots,
    },
    ...(enabledProviders.length > 0
      ? { workerProviders: enabledProviders }
      : {}),
  }
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

const MIN_PROMPT_SECTION_BYTES = 512
const TASK_RESULT_TRIM_MULTIPLIER = 0.7
const ENABLE_TASK_RESULT_PROMPT_TRIM =
  process.env.MIMIKIT_MANAGER_TASK_RESULT_PROMPT_TRIM !== '0'

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
}

const CONTEXT_BUDGET_PRESETS: Record<
  'lite' | 'standard' | 'heavy',
  Partial<Record<keyof PromptSectionLimits, number>>
> = {
  lite: {
    environmentMaxBytes: 3072,
    inputsMaxBytes: 6144,
    batchResultsMaxBytes: 12288,
    tasksMaxBytes: 12288,
    plansMaxBytes: 8192,
    recentHistoryMaxBytes: 6144,
    focusListMaxBytes: 6144,
    focusContextsMaxBytes: 12288,
    historyLookupMaxBytes: 8192,
    queryLookupMaxBytes: 12288,
    fileLookupMaxBytes: 12288,
    actionFeedbackMaxBytes: 4096,
    memoryMaxBytes: 4096,
  },
  standard: {
    environmentMaxBytes: 4096,
    inputsMaxBytes: 8192,
    batchResultsMaxBytes: 20480,
    tasksMaxBytes: 24576,
    plansMaxBytes: 16384,
    recentHistoryMaxBytes: 8192,
    focusListMaxBytes: 8192,
    focusContextsMaxBytes: 20480,
    historyLookupMaxBytes: 20480,
    queryLookupMaxBytes: 20480,
    fileLookupMaxBytes: 20480,
    actionFeedbackMaxBytes: 8192,
    memoryMaxBytes: 8192,
  },
  heavy: {
    environmentMaxBytes: 6144,
    inputsMaxBytes: 12288,
    batchResultsMaxBytes: 28672,
    tasksMaxBytes: 32768,
    plansMaxBytes: 24576,
    recentHistoryMaxBytes: 12288,
    focusListMaxBytes: 12288,
    focusContextsMaxBytes: 28672,
    historyLookupMaxBytes: 28672,
    queryLookupMaxBytes: 28672,
    fileLookupMaxBytes: 28672,
    actionFeedbackMaxBytes: 12288,
    memoryMaxBytes: 12288,
  },
}

const resolveContextBudgetTier = (params: {
  wakeProfile: ManagerWakeProfile
  inputCount: number
  resultCount: number
  activeFocusCount: number
}): 'lite' | 'standard' | 'heavy' => {
  const { wakeProfile, inputCount, resultCount, activeFocusCount } = params
  if (wakeProfile === 'mixed') return 'standard'
  if (activeFocusCount >= 3) return 'heavy'
  if (resultCount >= 2) return 'standard'
  if (inputCount >= 2) return 'standard'
  if (wakeProfile === 'task_result') return 'standard'
  return 'lite'
}

const countActiveFocuses = (runtime: RuntimeState): number =>
  runtime.focuses.filter((focus) => focus.status === 'active').length

const applyContextBudgetPreset = (
  base: PromptSectionLimits,
  tier: 'lite' | 'standard' | 'heavy',
): PromptSectionLimits => {
  const preset = CONTEXT_BUDGET_PRESETS[tier]
  return Object.fromEntries(
    Object.entries(base).map(([key, value]) => [
      key,
      Math.max(
        MIN_PROMPT_SECTION_BYTES,
        Math.floor(preset[key as keyof PromptSectionLimits] ?? value),
      ),
    ]),
  ) as PromptSectionLimits
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

export const trimPromptSectionLimitsForTaskResult = (
  limits: PromptSectionLimits,
): PromptSectionLimits => {
  const trimKeys: Array<keyof PromptSectionLimits> = [
    'tasksMaxBytes',
    'batchResultsMaxBytes',
    'recentHistoryMaxBytes',
    'focusContextsMaxBytes',
    'historyLookupMaxBytes',
    'queryLookupMaxBytes',
    'fileLookupMaxBytes',
  ]
  return Object.fromEntries(
    Object.entries(limits).map(([key, value]) => {
      const typedKey = key as keyof PromptSectionLimits
      if (!trimKeys.includes(typedKey)) return [typedKey, value]
      return [
        typedKey,
        Math.max(
          MIN_PROMPT_SECTION_BYTES,
          Math.floor(value * TASK_RESULT_TRIM_MULTIPLIER),
        ),
      ]
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
  managerThreadId?: string
  extra: {
    historyLookup?: HistoryLookupMessage[]
    queryLookup?: QueryLookupMessage
    readFileLookup?: ReadFileLookupMessage[]
    actionFeedback?: ManagerActionFeedback[]
  }
}): Promise<{
  output: string
  elapsedMs: number
  usage?: TokenUsage
  promptPrefixHash: string
  threadId?: string | null
}> => {
  const wakeProfile = resolveWakeProfile(params.inputs, params.results)
  const managerEnv = buildManagerEnv(params.runtime, wakeProfile)
  const budgetTier = resolveContextBudgetTier({
    wakeProfile,
    inputCount: params.inputs.length,
    resultCount: params.results.length,
    activeFocusCount: countActiveFocuses(params.runtime),
  })
  const wakeLimits = resolvePromptSectionLimitsForWakeProfile(
    applyContextBudgetPreset(
      params.runtime.config.manager.promptSections,
      budgetTier,
    ),
    wakeProfile,
  )
  const taskResultTrimApplied =
    ENABLE_TASK_RESULT_PROMPT_TRIM && wakeProfile === 'task_result'
  const promptSectionLimits = taskResultTrimApplied
    ? trimPromptSectionLimitsForTaskResult(wakeLimits)
    : wakeLimits
  void appendLog(params.runtime.paths.log, {
    event: 'manager_context_budget_tier',
    wakeProfile,
    tier: budgetTier,
    inputCount: params.inputs.length,
    resultCount: params.results.length,
    activeFocusCount: countActiveFocuses(params.runtime),
    taskResultTrimApplied,
  })
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
    workingFocusIds: params.workingFocusIds,
    ...(params.extra.historyLookup
      ? { historyLookup: params.extra.historyLookup }
      : {}),
    ...(params.extra.queryLookup
      ? { queryLookup: params.extra.queryLookup }
      : {}),
    ...(params.extra.readFileLookup
      ? { readFileLookup: params.extra.readFileLookup }
      : {}),
    ...(params.extra.actionFeedback
      ? { actionFeedback: params.extra.actionFeedback }
      : {}),
    env: managerEnv,
    model: params.runtime.config.manager.model,
    ...(params.runtime.config.manager.baseUrl
      ? { baseUrl: params.runtime.config.manager.baseUrl }
      : {}),
    ...(params.runtime.config.manager.apiKey
      ? { apiKey: params.runtime.config.manager.apiKey }
      : {}),
    ...(params.runtime.config.manager.proxy
      ? { proxy: params.runtime.config.manager.proxy }
      : {}),
    modelReasoningEffort: params.runtime.config.manager.modelReasoningEffort,
    ...(params.managerThreadId ? { threadId: params.managerThreadId } : {}),
  })

  return {
    output: result.output,
    elapsedMs: result.elapsedMs,
    promptPrefixHash: result.promptPrefixHash,
    ...(result.threadId !== undefined ? { threadId: result.threadId } : {}),
    ...(result.usage ? { usage: result.usage } : {}),
  }
}
