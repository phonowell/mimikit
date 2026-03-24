import { mergeUsageAdditive } from '../../execution/shared/token-usage.js'
import { resolveSlotStatus } from '../../execution/worker/task-state-shared.js'
import { appendLog } from '../../persistence/log/append.js'
import { bestEffort } from '../../persistence/log/safe.js'
import { appendManagerUsageLedgerEntry } from '../../persistence/storage/usage-ledger.js'
import { resolveManagerPacketMode } from '../prompts/manager-context-packet.js'

import { resolveManagerContextBudgetDecision } from './context-budget.js'
import { runManager } from './runner.js'

import type {
  ManagerActionFeedback,
  ManagerEnv,
  ManagerWakeProfile,
  Task,
  TaskPlan,
  TaskResult,
  TokenUsage,
  UserInput,
} from '../../foundation/types/index.js'
import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

const buildManagerEnv = (
  runtime: ManagerRuntime,
  wakeProfile: ManagerWakeProfile,
): ManagerEnv => {
  const slots = resolveSlotStatus(runtime)
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
  }
  return env
}
export const runManagerRoundWithRecovery = async (params: {
  runtime: ManagerRuntime
  round: number
  inputs: UserInput[]
  results: TaskResult[]
  tasks: Task[]
  plans: TaskPlan[]
  workingFocusIds: string[]
  managerThreadId?: string
  extra: {
    actionFeedback?: ManagerActionFeedback[]
  }
  abortSignal?: AbortSignal
}): Promise<{
  output: string
  elapsedMs: number
  usage?: TokenUsage
  promptPrefixHash: string
  threadId?: string | null
}> => {
  const budgetDecision = resolveManagerContextBudgetDecision({
    runtime: params.runtime,
    inputs: params.inputs,
    results: params.results,
  })
  const { wakeProfile } = budgetDecision
  const managerEnv = buildManagerEnv(params.runtime, wakeProfile)
  const packetMode = resolveManagerPacketMode({
    wakeProfile,
    round: params.round,
    hasActionFeedback: Boolean(
      params.extra.actionFeedback && params.extra.actionFeedback.length > 0,
    ),
  })
  const { promptSectionLimits } = budgetDecision
  void appendLog(params.runtime.paths.log, {
    event: 'manager_context_budget_resolved',
    policy: budgetDecision.policy,
    wakeProfile,
    packetMode,
    inputCount: budgetDecision.inputCount,
    resultCount: budgetDecision.resultCount,
    activeFocusCount: budgetDecision.activeFocusCount,
    promptSectionLimits,
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
    workingFocusIds: params.workingFocusIds,
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
    retry: params.runtime.config.worker.retry,
    ...(params.abortSignal ? { abortSignal: params.abortSignal } : {}),
    ...(params.managerThreadId ? { threadId: params.managerThreadId } : {}),
    packetMode,
    wakeProfile,
  })
  params.runtime.manager.lastContextPacket = result.contextPacket
  if (result.usage) {
    params.runtime.manager.lastUsage = result.usage
    params.runtime.manager.usageTotal =
      mergeUsageAdditive(params.runtime.manager.usageTotal, result.usage) ??
      result.usage
  }
  await bestEffort('appendManagerUsageLedgerEntry', () =>
    appendManagerUsageLedgerEntry({
      stateDir: params.runtime.config.workDir,
      wakeProfile,
      packetMode,
      contextPacket: result.contextPacket,
      ...(result.usage ? { usage: result.usage } : {}),
      elapsedMs: result.elapsedMs,
      ...(result.threadId !== undefined ? { threadId: result.threadId } : {}),
      model: params.runtime.config.manager.model,
      promptBytes: result.promptBytes,
      promptSegmentCount: result.promptSegmentCount,
    }),
  )

  return {
    output: result.output,
    elapsedMs: result.elapsedMs,
    promptPrefixHash: result.promptPrefixHash,
    ...(result.threadId !== undefined ? { threadId: result.threadId } : {}),
    ...(result.usage ? { usage: result.usage } : {}),
  }
}
