import { readProviderErrorCode } from '../../execution/providers/provider-error.js'
import { mergeUsageAdditive } from '../../execution/shared/token-usage.js'
import { appendLog } from '../../persistence/log/append.js'
import { createRoundId } from '../../persistence/log/diagnostics.js'
import { bestEffort } from '../../persistence/log/safe.js'
import { appendManagerUsageLedgerEntry } from '../../persistence/storage/usage-ledger.js'
import { resolveManagerPacketMode } from '../prompts/manager-context-packet.js'

import { resolveManagerContextBudgetDecision } from './context-budget.js'
import { runManagerRoundAttempt } from './loop-batch-run-round-attempt.js'
import { buildManagerEnv } from './manager-env.js'

import type { ManagerTurnAction as Parsed } from './manager-turn-schema.js'
import type {
  ManagerWakeProfile,
  Task,
  TaskPlan,
  TaskResult,
  TokenUsage,
  UserInput,
} from '../../foundation/types/index.js'
import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'
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
  abortSignal?: AbortSignal
}): Promise<{
  output: string
  actions: Parsed[]
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
  const packetMode = resolveManagerPacketMode({ wakeProfile })
  const roundId = createRoundId()
  const { promptSectionLimits } = budgetDecision
  const baseRetry = params.runtime.config.manager.retry
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
  let actualPacketMode = packetMode
  const result = await (async () => {
    try {
      return await runManagerRoundAttempt({
        runtime: params.runtime,
        inputs: params.inputs,
        results: params.results,
        tasks: params.tasks,
        plans: params.plans,
        workingFocusIds: params.workingFocusIds,
        managerEnv,
        promptSectionLimits,
        ...(params.abortSignal ? { abortSignal: params.abortSignal } : {}),
        ...(params.managerThreadId
          ? { managerThreadId: params.managerThreadId }
          : {}),
        wakeProfile,
        batchId: params.batchId,
        roundId,
        packetMode,
        modelReasoningEffort:
          params.runtime.config.manager.modelReasoningEffort,
        retryMaxAttempts: baseRetry.maxAttempts,
      })
    } catch (error) {
      if (
        wakeProfile !== 'user_input' ||
        packetMode !== 'standard' ||
        readProviderErrorCode(error) !== 'provider_timeout'
      )
        throw error
      actualPacketMode = 'minimal'
      void appendLog(params.runtime.paths.log, {
        event: 'manager_timeout_degraded_retry',
        batchId: params.batchId,
        roundId,
        wakeProfile,
        fromPacketMode: packetMode,
        toPacketMode: actualPacketMode,
        fromReasoningEffort: params.runtime.config.manager.modelReasoningEffort,
        toReasoningEffort: 'medium',
        errorCode: 'provider_timeout',
      })
      return runManagerRoundAttempt({
        runtime: params.runtime,
        inputs: params.inputs,
        results: params.results,
        tasks: params.tasks,
        plans: params.plans,
        workingFocusIds: params.workingFocusIds,
        managerEnv,
        promptSectionLimits,
        ...(params.abortSignal ? { abortSignal: params.abortSignal } : {}),
        ...(params.managerThreadId
          ? { managerThreadId: params.managerThreadId }
          : {}),
        wakeProfile,
        batchId: params.batchId,
        roundId,
        packetMode: actualPacketMode,
        modelReasoningEffort: 'medium',
        retryMaxAttempts: 0,
      })
    }
  })()
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
      packetMode: actualPacketMode,
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
