import { runManager } from './runner.js'
import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import {
  ensureRuntimeManagerAutoModeState,
  lockRuntimeManagerToResponses,
  markRuntimeManagerFirstUserChatFailure,
  resolveRuntimeManagerMode,
} from './manager-mode-runtime.js'

import type { RuntimeState } from './runtime-adapter.js'
import type {
  HistoryLookupMessage,
  ManagerActionFeedback,
  ManagerEnv,
  ManagerWakeProfile,
  ReadFileLookupMessage,
  Task,
  TaskResult,
  TaskPlan,
  TokenUsage,
  UserInput,
} from '../types/index.js'

type RunOnceCallbacks = {
  onTextDelta: (delta: string) => void
  onUsage: (usage: TokenUsage) => void
}

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
    actionFeedback?: ManagerActionFeedback[]
  }
  onTextDelta: (delta: string) => void
  onUsage: (usage: TokenUsage) => void
}): Promise<{ output: string; elapsedMs: number; usage?: TokenUsage }> => {
  const wakeProfile = resolveWakeProfile(params.inputs, params.results)
  const managerEnv = buildManagerEnv(params.runtime, wakeProfile)
  const hasUserInput = params.inputs.some((item) => item.role === 'user')
  const autoModeState = ensureRuntimeManagerAutoModeState(params.runtime)
  const shouldUseFirstUserAutoFailover =
    params.runtime.config.manager.mode === 'auto' &&
    autoModeState.firstUserInputPending &&
    !autoModeState.lockedMode &&
    hasUserInput

  const createPassThroughCallbacks = (): RunOnceCallbacks => ({
    onTextDelta: params.onTextDelta,
    onUsage: (usage) => {
      callUsage = usage
      params.onUsage(usage)
    },
  })

  const runOnce = (
    mode: RuntimeState['config']['manager']['mode'],
    callbacks: RunOnceCallbacks,
  ) =>
    runManager({
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
      ...(params.extra.readFileLookup
        ? { readFileLookup: params.extra.readFileLookup }
        : {}),
      ...(params.extra.actionFeedback
        ? { actionFeedback: params.extra.actionFeedback }
        : {}),
      ...(managerEnv ? { env: managerEnv } : {}),
      model: params.runtime.config.manager.model,
      mode,
      onTextDelta: callbacks.onTextDelta,
      onUsage: callbacks.onUsage,
    })

  let callUsage: TokenUsage | undefined
  const result = await (async () => {
    if (!shouldUseFirstUserAutoFailover) {
      return runOnce(
        resolveRuntimeManagerMode(params.runtime),
        createPassThroughCallbacks(),
      )
    }

    autoModeState.firstUserInputPending = false
    let chatBufferedOutput = ''
    let chatBufferedUsage: TokenUsage | undefined
    try {
      const chatResult = await runOnce('chat', {
        onTextDelta: (delta) => {
          chatBufferedOutput += delta
        },
        onUsage: (usage) => {
          chatBufferedUsage = usage
        },
      })
      if (chatBufferedOutput) params.onTextDelta(chatBufferedOutput)
      if (chatBufferedUsage) {
        callUsage = chatBufferedUsage
        params.onUsage(chatBufferedUsage)
      }
      return chatResult
    } catch (chatError) {
      callUsage = undefined
      const err =
        chatError instanceof Error ? chatError : new Error(String(chatError))
      markRuntimeManagerFirstUserChatFailure(params.runtime, err.message)
      await bestEffort('appendLog: manager_auto_first_user_chat_failed', () =>
        appendLog(params.runtime.paths.log, {
          event: 'manager_auto_first_user_chat_failed',
          round: params.round,
          error: err.message,
        }),
      )
      const responsesResult = await runOnce(
        'responses',
        createPassThroughCallbacks(),
      )
      lockRuntimeManagerToResponses(params.runtime)
      await bestEffort('appendLog: manager_auto_locked_responses', () =>
        appendLog(params.runtime.paths.log, {
          event: 'manager_auto_locked_responses',
          round: params.round,
        }),
      )
      return responsesResult
    }
  })()

  const resolvedUsage = result.usage ?? callUsage
  return {
    output: result.output,
    elapsedMs: result.elapsedMs,
    ...(resolvedUsage ? { usage: resolvedUsage } : {}),
  }
}
