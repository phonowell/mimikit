import { runManager } from './runner.js'

import type { AppConfig } from '../../bootstrap/config.js'
import type {
  ManagerActionFeedback,
  ManagerEnv,
  ManagerPacketMode,
  ManagerWakeProfile,
  Task,
  TaskPlan,
  TaskResult,
  UserInput,
} from '../../foundation/types/index.js'
import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

export const runManagerRoundAttempt = (params: {
  runtime: ManagerRuntime
  inputs: UserInput[]
  results: TaskResult[]
  tasks: Task[]
  plans: TaskPlan[]
  workingFocusIds: string[]
  actionFeedback?: ManagerActionFeedback[]
  managerEnv: ManagerEnv
  promptSectionLimits: AppConfig['manager']['promptSections']
  abortSignal?: AbortSignal
  managerThreadId?: string
  wakeProfile: ManagerWakeProfile
  batchId: string
  roundId: string
  packetMode: ManagerPacketMode
  modelReasoningEffort: ModelReasoningEffort
  retryMaxAttempts: number
}) =>
  runManager({
    stateDir: params.runtime.config.workDir,
    workDir: params.runtime.config.workDir,
    inputs: params.inputs,
    results: params.results,
    tasks: params.tasks,
    promptSectionLimits: params.promptSectionLimits,
    startupWorktree: params.runtime.startup.worktree,
    plans: params.plans,
    focuses: params.runtime.domain.focuses,
    workingFocusIds: params.workingFocusIds,
    ...(params.actionFeedback ? { actionFeedback: params.actionFeedback } : {}),
    env: params.managerEnv,
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
    modelReasoningEffort: params.modelReasoningEffort,
    retry: {
      maxAttempts: params.retryMaxAttempts,
      backoffMs: params.runtime.config.worker.retry.backoffMs,
    },
    ...(params.abortSignal ? { abortSignal: params.abortSignal } : {}),
    ...(params.managerThreadId ? { threadId: params.managerThreadId } : {}),
    packetMode: params.packetMode,
    wakeProfile: params.wakeProfile,
    batchId: params.batchId,
    roundId: params.roundId,
  })
