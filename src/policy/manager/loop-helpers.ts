import { loadPromptTemplate } from '../../foundation/prompting/prompt-loader.js'
import { nowIso } from '../../foundation/shared/utils.js'
import {
  compactInputQueueIfFullyConsumed,
  compactResultQueueIfFullyConsumed,
} from '../../kernel/streams/queues.js'
import {
  appendConsumedInputsToHistory,
  appendConsumedResultsToHistory,
} from '../../persistence/history/result-events.js'
import { updateJsonl } from '../../persistence/storage/jsonl.js'

import {
  buildManagerVisibleTaskResultArtifacts,
  formatManagerVisibleTaskResultReply,
} from './task-result-visible-reply.js'

import type { TaskResult, UserInput } from '../../foundation/types/index.js'
import type {
  ManagerRuntime,
  RuntimeTaskCollection,
} from '../../kernel/orchestrator/runtime-interfaces.js'
import type { SurfaceArtifactLink } from '../../surface/shared/artifact-link.js'

const QUEUE_COMPACT_MIN_PACKETS = 100
const TASK_SNAPSHOT_MAX_COUNT = 100

const resolveLatestResult = (results: TaskResult[]): TaskResult | undefined => {
  if (results.length === 0) return undefined
  const sorted = [...results].sort((left, right) => {
    if (left.completedAt !== right.completedAt)
      return right.completedAt.localeCompare(left.completedAt)
    return left.taskId.localeCompare(right.taskId)
  })
  return sorted[0]
}

const resolveFallbackResultDetail = (
  result: TaskResult,
): string | undefined => {
  const handoffSummary = result.handoff?.summary?.trim()
  if (handoffSummary) return handoffSummary
  return undefined
}

const buildFallbackResultReply = (params: {
  results: TaskResult[]
  tasks: RuntimeTaskCollection
  workDir: string
}):
  | { text: string; artifacts?: SurfaceArtifactLink[] | undefined }
  | undefined => {
  const latestResult = resolveLatestResult(params.results)
  if (!latestResult) return undefined
  const task = params.tasks.find((item) => item.id === latestResult.taskId)
  const detail = resolveFallbackResultDetail(latestResult)
  const text = formatManagerVisibleTaskResultReply({
    result: latestResult,
    workDir: params.workDir,
    ...(task ? { task } : {}),
    ...(detail ? { detail } : {}),
  })
  const artifacts = buildManagerVisibleTaskResultArtifacts({
    result: latestResult,
    workDir: params.workDir,
    ...(task ? { task } : {}),
  })
  return artifacts ? { text, artifacts } : { text }
}

export const buildFallbackReply = async (params: {
  results: TaskResult[]
  tasks: RuntimeTaskCollection
  workDir: string
}): Promise<{
  text: string
  artifacts?: SurfaceArtifactLink[] | undefined
}> => {
  const resultReply = buildFallbackResultReply({
    results: params.results,
    tasks: params.tasks,
    workDir: params.workDir,
  })
  if (resultReply) return resultReply
  const fallback = (
    await loadPromptTemplate('manager/fallback-reply.md')
  ).trim()
  if (!fallback)
    throw new Error('missing_prompt_template:manager/fallback-reply.md')
  return { text: fallback }
}

export const finalizeBatchProgress = async (params: {
  runtime: ManagerRuntime
  nextInputsCursor: number
  nextResultsCursor: number
  consumedInputIds: Set<string>
  persistRuntime: (runtime: ManagerRuntime) => Promise<void>
}): Promise<void> => {
  const {
    runtime,
    nextInputsCursor,
    nextResultsCursor,
    consumedInputIds,
    persistRuntime,
  } = params
  runtime.domain.queues.inputsCursor = nextInputsCursor
  runtime.domain.queues.resultsCursor = nextResultsCursor
  runtime.process.session.inflightInputs =
    runtime.process.session.inflightInputs.filter(
      (item) => !consumedInputIds.has(item.id),
    )
  const compactedInputs = await compactInputQueueIfFullyConsumed({
    paths: runtime.paths,
    cursor: runtime.domain.queues.inputsCursor,
    minPacketsToCompact: QUEUE_COMPACT_MIN_PACKETS,
  })
  if (compactedInputs) runtime.domain.queues.inputsCursor = 0

  const compactedResults = await compactResultQueueIfFullyConsumed({
    paths: runtime.paths,
    cursor: runtime.domain.queues.resultsCursor,
    minPacketsToCompact: QUEUE_COMPACT_MIN_PACKETS,
  })
  if (compactedResults) runtime.domain.queues.resultsCursor = 0

  const snapshot = {
    id: `task-snapshot-${Date.now()}`,
    createdAt: nowIso(),
    tasks: runtime.domain.tasks,
  }
  const nextTasksSerialized = JSON.stringify(snapshot.tasks)
  await updateJsonl<typeof snapshot>(runtime.paths.tasksEvents, (current) => {
    const last = current.at(-1)
    if (last && JSON.stringify(last.tasks) === nextTasksSerialized)
      return current
    const next = [...current, snapshot]
    return next.length <= TASK_SNAPSHOT_MAX_COUNT
      ? next
      : next.slice(next.length - TASK_SNAPSHOT_MAX_COUNT)
  })
  await persistRuntime(runtime)
}

export const consumeBatchHistory = async (params: {
  runtime: ManagerRuntime
  inputs: UserInput[]
  results: TaskResult[]
  summaries?: Map<string, string>
}): Promise<
  | { ok: true; consumedInputIds: Set<string> }
  | {
      ok: false
      reason:
        | 'append_consumed_inputs_incomplete'
        | 'append_consumed_results_incomplete'
    }
> => {
  const consumedInputs = await consumeBatchInputsHistory({
    runtime: params.runtime,
    inputs: params.inputs,
  })
  if (!consumedInputs.ok) return consumedInputs

  const consumedResultCount = await appendConsumedResultsToHistory(
    params.runtime.paths.history,
    params.runtime.domain.tasks,
    params.results,
    params.summaries,
  )
  if (consumedResultCount < params.results.length)
    return { ok: false, reason: 'append_consumed_results_incomplete' }

  return { ok: true, consumedInputIds: consumedInputs.consumedInputIds }
}

export const consumeBatchInputsHistory = async (params: {
  runtime: ManagerRuntime
  inputs: UserInput[]
}): Promise<
  | { ok: true; consumedInputIds: Set<string> }
  | { ok: false; reason: 'append_consumed_inputs_incomplete' }
> => {
  const consumedInputIds = new Set(params.inputs.map((item) => item.id))
  const consumedInputCount = await appendConsumedInputsToHistory(
    params.runtime.paths.history,
    params.inputs,
  )
  if (consumedInputCount < params.inputs.length)
    return { ok: false, reason: 'append_consumed_inputs_incomplete' }
  return { ok: true, consumedInputIds }
}
