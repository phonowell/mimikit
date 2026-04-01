import { persistRuntimeState } from '../../kernel/orchestrator/runtime-persistence.js'

import { completeSuccessfulManagerBatch } from './batch-success-finalize.js'
import { appendManagerReply } from './loop-batch-flow.js'
import { consumeBatchHistory } from './loop-helpers.js'
import { formatManagerVisibleTaskResultReply } from './task-result-visible-reply.js'

import type { TaskResult, UserInput } from '../../foundation/types/index.js'
import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

const DIRECT_RESULT_REPLY_MAX_CHARS = 1200
const DIRECT_RESULT_REPLY_MAX_LINES = 12

export const resolveDirectTaskResultReply = (params: {
  inputs: UserInput[]
  results: TaskResult[]
}): string | undefined => {
  if (params.inputs.length !== 0 || params.results.length !== 1)
    return undefined
  const result = params.results[0]
  if (!result) return undefined
  const output = result.output.trim()
  if (!result.ok || result.status !== 'succeeded' || output.length === 0)
    return undefined
  if (output.length > DIRECT_RESULT_REPLY_MAX_CHARS) return undefined
  if (output.includes('```')) return undefined
  const lineCount = output.split(/\r?\n/).length
  if (lineCount > DIRECT_RESULT_REPLY_MAX_LINES) return undefined
  return output
}

export const finishBatchWithDirectTaskResultReply = async (params: {
  runtime: ManagerRuntime
  batchId: string
  text: string
  inputs: UserInput[]
  results: TaskResult[]
  nextInputsCursor: number
  nextResultsCursor: number
  startedAt: number
}): Promise<void> => {
  const result = params.results[0]
  const task = result
    ? params.runtime.tasks.find((item) => item.id === result.taskId)
    : undefined
  const replyText = result
    ? formatManagerVisibleTaskResultReply({
        result,
        workDir: params.runtime.config.workDir,
        ...(task ? { task } : {}),
        ...(params.text ? { detail: params.text } : {}),
      })
    : params.text
  const consumed = await consumeBatchHistory({
    runtime: params.runtime,
    inputs: params.inputs,
    results: params.results,
  })
  if (!consumed.ok) throw new Error(consumed.reason)
  await appendManagerReply({
    runtime: params.runtime,
    text: replyText,
    nextInputsCursor: params.nextInputsCursor,
    ...(result?.usage ? { usage: result.usage } : {}),
    ...(result && result.durationMs >= 0
      ? { elapsedMs: result.durationMs }
      : {}),
  })
  await completeSuccessfulManagerBatch({
    runtime: params.runtime,
    batchId: params.batchId,
    nextInputsCursor: params.nextInputsCursor,
    nextResultsCursor: params.nextResultsCursor,
    consumedInputIds: consumed.consumedInputIds,
    persistRuntime: persistRuntimeState,
    startedAt: params.startedAt,
    skippedReason: 'direct_task_result_reply',
  })
}
