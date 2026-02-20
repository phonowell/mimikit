import { Cron } from 'croner'

import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { notifyManagerLoop } from '../orchestrator/core/manager-signal.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'

import { publishManagerSystemEventInput } from './system-input-event.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'

const matchCronNow = (expression: string, at: Date = new Date()): boolean =>
  new Cron(expression).match(at)

const asSecondStamp = (iso: string): string => iso.slice(0, 19)
const CRON_TICK_MS = 1_000

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

type CronCheckResult = {
  triggeredCount: number
}

type CronTriggerSchedule =
  | {
      cron: string
      scheduledAt?: undefined
    }
  | {
      cron?: undefined
      scheduledAt: string
    }

const toCronTriggerPayload = (params: {
  cronJobId: string
  prompt: string
  title: string
  profile: RuntimeState['cronJobs'][number]['profile']
  schedule: CronTriggerSchedule
  triggeredAt: string
}): Record<string, unknown> => ({
  cron_job_id: params.cronJobId,
  title: params.title,
  prompt: params.prompt,
  profile: params.profile,
  triggered_at: params.triggeredAt,
  ...(params.schedule.cron ? { cron: params.schedule.cron } : {}),
  ...(params.schedule.scheduledAt
    ? { scheduled_at: params.schedule.scheduledAt }
    : {}),
})

const publishCronTriggerSystemInput = async (params: {
  runtime: RuntimeState
  cronJobId: string
  prompt: string
  title: string
  profile: RuntimeState['cronJobs'][number]['profile']
  schedule: CronTriggerSchedule
  triggeredAt: string
}): Promise<void> => {
  const label = params.title.trim() || params.cronJobId
  await publishManagerSystemEventInput({
    runtime: params.runtime,
    summary: `[系统] 定时任务已触发：${label}`,
    event: 'cron_trigger',
    visibility: 'all',
    payload: toCronTriggerPayload(params),
    createdAt: params.triggeredAt,
    logEvent: 'cron_trigger_input',
    logMeta: {
      cronJobId: params.cronJobId,
      profile: params.profile,
      schedule: params.schedule.cron ?? params.schedule.scheduledAt,
      triggeredAt: params.triggeredAt,
    },
  })
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
      await publishCronTriggerSystemInput({
        runtime,
        cronJobId: cronJob.id,
        prompt: cronJob.prompt,
        title: cronJob.title,
        profile: cronJob.profile,
        schedule: { scheduledAt: cronJob.scheduledAt },
        triggeredAt: nowAtIso,
      })
      triggeredCount += 1
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
    await publishCronTriggerSystemInput({
      runtime,
      cronJobId: cronJob.id,
      prompt: cronJob.prompt,
      title: cronJob.title,
      profile: cronJob.profile,
      schedule: { cron: cronJob.cron },
      triggeredAt: nowAtIso,
    })
    triggeredCount += 1
    let hasNextRun = false
    try {
      hasNextRun = new Cron(cronJob.cron).nextRun() !== null
    } catch {
      hasNextRun = false
    }
    if (!hasNextRun) {
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
