import { loadPromptTemplate } from '../prompts/prompt-loader.js'
import { nowIso } from '../shared/utils.js'
import { updateJsonl } from '../storage/jsonl.js'
import {
  compactInputQueueIfFullyConsumed,
  compactResultQueueIfFullyConsumed,
  compactWakeQueueIfFullyConsumed,
} from '../streams/queues.js'

import {
  appendConsumedInputsToHistory,
  appendConsumedResultsToHistory,
} from './history.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { TaskResult, UserInput } from '../types/index.js'

const QUEUE_COMPACT_MIN_PACKETS = 100
const TASK_SNAPSHOT_MAX_COUNT = 100

type TaskSnapshotEvent = {
  id: string
  createdAt: string
  tasks: RuntimeState['tasks']
}

const serializeTasks = (tasks: RuntimeState['tasks']): string =>
  JSON.stringify(tasks)

export const buildFallbackReply = async (params: {
  inputs: UserInput[]
  results: TaskResult[]
}): Promise<string> => {
  const latestInput = params.inputs.at(-1)?.text.trim()
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

const appendTaskSnapshot = async (runtime: RuntimeState): Promise<void> => {
  const snapshot: TaskSnapshotEvent = {
    id: `task-snapshot-${Date.now()}`,
    createdAt: nowIso(),
    tasks: runtime.tasks,
  }
  const nextTasksSerialized = serializeTasks(snapshot.tasks)
  const keepCount = TASK_SNAPSHOT_MAX_COUNT
  await updateJsonl<TaskSnapshotEvent>(runtime.paths.tasksEvents, (current) => {
    const last = current.at(-1)
    if (last && serializeTasks(last.tasks) === nextTasksSerialized)
      return current
    const next = [...current, snapshot]
    if (next.length <= keepCount) return next
    return next.slice(next.length - keepCount)
  })
}

const maybeCompactQueues = async (runtime: RuntimeState): Promise<void> => {
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

  const compactedWakes = await compactWakeQueueIfFullyConsumed({
    paths: runtime.paths,
    cursor: runtime.queues.wakesCursor,
    minPacketsToCompact: QUEUE_COMPACT_MIN_PACKETS,
  })
  if (compactedWakes) runtime.queues.wakesCursor = 0
}

export const finalizeBatchProgress = async (params: {
  runtime: RuntimeState
  nextInputsCursor: number
  nextResultsCursor: number
  nextWakesCursor: number
  consumedInputIds: Set<string>
  persistRuntime: (runtime: RuntimeState) => Promise<void>
}): Promise<void> => {
  const {
    runtime,
    nextInputsCursor,
    nextResultsCursor,
    nextWakesCursor,
    consumedInputIds,
    persistRuntime,
  } = params
  runtime.queues.inputsCursor = nextInputsCursor
  runtime.queues.resultsCursor = nextResultsCursor
  runtime.queues.wakesCursor = nextWakesCursor
  runtime.inflightInputs = runtime.inflightInputs.filter(
    (item) => !consumedInputIds.has(item.id),
  )
  await maybeCompactQueues(runtime)
  await appendTaskSnapshot(runtime)
  await persistRuntime(runtime)
}

export const drainBatchOnFailure = async (params: {
  runtime: RuntimeState
  inputs: UserInput[]
  results: TaskResult[]
  nextInputsCursor: number
  nextResultsCursor: number
  nextWakesCursor: number
  persistRuntime: (runtime: RuntimeState) => Promise<void>
}): Promise<boolean> => {
  const {
    runtime,
    inputs,
    results,
    nextInputsCursor,
    nextResultsCursor,
    nextWakesCursor,
    persistRuntime,
  } = params
  const consumedInputCount = await appendConsumedInputsToHistory(
    runtime.paths.history,
    inputs,
  )
  if (consumedInputCount < inputs.length) return false

  const consumedResultCount = await appendConsumedResultsToHistory(
    runtime.paths.history,
    runtime.tasks,
    results,
  )
  if (consumedResultCount < results.length) return false

  await finalizeBatchProgress({
    runtime,
    nextInputsCursor,
    nextResultsCursor,
    nextWakesCursor,
    consumedInputIds: new Set(inputs.map((item) => item.id)),
    persistRuntime,
  })
  return true
}
