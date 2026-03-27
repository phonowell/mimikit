import { relative } from 'node:path'

import { appendTraceArchiveResult } from '../../persistence/storage/traces-archive.js'
import { parseStructuredOutputJson } from '../providers/openai-responses-provider-structured.js'
import { readProviderThreadId } from '../providers/thread-id.js'
import {
  mergeUsageAdditive,
  mergeUsageMonotonic,
} from '../shared/token-usage.js'

import { isAbortLikeError } from './error-utils.js'
import { normalizeWorkerStructuredHandoff } from './result-handoff.js'
import { parseWorkerTurn } from './worker-turn.js'

import type { RunLoopParams } from './profiled-runner-types.js'
import type {
  TaskResultHandoff,
  TokenUsage,
} from '../../foundation/types/index.js'
import type {
  TraceArchiveEntry,
  TraceArchiveResult,
} from '../../persistence/storage/traces-archive.js'
const normalizeThreadId = (
  value: string | null | undefined,
): string | undefined => {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

const toTraceRef = (
  stateDir: string,
  tracePath: string,
): string | undefined => {
  const trimmed = tracePath.trim()
  if (!trimmed) return undefined
  const stateRelative = relative(stateDir, trimmed).replace(/\\/g, '/')
  if (!stateRelative || stateRelative.startsWith('..')) return undefined
  return `.mimikit/${stateRelative}`
}

const attachTraceRef = (
  error: unknown,
  traceRef: string | undefined,
): Error => {
  const next = error instanceof Error ? error : new Error(String(error))
  if (traceRef) Reflect.set(next, 'traceRef', traceRef)
  return next
}

export const runWorkerLoop = async (
  params: RunLoopParams,
): Promise<{
  output: string
  handoff: TaskResultHandoff
  elapsedMs: number
  usage?: TokenUsage
  traceRef?: string
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
    let parsedTurn: ReturnType<typeof parseWorkerTurn> | undefined
    try {
      parsedTurn = parseWorkerTurn(
        result.outputJson ?? parseStructuredOutputJson(output),
      )
    } catch {
      parsedTurn = undefined
    }
    if (!parsedTurn) {
      throw new Error(
        `[worker] task incomplete after single run: missing structured result {reply,handoff}; last_output=${JSON.stringify(output || 'empty_output')}`,
      )
    }
    const finalOutput = parsedTurn.reply.trim()
    const handoff = normalizeWorkerStructuredHandoff({
      task: params.task,
      handoff: parsedTurn.handoff,
    })
    const tracePath = await archiveResult(
      { ...params.archiveBase, threadId },
      {
        output: finalOutput,
        ok: true,
        elapsedMs: result.elapsedMs,
        ...(totalUsage ? { usage: totalUsage } : {}),
      },
    )
    const traceRef = tracePath ? toTraceRef(stateDir, tracePath) : undefined
    return {
      output: finalOutput,
      handoff,
      elapsedMs: result.elapsedMs,
      ...(totalUsage ? { usage: totalUsage } : {}),
      ...(traceRef ? { traceRef } : {}),
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
    const tracePath = await archiveResult(
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
    throw attachTraceRef(
      error,
      tracePath ? toTraceRef(stateDir, tracePath) : undefined,
    )
  }
}
