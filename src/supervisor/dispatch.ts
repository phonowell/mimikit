import { writeJson } from '../fs/json.js'
import { appendLog } from '../log/append.js'
import { listItems } from '../storage/queue.js'
import { listTriggers } from '../storage/triggers.js'
import { pickNextTask } from '../tasks/pick.js'

import {
  claimTask,
  completeTask,
  runPlannerTask,
  runWorkerTask,
} from './runner.js'

import type { SupervisorConfig } from '../config.js'
import type { StatePaths } from '../fs/paths.js'
import type { Task, Trigger } from '../types/tasks.js'

export const dispatchPlanner = async (params: {
  paths: StatePaths
  config: SupervisorConfig
}): Promise<void> => {
  const queued = await listItems<Task>(params.paths.plannerQueue)
  if (queued.length === 0) return
  const task = queued.sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  )[0]
  if (!task) return
  const claimed = await claimTask({
    task,
    queueDir: params.paths.plannerQueue,
    runningDir: params.paths.plannerRunning,
  })
  await appendLog(params.paths.log, {
    event: 'planner_task_started',
    taskId: claimed.id,
  })
  try {
    await runPlannerTask({
      task: claimed,
      paths: params.paths,
      config: params.config,
    })
  } catch (error) {
    const result = {
      id: claimed.id,
      status: 'failed',
      attempts: claimed.attempts,
      error: error instanceof Error ? error.message : String(error),
      traceId: claimed.traceId,
      completedAt: new Date().toISOString(),
    }
    await writeJson(`${params.paths.plannerResults}/${claimed.id}.json`, result)
  } finally {
    await completeTask({
      task: claimed,
      runningDir: params.paths.plannerRunning,
    })
  }
}

const evalTriggerIds = (triggers: Trigger[]): Set<string> => {
  const ids = new Set<string>()
  for (const trigger of triggers)
    if (trigger.condition?.type === 'llm_eval') ids.add(trigger.id)

  return ids
}

export const dispatchWorker = async (params: {
  paths: StatePaths
  config: SupervisorConfig
  available: number
}): Promise<number> => {
  if (params.available <= 0) return 0
  const queued = await listItems<Task>(params.paths.workerQueue)
  if (queued.length === 0) return 0
  const triggers = await listTriggers(params.paths.triggers)
  const evalIds = evalTriggerIds(triggers)
  let dispatched = 0
  while (dispatched < params.available) {
    const task = pickNextTask(queued, evalIds)
    if (!task) break
    const claimed = await claimTask({
      task,
      queueDir: params.paths.workerQueue,
      runningDir: params.paths.workerRunning,
    })
    await appendLog(params.paths.log, {
      event: 'worker_task_started',
      taskId: claimed.id,
      sourceTriggerId: claimed.sourceTriggerId ?? null,
    })
    queued.splice(queued.indexOf(task), 1)
    const isEval = claimed.sourceTriggerId
      ? evalIds.has(claimed.sourceTriggerId)
      : false
    const timeoutMs = isEval
      ? params.config.timeouts.llmEvalMs
      : params.config.timeouts.workerMs
    await runWorkerTask({
      task: claimed,
      paths: params.paths,
      config: params.config,
      timeoutMs,
    })
    await completeTask({
      task: claimed,
      runningDir: params.paths.workerRunning,
    })
    dispatched += 1
  }
  return dispatched
}
