import { appendTraceArchiveResult } from '../../persistence/storage/traces-archive.js'
import { readProviderThreadId } from '../providers/thread-id.js'
import {
  mergeUsageAdditive,
  mergeUsageMonotonic,
} from '../shared/token-usage.js'

import { isAbortLikeError } from './error-utils.js'
import {
  hasWorkerCompletionMarker,
  stripWorkerProtocolTags,
} from './profiled-runner-prompt.js'

import type { RunLoopParams } from './profiled-runner-types.js'
import type { TokenUsage } from '../../foundation/types/index.js'
import type {
  TraceArchiveEntry,
  TraceArchiveResult,
} from '../../persistence/storage/traces-archive.js'
export {
  hasWorkerCompletionMarker,
  stripWorkerProtocolTags,
} from './profiled-runner-prompt.js'

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
  let threadId: string | null | undefined = params.initialThreadId
  let reportedSessionId = normalizeThreadId(threadId)
  let totalUsage: TokenUsage | undefined

  const archiveResult = (
    base: Omit<TraceArchiveEntry, 'prompt' | 'output' | 'ok'>,
    result: TraceArchiveResult,
  ) => appendTraceArchiveResult(stateDir, base, prompt, result)

  if (reportedSessionId) await params.onSessionId?.(reportedSessionId)

  try {
    let roundUsage: TokenUsage | undefined
    const result = await params.runModel({
      prompt,
      ...(threadId !== undefined ? { threadId } : {}),
      ...(params.onTurnStarted ? { onTurnStarted: params.onTurnStarted } : {}),
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
    if (!hasWorkerCompletionMarker(output)) {
      throw new Error(
        `[worker] task incomplete after single run: missing completion protocol (M:task_handoff + M:skill_usage status="done"); last_output=${JSON.stringify(output || 'empty_output')}`,
      )
    }
    const finalOutput = stripWorkerProtocolTags(output)
    await archiveResult(
      { ...params.archiveBase, threadId },
      {
        output: finalOutput,
        ok: true,
        elapsedMs: result.elapsedMs,
        ...(totalUsage ? { usage: totalUsage } : {}),
      },
    )
    return {
      output: finalOutput,
      elapsedMs: result.elapsedMs,
      ...(totalUsage ? { usage: totalUsage } : {}),
    }
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
    await archiveResult(
      {
        ...params.archiveBase,
        ...(threadId !== undefined ? { threadId } : {}),
      },
      {
        output: '',
        ok: false,
        error: canceled ? 'Task canceled' : err.message,
        errorName: canceled ? 'TaskCanceledError' : err.name,
      },
    )
    throw error
  }
}
