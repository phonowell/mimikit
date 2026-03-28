import { persistRuntimeState } from '../../kernel/orchestrator/runtime-persistence.js'
import { toDisplayPath } from '../../surface/shared/path-display.js'

import { completeSuccessfulManagerBatch } from './batch-success-finalize.js'
import { appendManagerReply } from './loop-batch-flow.js'
import { consumeBatchHistory } from './loop-helpers.js'

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

const appendArchiveLine = (
  runtime: ManagerRuntime,
  result: TaskResult | undefined,
  text: string,
): string => {
  if (!result) return text
  const task = runtime.tasks.find((item) => item.id === result.taskId)
  const rawArchivePath = [
    result.archivePath,
    task?.archivePath,
    task?.result?.archivePath,
  ].find((value) => typeof value === 'string' && value.trim().length > 0)
  const archivePath = rawArchivePath
    ? toDisplayPath(rawArchivePath, runtime.config.workDir).trim()
    : ''
  return archivePath
    ? `${text}\n[任务归档](${archivePath})`
    : `${text}\n任务归档: 未生成`
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
  const replyText = appendArchiveLine(
    params.runtime,
    params.results[0],
    params.text,
  )
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
  })
  await completeSuccessfulManagerBatch({
    runtime: params.runtime,
    nextInputsCursor: params.nextInputsCursor,
    nextResultsCursor: params.nextResultsCursor,
    consumedInputIds: consumed.consumedInputIds,
    persistRuntime: persistRuntimeState,
    startedAt: params.startedAt,
    skippedReason: 'direct_task_result_reply',
  })
}
