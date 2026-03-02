import { appendLog } from '../log/append.js'

import { compressManagerContext } from './action-runtime-compress.js'
import { runManager } from './runner.js'

import type { RuntimeState } from './runtime-adapter.js'
import type {
  HistoryLookupMessage,
  ManagerActionFeedback,
  ManagerEnv,
  ManagerWakeProfile,
  MemoryLookupMessage,
  ReadFileLookupMessage,
  Task,
  TaskResult,
  TaskPlan,
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
  const hasTriggerWake = inputs.some((item) => hasSystemEvent(item, 'trigger_fire'))
  const hasIdleWake = inputs.some((item) => hasSystemEvent(item, 'idle'))
  const activeKinds = [
    hasUserInput,
    hasTaskResult,
    hasTriggerWake,
    hasIdleWake,
  ].filter(Boolean).length
  if (activeKinds !== 1) return 'mixed'
  if (hasUserInput) return 'user_input'
  if (hasTaskResult) return 'task_result'
  if (hasTriggerWake) return 'trigger'
  return 'idle'
}

const isContextLimitError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.toLowerCase()
  return (
    normalized.includes('context') ||
    normalized.includes('token') ||
    normalized.includes('length') ||
    normalized.includes('maximum context') ||
    normalized.includes('prompt is too long') ||
    normalized.includes('context window')
  )
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
    memoryLookup?: MemoryLookupMessage[]
    readFileLookup?: ReadFileLookupMessage[]
    actionFeedback?: ManagerActionFeedback[]
  }
  onTextDelta: (delta: string) => void
  onUsage: (usage: TokenUsage) => void
}): Promise<{ output: string; elapsedMs: number; usage?: TokenUsage }> => {
  const wakeProfile = resolveWakeProfile(params.inputs, params.results)
  const managerEnv = buildManagerEnv(params.runtime, wakeProfile)
  let attemptedAutoCompress = false

  for (;;) {
    try {
      let callUsage: TokenUsage | undefined
      const result = await runManager({
        stateDir: params.runtime.config.workDir,
        workDir: params.runtime.config.workDir,
        inputs: params.inputs,
        results: params.results,
        tasks: params.tasks,
        promptSectionLimits: params.runtime.config.manager.promptSections,
        plans: params.plans,
        focuses: params.runtime.focuses,
        focusContexts: params.runtime.focusContexts,
        activeFocusIds: params.runtime.activeFocusIds,
        workingFocusIds: params.workingFocusIds,
        ...(params.extra.historyLookup
          ? { historyLookup: params.extra.historyLookup }
          : {}),
        ...(params.extra.memoryLookup
          ? { memoryLookup: params.extra.memoryLookup }
          : {}),
        ...(params.extra.readFileLookup
          ? { readFileLookup: params.extra.readFileLookup }
          : {}),
        ...(params.extra.actionFeedback
          ? { actionFeedback: params.extra.actionFeedback }
          : {}),
        ...(params.runtime.managerCompressedContext
          ? { compressedContext: params.runtime.managerCompressedContext }
          : {}),
        ...(managerEnv ? { env: managerEnv } : {}),
        model: params.runtime.config.manager.model,
        onTextDelta: params.onTextDelta,
        onUsage: (usage) => {
          callUsage = usage
          params.onUsage(usage)
        },
      })
      const resolvedUsage = result.usage ?? callUsage
      return {
        output: result.output,
        elapsedMs: result.elapsedMs,
        ...(resolvedUsage ? { usage: resolvedUsage } : {}),
      }
    } catch (error) {
      if (attemptedAutoCompress || !isContextLimitError(error)) throw error
      attemptedAutoCompress = true
      await appendLog(params.runtime.paths.log, {
        event: 'manager_auto_compress_retry',
        round: params.round,
      })
      await compressManagerContext(params.runtime, {
        reason: 'auto_context_limit_retry',
      })
    }
  }
}
