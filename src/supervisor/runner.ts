import { join } from 'node:path'

import { writeJson } from '../fs/json.js'
import { extractPlannerResult } from '../llm/output.js'
import { appendLog } from '../log/append.js'
import { writeLlmOutput } from '../log/llm-output.js'
import { selectHistory } from '../memory/inject.js'
import { extractKeywords } from '../memory/keywords.js'
import { searchMemory } from '../memory/search.js'
import { runPlanner, runTeller, runWorker } from '../roles/runner.js'
import { readHistory } from '../storage/history.js'
import { readInbox, removeInboxItems } from '../storage/inbox.js'
import { migrateTask } from '../storage/migrations.js'
import { claimItem, removeItem, writeItem } from '../storage/queue.js'
import {
  readTellerInbox,
  removeTellerInboxItems,
} from '../storage/teller-inbox.js'
import { nowIso } from '../time.js'
import {
  PLANNER_RESULT_SCHEMA_VERSION,
  WORKER_RESULT_SCHEMA_VERSION,
} from '../types/schema.js'

import type { SupervisorConfig } from '../config.js'
import type { StatePaths } from '../fs/paths.js'
import type { MemoryHit } from '../memory/search.js'
import type { HistoryMessage } from '../types/history.js'
import type { PlannerResult, Task, WorkerResult } from '../types/tasks.js'

const toRunningPath = (dir: string, id: string): string =>
  join(dir, `${id}.json`)

export const claimTask = async (params: {
  task: Task
  queueDir: string
  runningDir: string
}) => {
  const claimed = await claimItem<Task>(
    {
      queueDir: params.queueDir,
      runningDir: params.runningDir,
      id: params.task.id,
      update: (item) => ({ ...item, attempts: item.attempts + 1 }),
    },
    migrateTask,
  )
  if (!claimed) {
    const updated = { ...params.task, attempts: params.task.attempts + 1 }
    await writeItem(params.runningDir, updated.id, updated)
    await removeItem(join(params.queueDir, `${params.task.id}.json`))
    return updated
  }
  return claimed
}

export const completeTask = async (params: {
  task: Task
  runningDir: string
}) => {
  await removeItem(join(params.runningDir, `${params.task.id}.json`))
}

