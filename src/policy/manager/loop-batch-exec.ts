import { mergeUsageAdditive } from '../../execution/shared/token-usage.js'
import { resolveSlotStatus } from '../../execution/worker/task-state-shared.js'
import { appendLog } from '../../persistence/log/append.js'
import { createRoundId } from '../../persistence/log/diagnostics.js'
import { bestEffort } from '../../persistence/log/safe.js'
import { appendManagerUsageLedgerEntry } from '../../persistence/storage/usage-ledger.js'
import { resolveManagerPacketMode } from '../prompts/manager-context-packet.js'

import { resolveManagerContextBudgetDecision } from './context-budget.js'
import { runManager } from './runner.js'

import type { ManagerTurnDecision } from './manager-turn-schema.js'
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
import type { Parsed } from '../actions/model/spec.js'

const buildManagerEnv = (
  runtime: ManagerRuntime,
  wakeProfile: ManagerWakeProfile,
): ManagerEnv => {
  const slots = resolveSlotStatus(runtime)
  const env: ManagerEnv = {
    ...(runtime.process.session.lastUserMeta
      ? { lastUser: runtime.process.session.lastUserMeta }
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
  batchId: string
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
  actions: Parsed[]
  decision?: ManagerTurnDecision
  elapsedMs: number
  usage?: TokenUsage
  wakeProfile: ManagerWakeProfile
  threadId?: string | null
  traceRef?: string
  providerCallId?: string
  attempt?: number
  batchId: string
  roundId: string
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
  const roundId = createRoundId()
  const { promptSectionLimits } = budgetDecision
  void appendLog(params.runtime.paths.log, {
    event: 'manager_context_budget_resolved',
    batchId: params.batchId,
    roundId,
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
    startupWorktree: params.runtime.startup.worktree,
    plans: params.plans,
    focuses: params.runtime.domain.focuses,
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
    batchId: params.batchId,
    roundId,
  })
  if (result.usage) {
    params.runtime.process.manager.lastUsage = result.usage
    params.runtime.process.manager.usageTotal =
      mergeUsageAdditive(
        params.runtime.process.manager.usageTotal,
        result.usage,
      ) ?? result.usage
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
      batchId: params.batchId,
      roundId,
      ...(result.providerCallId
        ? { providerCallId: result.providerCallId }
        : {}),
      ...(result.traceRef ? { traceRef: result.traceRef } : {}),
      ...(result.attempt ? { attempt: result.attempt } : {}),
      promptBytes: result.promptBytes,
      promptSegmentCount: result.promptSegmentCount,
      promptSections: result.promptSections,
      promptSelection: result.promptSelection,
    }),
  )

  return {
    output: result.output,
    actions: result.actions,
    ...(result.decision ? { decision: result.decision } : {}),
    elapsedMs: result.elapsedMs,
    wakeProfile,
    batchId: params.batchId,
    roundId,
    ...(result.threadId !== undefined ? { threadId: result.threadId } : {}),
    ...(result.traceRef ? { traceRef: result.traceRef } : {}),
    ...(result.providerCallId ? { providerCallId: result.providerCallId } : {}),
    ...(result.attempt ? { attempt: result.attempt } : {}),
    ...(result.usage ? { usage: result.usage } : {}),
  }
}
