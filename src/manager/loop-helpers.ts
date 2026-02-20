import { loadPromptTemplate } from '../prompts/prompt-loader.js'
import { nowIso } from '../shared/utils.js'
import { updateJsonl } from '../storage/jsonl.js'
import {
  compactInputQueueIfFullyConsumed,
  compactResultQueueIfFullyConsumed,
} from '../streams/queues.js'

import {
  appendConsumedInputsToHistory,
  appendConsumedResultsToHistory,
} from './history.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { TaskResult, UserInput } from '../types/index.js'

const QUEUE_COMPACT_MIN_PACKETS = 100
const TASK_SNAPSHOT_MAX_COUNT = 100

export const buildFallbackReply = async (params: {
  inputs: UserInput[]
  results: TaskResult[]
}): Promise<string> => {
  const latestInput = [...params.inputs]
    .reverse()
    .find((item) => item.role === 'user')
    ?.text.trim()
  if (latestInput) return latestInput
  const latestResult = params.results.at(-1)?.output.trim()
  if (latestResult) return latestResult
  const fallback = (
    await loadPromptTemplate('manager/fallback-reply.md')
  ).trim()
  if (!fallback)
    throw new Error('missing_prompt_template:manager/fallback-reply.md')
  return fallback
}

export const finalizeBatchProgress = async (params: {
  runtime: RuntimeState
  nextInputsCursor: number
  nextResultsCursor: number
  consumedInputIds: Set<string>
  persistRuntime: (runtime: RuntimeState) => Promise<void>
}): Promise<void> => {
  const {
    runtime,
    nextInputsCursor,
    nextResultsCursor,
    consumedInputIds,
    persistRuntime,
  } = params
  runtime.queues.inputsCursor = nextInputsCursor
  runtime.queues.resultsCursor = nextResultsCursor
  runtime.inflightInputs = runtime.inflightInputs.filter(
    (item) => !consumedInputIds.has(item.id),
  )
  const compactedInputs = await compactInputQueueIfFullyConsumed({
    paths: runtime.paths,
    cursor: runtime.queues.inputsCursor,
    minPacketsToCompact: QUEUE_COMPACT_MIN_PACKETS,
  })
  if (compactedInputs) runtime.queues.inputsCursor = 0

  const compactedResults = await compactResultQueueIfFullyConsumed({
    paths: runtime.paths,
    cursor: runtime.queues.resultsCursor,
    minPacketsToCompact: QUEUE_COMPACT_MIN_PACKETS,
  })
  if (compactedResults) runtime.queues.resultsCursor = 0

  const snapshot = {
    id: `task-snapshot-${Date.now()}`,
    createdAt: nowIso(),
    tasks: runtime.tasks,
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
  runtime: RuntimeState
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
  const consumedInputIds = new Set(params.inputs.map((item) => item.id))
  const consumedInputCount = await appendConsumedInputsToHistory(
    params.runtime.paths.history,
    params.inputs,
  )
  if (consumedInputCount < params.inputs.length)
    return { ok: false, reason: 'append_consumed_inputs_incomplete' }

  const consumedResultCount = await appendConsumedResultsToHistory(
    params.runtime.paths.history,
    params.runtime.tasks,
    params.results,
    params.summaries,
  )
  if (consumedResultCount < params.results.length)
    return { ok: false, reason: 'append_consumed_results_incomplete' }

  return { ok: true, consumedInputIds }
}