export const runPlannerTask = async (params: {
  task: Task
  paths: StatePaths
  config: SupervisorConfig
}): Promise<PlannerResult> => {
  const injectContext = true
  let messages: HistoryMessage[] = []
  let memoryHits: MemoryHit[] = []
  const history = await readHistory(params.paths.history)
  messages = selectHistory({ history, budget: 4096, min: 5, max: 20 })
  const keywords = extractKeywords(messages.map((m) => m.text))
  memoryHits = keywords.length
    ? await searchMemory({
        stateDir: params.paths.root,
        query: keywords.join(' '),
        limit: params.config.memorySearch.maxHits,
        k1: params.config.memorySearch.bm25K1,
        b: params.config.memorySearch.bm25B,
        minScore: params.config.memorySearch.minScore,
      })
    : []

  const plannerParams = {
    ctx: {
      role: 'planner' as const,
      paths: params.paths,
      workDir: params.config.workDir,
      now: new Date(),
    },
    history: messages,
    memory: memoryHits,
    request: params.task.prompt,
    timeoutMs: params.config.timeouts.plannerMs,
    injectContext,
    ...(params.config.model ? { model: params.config.model } : {}),
  }

  const result = await runPlanner(plannerParams)
  const outputPath = await writeLlmOutput({
    dir: params.paths.llmDir,
    role: 'planner',
    taskId: params.task.id,
    output: result.rawOutput,
  })
  await appendLog(params.paths.log, {
    event: 'llm_activity',
    role: 'planner',
    taskId: params.task.id,
    outputPath,
    elapsedMs: result.elapsedMs,
    ...(result.usage ? { usage: result.usage } : {}),
  })

  const parsed = extractPlannerResult(result.output)
  const plannerOutputInvalid = !parsed
  const plannerFallbackEnabled = process.env.MIMIKIT_PLANNER_FALLBACK === '1'
  if (plannerOutputInvalid) {
    await appendLog(params.paths.log, {
      event: 'planner_output_invalid',
      taskId: params.task.id,
      fallbackEnabled: plannerFallbackEnabled,
    })
  }

  let status: PlannerResult['status'] = parsed?.status ?? 'done'
  const question = parsed?.question
  const options = parsed?.options
  const def = parsed?.default
  const fallbackTasks =
    plannerOutputInvalid && plannerFallbackEnabled
      ? [
          {
            prompt: params.task.prompt,
            priority: params.task.priority,
            timeout: params.task.timeout ?? null,
            ...(params.task.traceId ? { traceId: params.task.traceId } : {}),
            parentTaskId: params.task.id,
          },
        ]
      : undefined
  const tasks =
    parsed && Array.isArray(parsed.tasks) ? parsed.tasks : fallbackTasks
  const triggers =
    parsed && Array.isArray(parsed.triggers) ? parsed.triggers : undefined
  let error = parsed?.error

  if (status === 'needs_input' && !question) {
    status = 'failed'
    error = 'needs_input missing question'
  }
  if (status === 'failed' && !error) error = 'planner failed'

  const plannerResult: PlannerResult = {
    schemaVersion: PLANNER_RESULT_SCHEMA_VERSION,
    id: params.task.id,
    status,
    attempts: params.task.attempts,
    completedAt: nowIso(),
    ...(params.task.traceId ? { traceId: params.task.traceId } : {}),
    ...(question ? { question } : {}),
    ...(options ? { options } : {}),
    ...(def ? { default: def } : {}),
    ...(error ? { error } : {}),
    ...(tasks ? { tasks } : {}),
    ...(triggers ? { triggers } : {}),
  }
  await writeJson(
    toRunningPath(params.paths.plannerResults, params.task.id),
    plannerResult,
  )
  return plannerResult
}

export const runWorkerTask = async (params: {
  task: Task
  paths: StatePaths
  config: SupervisorConfig
  timeoutMs: number
}): Promise<WorkerResult> => {
  const startedAt = Date.now()
  const taskSnapshot = {
    prompt: params.task.prompt,
    priority: params.task.priority,
    createdAt: params.task.createdAt,
    timeout: params.task.timeout ?? null,
    ...(params.task.traceId ? { traceId: params.task.traceId } : {}),
    ...(params.task.parentTaskId
      ? { parentTaskId: params.task.parentTaskId }
      : {}),
    ...(params.task.sourceTriggerId
      ? { sourceTriggerId: params.task.sourceTriggerId }
      : {}),
    ...(params.task.triggeredAt
      ? { triggeredAt: params.task.triggeredAt }
      : {}),
  }
  try {
    const workerParams = {
      workDir: params.config.workDir,
      taskPrompt: params.task.prompt,
      timeoutMs: params.timeoutMs,
      logPath: params.paths.log,
      logContext: {
        taskId: params.task.id,
        ...(params.task.traceId ? { traceId: params.task.traceId } : {}),
        ...(params.task.sourceTriggerId
          ? { sourceTriggerId: params.task.sourceTriggerId }
          : {}),
      },
      ...(params.config.model ? { model: params.config.model } : {}),
    }
    const llmResult = await runWorker(workerParams)
    const outputPath = await writeLlmOutput({
      dir: params.paths.llmDir,
      role: 'worker',
      taskId: params.task.id,
      output: llmResult.output,
    })
    await appendLog(params.paths.log, {
      event: 'llm_activity',
      role: 'worker',
      taskId: params.task.id,
      outputPath,
      elapsedMs: llmResult.elapsedMs,
      ...(llmResult.usage ? { usage: llmResult.usage } : {}),
    })
    const result: WorkerResult = {
      schemaVersion: WORKER_RESULT_SCHEMA_VERSION,
      id: params.task.id,
      status: 'done',
      resultType: 'text',
      result: llmResult.output,
      attempts: params.task.attempts,
      startedAt: nowIso(),
      completedAt: nowIso(),
      durationMs: Math.max(0, Date.now() - startedAt),
      task: taskSnapshot,
      ...(params.task.traceId ? { traceId: params.task.traceId } : {}),
      ...(params.task.sourceTriggerId
        ? { sourceTriggerId: params.task.sourceTriggerId }
        : {}),
    }
    await writeJson(
      toRunningPath(params.paths.workerResults, params.task.id),
      result,
    )
    return result
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    const trimmedStack = err.stack
      ? err.stack.split(/\r?\n/).slice(0, 6).join('\n')
      : undefined
    const failureReason =
      (error instanceof Error && /timed out/i.test(error.message)) ||
      err.name === 'AbortError' ||
      /aborted/i.test(err.message)
        ? 'timeout'
        : 'error'
    await appendLog(params.paths.log, {
      event: 'llm_error',
      role: 'worker',
      error: err.message,
      errorName: err.name,
      ...(trimmedStack ? { errorStack: trimmedStack } : {}),
      aborted: failureReason === 'timeout',
      elapsedMs: Math.max(0, Date.now() - startedAt),
      timeoutMs: params.timeoutMs,
      promptChars: params.task.prompt.length,
      promptLines: params.task.prompt.split(/\r?\n/).length,
      ...(params.config.model ? { model: params.config.model } : {}),
      ...(params.task.traceId ? { traceId: params.task.traceId } : {}),
      ...(params.task.sourceTriggerId
        ? { sourceTriggerId: params.task.sourceTriggerId }
        : {}),
    }).catch(() => undefined)
    const result: WorkerResult = {
      schemaVersion: WORKER_RESULT_SCHEMA_VERSION,
      id: params.task.id,
      status: 'failed',
      resultType: 'analysis',
      result: err.message,
      attempts: params.task.attempts,
      failureReason,
      completedAt: nowIso(),
      durationMs: Math.max(0, Date.now() - startedAt),
      task: taskSnapshot,
      ...(params.task.traceId ? { traceId: params.task.traceId } : {}),
      ...(params.task.sourceTriggerId
        ? { sourceTriggerId: params.task.sourceTriggerId }
        : {}),
    }
    await writeJson(
      toRunningPath(params.paths.workerResults, params.task.id),
      result,
    )
    return result
  }
}

