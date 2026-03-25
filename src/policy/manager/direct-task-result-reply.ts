import { persistRuntimeState } from '../../kernel/orchestrator/runtime-persistence.js'
import { appendLog } from '../../persistence/log/append.js'
import { requestMemoryRefresh } from '../memory/refresh/singleflight.js'

import { appendManagerReply } from './loop-batch-flow.js'
import { consumeBatchHistory, finalizeBatchProgress } from './loop-helpers.js'
import { clearResultReplayBackoff } from './result-replay-backoff.js'

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
  text: string
  inputs: UserInput[]
  results: TaskResult[]
  nextInputsCursor: number
  nextResultsCursor: number
  startedAt: number
}): Promise<void> => {
  const consumed = await consumeBatchHistory({
    runtime: params.runtime,
    inputs: params.inputs,
    results: params.results,
  })
  if (!consumed.ok) throw new Error(consumed.reason)
  await appendManagerReply({
    runtime: params.runtime,
    text: params.text,
    nextInputsCursor: params.nextInputsCursor,
  })
  await finalizeBatchProgress({
    runtime: params.runtime,
    nextInputsCursor: params.nextInputsCursor,
    nextResultsCursor: params.nextResultsCursor,
    consumedInputIds: consumed.consumedInputIds,
    persistRuntime: persistRuntimeState,
  })
  clearResultReplayBackoff(params.runtime)
  await appendLog(params.runtime.paths.log, {
    event: 'manager_end',
    status: 'ok',
    elapsedMs: Math.max(0, Date.now() - params.startedAt),
    skippedReason: 'direct_task_result_reply',
  })
  requestMemoryRefresh(params.runtime)
}
