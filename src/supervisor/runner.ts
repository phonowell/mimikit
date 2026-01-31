import { join } from 'node:path'

import { writeJson } from '../fs/json.js'
import { extractPlannerResult } from '../llm/output.js'
import { appendLog } from '../log/append.js'
import { selectHistory } from '../memory/inject.js'
import { extractKeywords } from '../memory/keywords.js'
import { searchMemory } from '../memory/search.js'
import { runPlanner, runTeller, runWorker } from '../roles/runner.js'
import { readHistory } from '../storage/history.js'
import { readInbox, removeInboxItems } from '../storage/inbox.js'
import { removeItem, writeItem } from '../storage/queue.js'
import {
  readTellerInbox,
  removeTellerInboxItems,
} from '../storage/teller-inbox.js'
import { nowIso } from '../time.js'

import type { SupervisorConfig } from '../config.js'
import type { StatePaths } from '../fs/paths.js'
import type { PlannerResult, Task, WorkerResult } from '../types/tasks.js'

const toRunningPath = (dir: string, id: string): string =>
  join(dir, `${id}.json`)

export const claimTask = async (params: {
  task: Task
  queueDir: string
  runningDir: string
}) => {
  const updated = { ...params.task, attempts: params.task.attempts + 1 }
  await writeItem(params.runningDir, updated.id, updated)
  await removeItem(join(params.queueDir, `${params.task.id}.json`))
  return updated
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
}) => {
  const history = await readHistory(params.paths.history)
  const messages = selectHistory({ history, budget: 4096, min: 5, max: 20 })
  const keywords = extractKeywords(messages.map((m) => m.text))
  const memoryHits = keywords.length
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
    ...(params.config.model ? { model: params.config.model } : {}),
  }

  const result = await runPlanner(plannerParams)
  await appendLog(params.paths.log, {
    event: 'llm_activity',
    role: 'planner',
    taskId: params.task.id,
    elapsedMs: result.elapsedMs,
    ...(result.usage ? { usage: result.usage } : {}),
  })

  const parsed = extractPlannerResult(result.output)
  let status: PlannerResult['status'] = parsed?.status ?? 'done'
  const question = parsed?.question
  const options = parsed?.options
  const def = parsed?.default
  const tasks = parsed && Array.isArray(parsed.tasks) ? parsed.tasks : undefined
  const triggers =
    parsed && Array.isArray(parsed.triggers) ? parsed.triggers : undefined
  let error = parsed?.error

  if (status === 'needs_input' && !question) {
    status = 'failed'
    error = 'needs_input missing question'
  }
  if (status === 'failed' && !error) error = 'planner failed'

  const plannerResult: PlannerResult = {
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
  return result
}

export const runWorkerTask = async (params: {
  task: Task
  paths: StatePaths
  config: SupervisorConfig
  timeoutMs: number
}) => {
  const startedAt = Date.now()
  try {
    const workerParams = {
      workDir: params.config.workDir,
      taskPrompt: params.task.prompt,
      timeoutMs: params.timeoutMs,
      ...(params.config.model ? { model: params.config.model } : {}),
    }
    const llmResult = await runWorker(workerParams)
    await appendLog(params.paths.log, {
      event: 'llm_activity',
      role: 'worker',
      taskId: params.task.id,
      elapsedMs: llmResult.elapsedMs,
      ...(llmResult.usage ? { usage: llmResult.usage } : {}),
    })
    const result: WorkerResult = {
      id: params.task.id,
      status: 'done',
      resultType: 'text',
      result: llmResult.output,
      attempts: params.task.attempts,
      startedAt: nowIso(),
      completedAt: nowIso(),
      durationMs: Math.max(0, Date.now() - startedAt),
      ...(params.task.traceId ? { traceId: params.task.traceId } : {}),
      ...(params.task.sourceTriggerId
        ? { sourceTriggerId: params.task.sourceTriggerId }
        : {}),
    }
    await writeJson(
      toRunningPath(params.paths.workerResults, params.task.id),
      result,
    )
  } catch (error) {
    const failureReason =
      error instanceof Error && /timed out/i.test(error.message)
        ? 'timeout'
        : 'error'
    const result: WorkerResult = {
      id: params.task.id,
      status: 'failed',
      resultType: 'analysis',
      result: error instanceof Error ? error.message : String(error),
      attempts: params.task.attempts,
      failureReason,
      completedAt: nowIso(),
      durationMs: Math.max(0, Date.now() - startedAt),
      ...(params.task.traceId ? { traceId: params.task.traceId } : {}),
      ...(params.task.sourceTriggerId
        ? { sourceTriggerId: params.task.sourceTriggerId }
        : {}),
    }
    await writeJson(
      toRunningPath(params.paths.workerResults, params.task.id),
      result,
    )
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
  const history = await readHistory(params.paths.history)
  const messages = selectHistory({ history, budget: 4096, min: 5, max: 20 })
  const keywords = extractKeywords([
    ...inbox.map((i) => i.text),
    ...messages.slice(-5).map((m) => m.text),
  ])
  const memoryHits = keywords.length
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