export const runTellerSession = async (params: {
  paths: StatePaths
  config: SupervisorConfig
}) => {
  const [inbox, tellerInbox] = await Promise.all([
    readInbox(params.paths.inbox),
    readTellerInbox(params.paths.tellerInbox),
  ])
  if (inbox.length === 0 && tellerInbox.length === 0) return
  await appendLog(params.paths.log, {
    event: 'teller_session',
    inputs: inbox.length,
    events: tellerInbox.length,
  })
  const injectContext = true
  let messages: HistoryMessage[] = []
  let memoryHits: MemoryHit[] = []
  const history = await readHistory(params.paths.history)
  messages = selectHistory({ history, budget: 4096, min: 5, max: 20 })
  const keywords = extractKeywords([
    ...inbox.map((i) => i.text),
    ...messages.slice(-5).map((m) => m.text),
  ])
  memoryHits = keywords.length
    ? await searchMemory({
        stateDir: params.paths.root,
        query: keywords.join(' '),
        limit: params.config.memorySearch.maxHits,
        k1: params.config.memorySearch.bm25K1,
        b: params.config.memorySearch.bm25B,
        minScore: params.config.memorySearch.minScore,
      })
    : []

  const tellerParams = {
    ctx: {
      role: 'teller' as const,
      paths: params.paths,
      workDir: params.config.workDir,
      now: new Date(),
    },
    history: messages,
    memory: memoryHits,
    inputs: inbox.map((i) => i.text),
    events: tellerInbox,
    timeoutMs: params.config.timeouts.tellerMs,
    injectContext,
    ...(params.config.model ? { model: params.config.model } : {}),
  }

  await runTeller(tellerParams)

  await removeInboxItems(
    params.paths.inbox,
    inbox.map((i) => i.id),
  )
  await removeTellerInboxItems(
    params.paths.tellerInbox,
    tellerInbox.map((i) => i.id),
  )
}
