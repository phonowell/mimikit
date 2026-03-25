import { appendTraceArchiveResult } from '../../persistence/storage/traces-archive.js'
import { readProviderThreadId } from '../providers/thread-id.js'
import {
  mergeUsageAdditive,
  mergeUsageMonotonic,
} from '../shared/token-usage.js'

import { isAbortLikeError } from './error-utils.js'
import {
  buildWorkerBudgetExceededError,
  DEFAULT_WORKER_BUDGET_DURATION_MS,
  isWorkerBudgetExceededError,
} from './profiled-runner-budget.js'
import {
  buildContinuePrompt,
  hasWorkerCompletionMarker,
  MAX_RUN_ROUNDS,
  stripWorkerProtocolTags,
} from './profiled-runner-prompt.js'

import type { ProviderResult, RunLoopParams } from './profiled-runner-types.js'
import type { TokenUsage } from '../../foundation/types/index.js'
import type {
  TraceArchiveEntry,
  TraceArchiveResult,
} from '../../persistence/storage/traces-archive.js'
export {
  buildContinuePrompt,
  hasWorkerCompletionMarker,
  MAX_CONTINUE_LATEST_OUTPUT_CHARS,
  MAX_RUN_ROUNDS,
  stripWorkerProtocolTags,
} from './profiled-runner-prompt.js'
export { isWorkerBudgetExceededError } from './profiled-runner-budget.js'

const normalizeThreadId = (
  value: string | null | undefined,
): string | undefined => {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

export const runWorkerLoop = async (
  params: RunLoopParams,
): Promise<{
  output: string
  elapsedMs: number
  usage?: TokenUsage
}> => {
  const { stateDir, prompt } = params
  const maxRounds = Math.max(1, params.budget?.maxRounds ?? MAX_RUN_ROUNDS)
  const maxDurationMs = Math.max(
    1,
    params.budget?.maxDurationMs ?? DEFAULT_WORKER_BUDGET_DURATION_MS,
  )
  let threadId: string | null | undefined = params.initialThreadId
  let reportedSessionId = normalizeThreadId(threadId)
  let totalUsage: TokenUsage | undefined
  let totalElapsedMs = 0
  let latestResult: ProviderResult | undefined
  let nextPrompt = prompt

  const archiveResult = (
    base: Omit<TraceArchiveEntry, 'prompt' | 'output' | 'ok'>,
    result: TraceArchiveResult,
  ) => appendTraceArchiveResult(stateDir, base, prompt, result)

  if (reportedSessionId) await params.onSessionId?.(reportedSessionId)

  try {
    for (let round = 1; round <= maxRounds; round += 1) {
      let roundUsage: TokenUsage | undefined
      const result = await params.runModel({
        prompt: nextPrompt,
        ...(threadId !== undefined ? { threadId } : {}),
        ...(params.onTurnStarted
          ? { onTurnStarted: params.onTurnStarted }
          : {}),
        onUsage: (usage) => {
          roundUsage = mergeUsageMonotonic(roundUsage, usage)
          const previewUsage = mergeUsageAdditive(totalUsage, roundUsage)
          if (!previewUsage) return
          params.task.usage = previewUsage
          params.onUsage?.(previewUsage)
        },
        onPartialOutput: (output) => {
          params.onPartialOutput?.(output)
        },
      })
      latestResult = result
      totalElapsedMs += result.elapsedMs
      threadId = result.threadId ?? threadId ?? null
      const nextSessionId = normalizeThreadId(threadId)
      if (nextSessionId && nextSessionId !== reportedSessionId) {
        reportedSessionId = nextSessionId
        await params.onSessionId?.(nextSessionId)
      }
      roundUsage = mergeUsageMonotonic(roundUsage, result.usage)
      totalUsage = mergeUsageAdditive(totalUsage, roundUsage)
      if (totalUsage) {
        params.task.usage = totalUsage
        params.onUsage?.(totalUsage)
      }

      const output = result.output.trim()
      if (hasWorkerCompletionMarker(output)) {
        const finalOutput = stripWorkerProtocolTags(output)
        await archiveResult(
          { ...params.archiveBase, threadId },
          {
            output: finalOutput,
            ok: true,
            elapsedMs: totalElapsedMs,
            ...(totalUsage ? { usage: totalUsage } : {}),
          },
        )
        return {
          output: finalOutput,
          elapsedMs: totalElapsedMs,
          ...(totalUsage ? { usage: totalUsage } : {}),
        }
      }

      if (round >= maxRounds || totalElapsedMs >= maxDurationMs) {
        throw buildWorkerBudgetExceededError({
          latestOutput: output,
          elapsedMs: totalElapsedMs,
          round,
          ...(totalUsage ? { usage: totalUsage } : {}),
          ...(nextSessionId ? { threadId: nextSessionId } : {}),
        })
      }

      if (round < maxRounds) {
        const shouldIncludeLatestOutput = !normalizeThreadId(threadId)
        nextPrompt = buildContinuePrompt(
          params.continueTemplate,
          params.continueTemplatePath,
          output,
          round + 1,
          {
            includeLatestOutput: shouldIncludeLatestOutput,
            maxRounds,
          },
        )
      }
    }

    throw new Error(
      `[worker] task incomplete after ${maxRounds} rounds: missing completion protocol (M:task_handoff + M:skill_usage status="done"); last_output=${JSON.stringify(latestResult?.output.trim() ?? 'empty_output')}`,
    )
  } catch (error) {
    const errorThreadId = readProviderThreadId(error)
    if (errorThreadId) {
      threadId = errorThreadId
      if (errorThreadId !== reportedSessionId) {
        reportedSessionId = errorThreadId
        await params.onSessionId?.(errorThreadId)
      }
    }
    const err = error instanceof Error ? error : new Error(String(error))
    const canceled =
      Boolean(params.abortSignal?.aborted) && isAbortLikeError(err)
    const partial =
      isWorkerBudgetExceededError(error) && error.latestOutput.trim().length > 0
    await archiveResult(
      {
        ...params.archiveBase,
        ...(threadId !== undefined ? { threadId } : {}),
      },
      {
        output: partial ? error.latestOutput : '',
        ok: false,
        error: canceled ? 'Task canceled' : err.message,
        errorName: canceled
          ? 'TaskCanceledError'
          : partial
            ? 'WorkerBudgetExceededError'
            : err.name,
        ...(partial
          ? {
              elapsedMs: error.elapsedMs,
              ...(error.usage ? { usage: error.usage } : {}),
            }
          : {}),
      },
    )
    throw error
  }
}
