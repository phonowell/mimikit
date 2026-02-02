import { writeJson } from '../fs/json.js'
import { appendLog } from '../log/append.js'
import { appendRunLog } from '../log/run-log.js'
import { logSafeError } from '../log/safe.js'
import { enqueueCommandInLane } from '../process/command-queue.js'
import { CommandLane } from '../process/lanes.js'
import { migrateTask } from '../storage/migrations.js'
import { listItems } from '../storage/queue.js'
import { listTriggers } from '../storage/triggers.js'
import { pickNextTask } from '../tasks/pick.js'
import { PLANNER_RESULT_SCHEMA_VERSION } from '../types/schema.js'

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
  onComplete?: () => void
}): Promise<void> => {
  const queued = await listItems<Task>(params.paths.plannerQueue, migrateTask)
  if (queued.length === 0) return
  if (queued.length >= params.config.scheduler.queueWarnDepth) {
    await appendLog(params.paths.log, {
      event: 'planner_queue_depth',
      depth: queued.length,
    })
  }
  const task = queued.sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  )[0]
  if (!task) return
  const claimed = await claimTask({
    task,
    queueDir: params.paths.plannerQueue,
    runningDir: params.paths.plannerRunning,
  })
  enqueueCommandInLane(
    CommandLane.Planner,
    async () => {
      await appendRunLog(params.paths.taskRuns, claimed.id, {
        action: 'started',
        attempts: claimed.attempts,
        ...(claimed.traceId ? { traceId: claimed.traceId } : {}),
      })
      await appendLog(params.paths.log, {
        event: 'planner_task_started',
        taskId: claimed.id,
      })
      try {
        const plannerResult = await runPlannerTask({
          task: claimed,
          paths: params.paths,
          config: params.config,
        })
        await appendRunLog(params.paths.taskRuns, claimed.id, {
          action: 'finished',
          status: plannerResult.status === 'failed' ? 'error' : 'ok',
          attempts: claimed.attempts,
          ...(claimed.traceId ? { traceId: claimed.traceId } : {}),
        })
      } catch (error) {
        const result = {
          schemaVersion: PLANNER_RESULT_SCHEMA_VERSION,
          id: claimed.id,
          status: 'failed',
          attempts: claimed.attempts,
          error: error instanceof Error ? error.message : String(error),
          traceId: claimed.traceId,
          completedAt: new Date().toISOString(),
        }
        await writeJson(
          `${params.paths.plannerResults}/${claimed.id}.json`,
          result,
        )
        await appendRunLog(params.paths.taskRuns, claimed.id, {
          action: 'finished',
          status: 'error',
          error: result.error,
          attempts: claimed.attempts,
          ...(claimed.traceId ? { traceId: claimed.traceId } : {}),
        })
      } finally {
        await completeTask({
          task: claimed,
          runningDir: params.paths.plannerRunning,
        })
        params.onComplete?.()
      }
    },
    {
      warnAfterMs: 2_000,
      onWait: (waitMs, queuedAhead) =>
        appendLog(params.paths.log, {
          event: 'planner_queue_wait',
          waitMs,
          queuedAhead,
        }),
    },
  ).catch((error) => logEnqueueError('planner', error))
}

const logEnqueueError = (lane: string, error: unknown) =>
  logSafeError('enqueueCommandInLane', error, { meta: { lane } })

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
  onComplete?: () => void
}): Promise<number> => {
  if (params.available <= 0) return 0
  const queued = await listItems<Task>(params.paths.workerQueue, migrateTask)
  if (queued.length === 0) return 0
  if (queued.length >= params.config.scheduler.queueWarnDepth) {
    await appendLog(params.paths.log, {
      event: 'worker_queue_depth',
      depth: queued.length,
    })
  }
  const triggers = await listTriggers(params.paths.triggers)
  const evalIds = evalTriggerIds(triggers)
  let dispatched = 0
  while (dispatched < params.available) {
    const task = pickNextTask(queued, evalIds, {
      agingMs: params.config.scheduler.agingMs,
      agingMaxBoost: params.config.scheduler.agingMaxBoost,
    })
    if (!task) break
    const claimed = await claimTask({
      task,
      queueDir: params.paths.workerQueue,
      runningDir: params.paths.workerRunning,
    })
    queued.splice(queued.indexOf(task), 1)
    enqueueCommandInLane(
      CommandLane.Worker,
      async () => {
        await appendRunLog(params.paths.taskRuns, claimed.id, {
          action: 'started',
          attempts: claimed.attempts,
          ...(claimed.traceId ? { traceId: claimed.traceId } : {}),
          ...(claimed.sourceTriggerId
            ? { sourceTriggerId: claimed.sourceTriggerId }
            : {}),
        })
        await appendLog(params.paths.log, {
          event: 'worker_task_started',
          taskId: claimed.id,
          sourceTriggerId: claimed.sourceTriggerId ?? null,
        })
        const isEval = claimed.sourceTriggerId
          ? evalIds.has(claimed.sourceTriggerId)
          : false
        const timeoutMs = isEval
          ? params.config.timeouts.llmEvalMs
          : params.config.timeouts.workerMs
        const workerResult = await runWorkerTask({
          task: claimed,
          paths: params.paths,
          config: params.config,
          timeoutMs,
        })
        await appendRunLog(params.paths.taskRuns, claimed.id, {
          action: 'finished',
          status: workerResult.status === 'failed' ? 'error' : 'ok',
          ...(workerResult.error ? { error: workerResult.error } : {}),
          ...(workerResult.durationMs !== undefined
            ? { durationMs: workerResult.durationMs }
            : {}),
          attempts: claimed.attempts,
          ...(claimed.traceId ? { traceId: claimed.traceId } : {}),
          ...(claimed.sourceTriggerId
            ? { sourceTriggerId: claimed.sourceTriggerId }
            : {}),
        })
        await completeTask({
          task: claimed,
          runningDir: params.paths.workerRunning,
        })
        params.onComplete?.()
      },
      {
        warnAfterMs: 2_000,
        onWait: (waitMs, queuedAhead) =>
          appendLog(params.paths.log, {
            event: 'worker_queue_wait',
            waitMs,
            queuedAhead,
          }),
      },
    ).catch((error) => logEnqueueError('worker', error))
    dispatched += 1
  }
  return dispatched
}
