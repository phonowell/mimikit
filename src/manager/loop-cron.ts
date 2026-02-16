import { Cron } from 'croner'

import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { notifyManagerLoop } from '../orchestrator/core/manager-signal.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import { enqueueTask } from '../orchestrator/core/task-state.js'
import { notifyWorkerLoop } from '../orchestrator/core/worker-signal.js'
import { appendTaskSystemMessage } from '../orchestrator/read-model/task-history.js'
import { enqueueWorkerTask } from '../worker/dispatch.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'

const matchCronNow = (expression: string, at: Date = new Date()): boolean =>
  new Cron(expression).match(at)

const cronHasNextRun = (expression: string): boolean => {
  try {
    return new Cron(expression).nextRun() !== null
  } catch {
    return false
  }
}

const asSecondStamp = (iso: string): string => iso.slice(0, 19)
const CRON_TICK_MS = 1_000

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

type CronCheckResult = {
  triggeredCount: number
}

export const checkCronJobs = async (
  runtime: RuntimeState,
): Promise<CronCheckResult> => {
  if (runtime.cronJobs.length === 0) return { triggeredCount: 0 }

  const now = new Date()
  const nowAtIso = now.toISOString()
  const nowSecond = asSecondStamp(nowAtIso)

  let stateChanged = false
  let triggeredCount = 0
  for (const cronJob of runtime.cronJobs) {
    if (!cronJob.enabled) continue

    if (cronJob.scheduledAt) {
      const scheduledMs = Date.parse(cronJob.scheduledAt)
      if (!Number.isFinite(scheduledMs) || now.getTime() < scheduledMs) continue
      if (cronJob.lastTriggeredAt) continue

      cronJob.lastTriggeredAt = nowAtIso
      cronJob.enabled = false
      cronJob.disabledReason = 'completed'
      stateChanged = true

      const { task, created } = enqueueTask(
        runtime.tasks,
        cronJob.prompt,
        cronJob.title,
        cronJob.profile,
        cronJob.scheduledAt,
      )
      if (!created) continue
      triggeredCount += 1

      task.cron = cronJob.scheduledAt
      await appendTaskSystemMessage(runtime.paths.history, 'created', task, {
        createdAt: task.createdAt,
      })
      enqueueWorkerTask(runtime, task)
      notifyWorkerLoop(runtime)
      continue
    }

    if (!cronJob.cron) continue
    if (
      cronJob.lastTriggeredAt &&
      asSecondStamp(cronJob.lastTriggeredAt) === nowSecond
    )
      continue

    let matched = false
    try {
      matched = matchCronNow(cronJob.cron, now)
    } catch (error) {
      await bestEffort('appendLog: cron_expression_error', () =>
        appendLog(runtime.paths.log, {
          event: 'cron_expression_error',
          cronJobId: cronJob.id,
          cron: cronJob.cron,
          error: error instanceof Error ? error.message : String(error),
        }),
      )
      continue
    }
    if (!matched) continue

    cronJob.lastTriggeredAt = nowAtIso
    stateChanged = true
    const { task, created } = enqueueTask(
      runtime.tasks,
      cronJob.prompt,
      cronJob.title,
      cronJob.profile,
      cronJob.cron,
    )
    if (!created) continue
    triggeredCount += 1

    task.cron = cronJob.cron
    await appendTaskSystemMessage(runtime.paths.history, 'created', task, {
      createdAt: task.createdAt,
    })
    enqueueWorkerTask(runtime, task)
    notifyWorkerLoop(runtime)
    if (!cronHasNextRun(cronJob.cron)) {
      cronJob.enabled = false
      cronJob.disabledReason = 'completed'
    }
  }

  if (!stateChanged) return { triggeredCount }
  await bestEffort('persistRuntimeState: cron_trigger', () =>
    persistRuntimeState(runtime),
  )
  return { triggeredCount }
}

export const cronWakeLoop = async (runtime: RuntimeState): Promise<void> => {
  while (!runtime.stopped) {
    try {
      const checked = await checkCronJobs(runtime)
      if (checked.triggeredCount > 0) notifyManagerLoop(runtime)
    } catch (error) {
      await bestEffort('appendLog: cron_wake_error', () =>
        appendLog(runtime.paths.log, {
          event: 'cron_wake_error',
          error: error instanceof Error ? error.message : String(error),
        }),
      )
    }
    await sleep(CRON_TICK_MS)
  }
}
