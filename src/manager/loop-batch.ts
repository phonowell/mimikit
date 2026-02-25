import { appendLog } from '../log/append.js'
import { bestEffort, logSafeError } from '../log/safe.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import { notifyUiSignal } from '../orchestrator/core/signals.js'
import { isVisibleToAgent } from '../shared/message-visibility.js'
import { nowIso } from '../shared/utils.js'
import { appendHistory } from '../storage/history-jsonl.js'

import { applyTaskActions, collectTaskResultSummaries } from './action-apply.js'
import {
  appendManagerErrorSystemMessage,
  appendManagerFallbackReply,
} from './history.js'
import { runManagerBatch } from './loop-batch-run-manager.js'
import {
  buildFallbackReply,
  consumeBatchHistory,
  finalizeBatchProgress,
} from './loop-helpers.js'
import { startUiStream, stopUiStream } from './loop-ui-stream.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { TaskResult, TokenUsage, UserInput } from '../types/index.js'

const isIdleSystemInput = (input: UserInput): boolean =>
  input.role === 'system' && input.text.includes('name="idle"')

const hasNonIdleManagerInput = (inputs: UserInput[]): boolean =>
  inputs.some((input) => input.role !== 'system' || !isIdleSystemInput(input))

export const processManagerBatch = async (params: {
  runtime: RuntimeState
  inputs: UserInput[]
  results: TaskResult[]
  nextInputsCursor: number
  nextResultsCursor: number
  streamId: string
}): Promise<void> => {
  const {
    runtime,
    inputs,
    results,
    nextInputsCursor,
    nextResultsCursor,
    streamId,
  } = params
  if (results.length > 0 || hasNonIdleManagerInput(inputs))
    runtime.lastManagerActivityAtMs = Date.now()
  runtime.managerRunning = true
  notifyUiSignal(runtime)
  const agentInputs = inputs.filter((item) => isVisibleToAgent(item))
  const startedAt = Date.now()
  let agentAppended = false
  startUiStream(runtime, streamId)
  try {
    if (agentInputs.length === 0 && results.length === 0) {
      const consumed = await consumeBatchHistory({
        runtime,
        inputs,
        results,
      })
      if (!consumed.ok) throw new Error(consumed.reason)
      await finalizeBatchProgress({
        runtime,
        nextInputsCursor,
        nextResultsCursor,
        consumedInputIds: consumed.consumedInputIds,
        persistRuntime: persistRuntimeState,
      })
      await appendLog(runtime.paths.log, {
        event: 'manager_end',
        status: 'ok',
        elapsedMs: Math.max(0, Date.now() - startedAt),
        skippedReason: 'no_agent_visible_inputs',
      })
      return
    }
    runtime.managerTurn += 1
    const managerRun = await runManagerBatch({
      runtime,
      inputs: agentInputs,
      results,
      streamId,
    })
    const resolvedUsage: TokenUsage | undefined = managerRun.usage
    const { parsed } = managerRun
    const summaries = collectTaskResultSummaries(parsed.actions)
    const hasManualCanceledResult = results.some(
      (result) =>
        result.status === 'canceled' && result.cancel?.source === 'user',
    )
    const consumed = await consumeBatchHistory({
      runtime,
      inputs,
      results,
      summaries,
    })
    if (!consumed.ok) throw new Error(consumed.reason)
    await applyTaskActions(runtime, parsed.actions, {
      suppressCreateTask: hasManualCanceledResult && agentInputs.length === 0,
    })

    const responseText =
      parsed.text.trim() ||
      (await buildFallbackReply({
        inputs: agentInputs,
        results,
      }))
    await appendHistory(runtime.paths.history, {
      id: `agent-${Date.now()}-${nextInputsCursor}`,
      role: 'agent',
      text: responseText,
      createdAt: nowIso(),
      ...(resolvedUsage ? { usage: resolvedUsage } : {}),
      ...(managerRun.elapsedMs >= 0 ? { elapsedMs: managerRun.elapsedMs } : {}),
    })
    agentAppended = true

    await finalizeBatchProgress({
      runtime,
      nextInputsCursor,
      nextResultsCursor,
      consumedInputIds: consumed.consumedInputIds,
      persistRuntime: persistRuntimeState,
    })

    await appendLog(runtime.paths.log, {
      event: 'manager_end',
      status: 'ok',
      elapsedMs: Math.max(0, Date.now() - startedAt),
      ...(resolvedUsage ? { usage: resolvedUsage } : {}),
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    let drainedOnError = false
    try {
      const consumed = await consumeBatchHistory({
        runtime,
        inputs,
        results,
      })
      if (consumed.ok) {
        await finalizeBatchProgress({
          runtime,
          nextInputsCursor,
          nextResultsCursor,
          consumedInputIds: consumed.consumedInputIds,
          persistRuntime: persistRuntimeState,
        })
        drainedOnError = true
      }
    } catch (drainError) {
      await logSafeError('managerLoop: drain batch on failure', drainError)
    }

    if (drainedOnError && !agentAppended && agentInputs.length > 0) {
      await bestEffort('appendHistory: manager_fallback_reply', () =>
        appendManagerFallbackReply(runtime.paths),
      )
    }
    await bestEffort('appendHistory: manager_error_system_message', () =>
      appendManagerErrorSystemMessage(runtime.paths, errorMessage),
    )

    await bestEffort('appendLog: manager_end_error', () =>
      appendLog(runtime.paths.log, {
        event: 'manager_end',
        status: 'error',
        error: errorMessage,
        elapsedMs: Math.max(0, Date.now() - startedAt),
        drainedOnError,
        agentAppended,
      }),
    )
    await bestEffort('persistRuntimeState: manager_error', () =>
      persistRuntimeState(runtime),
    )
  } finally {
    stopUiStream(runtime, streamId)
    runtime.managerRunning = false
    notifyUiSignal(runtime)
  }
}
