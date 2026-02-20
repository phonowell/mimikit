import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import {
  buildTaskFingerprint,
  buildTaskSemanticKey,
  enqueueTask,
  findActiveTaskBySemanticKey,
} from '../orchestrator/core/task-state.js'
import { notifyWorkerLoop } from '../orchestrator/core/worker-signal.js'
import { appendTaskSystemMessage } from '../orchestrator/read-model/task-history.js'
import { newId, nowIso } from '../shared/utils.js'
import { cancelTask } from '../worker/cancel-task.js'
import { enqueueWorkerTask } from '../worker/dispatch.js'

import {
  hasForbiddenWorkerStatePath,
  markCreateAttempt,
} from './action-apply-guards.js'
import { createSchema } from './action-apply-schema.js'

import type { Parsed } from '../actions/model/spec.js'
import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { CronJob, Task, WorkerProfile } from '../types/index.js'

export type ApplyTaskActionsOptions = {
  suppressCreateTask?: boolean
}

export const applyCreateTask = async (
  runtime: RuntimeState,
  item: Parsed,
  seen: Set<string>,
  options?: ApplyTaskActionsOptions,
): Promise<void> => {
  if (options?.suppressCreateTask) return
  const parsed = createSchema.safeParse(item.attrs)
  if (!parsed.success) return
  const cron = parsed.data.cron?.trim()
  const scheduledAt = parsed.data.scheduled_at?.trim()
  const hasSchedule = Boolean(cron ?? scheduledAt)
  const profileFromInput = parsed.data.profile
  if (!hasSchedule && !profileFromInput) return
  const profile: WorkerProfile = hasSchedule
    ? 'deferred'
    : profileFromInput === 'specialist'
      ? 'specialist'
      : 'standard'
  if (profile !== 'deferred' && hasForbiddenWorkerStatePath(parsed.data.prompt))
    return
  const scheduleKey = cron ?? scheduledAt ?? ''
  const semanticKey = buildTaskSemanticKey({
    prompt: parsed.data.prompt,
    title: parsed.data.title,
    profile,
    ...(scheduleKey ? { schedule: scheduleKey } : {}),
  })
  const debounce = markCreateAttempt(runtime, semanticKey)
  if (debounce.debounced) return
  const dedupeKey = `${parsed.data.prompt}\n${parsed.data.title}\n${profile}\n${scheduleKey}`
  if (seen.has(dedupeKey)) return
  seen.add(dedupeKey)

  const activeSemanticTask = findActiveTaskBySemanticKey(
    runtime.tasks,
    semanticKey,
  )
  if (activeSemanticTask) {
    const activeFingerprint = buildTaskFingerprint({
      prompt: activeSemanticTask.prompt,
      title: activeSemanticTask.title,
      profile: activeSemanticTask.profile,
      ...(activeSemanticTask.cron ? { schedule: activeSemanticTask.cron } : {}),
    })
    const nextFingerprint = buildTaskFingerprint({
      prompt: parsed.data.prompt,
      title: parsed.data.title,
      profile,
      ...(scheduleKey ? { schedule: scheduleKey } : {}),
    })
    if (activeFingerprint !== nextFingerprint) {
      await cancelTask(runtime, activeSemanticTask.id, {
        source: 'deferred',
        reason: 'superseded_by_newer_semantic_task',
      })
    } else if (activeSemanticTask.status === 'pending') {
      enqueueWorkerTask(runtime, activeSemanticTask)
      notifyWorkerLoop(runtime)
      return
    } else return
  }

  if (cron || scheduledAt) {
    if (scheduledAt && !Number.isFinite(Date.parse(scheduledAt))) return

    const existing = runtime.cronJobs.find((job) => {
      if (!job.enabled) return false
      if (cron) {
        return (
          job.cron === cron &&
          job.prompt === parsed.data.prompt &&
          job.title === parsed.data.title &&
          job.profile === profile
        )
      }
      return (
        job.scheduledAt === scheduledAt &&
        job.prompt === parsed.data.prompt &&
        job.title === parsed.data.title &&
        job.profile === profile
      )
    })
    if (existing) return

    const cronJob: CronJob = {
      id: newId(),
      ...(cron ? { cron } : {}),
      ...(scheduledAt ? { scheduledAt } : {}),
      prompt: parsed.data.prompt,
      title: parsed.data.title,
      profile,
      enabled: true,
      createdAt: nowIso(),
    }
    runtime.cronJobs.push(cronJob)
    const scheduledTask: Task = {
      id: cronJob.id,
      fingerprint: buildTaskFingerprint({
        prompt: parsed.data.prompt,
        title: parsed.data.title,
        profile,
        schedule: scheduleKey,
      }),
      prompt: parsed.data.prompt,
      title: parsed.data.title,
      ...(cron ? { cron } : scheduledAt ? { cron: scheduledAt } : {}),
      profile,
      status: 'pending',
      createdAt: cronJob.createdAt,
    }
    await appendTaskSystemMessage(
      runtime.paths.history,
      'created',
      scheduledTask,
      {
        createdAt: cronJob.createdAt,
      },
    )
    await persistRuntimeState(runtime)
    return
  }

  const { task, created } = enqueueTask(
    runtime.tasks,
    parsed.data.prompt,
    parsed.data.title,
    profile,
  )
  if (!created) {
    if (task.status !== 'pending' || task.profile === 'deferred') return
    enqueueWorkerTask(runtime, task)
    notifyWorkerLoop(runtime)
    return
  }
  await appendTaskSystemMessage(runtime.paths.history, 'created', task, {
    createdAt: task.createdAt,
  })
  await persistRuntimeState(runtime)
  enqueueWorkerTask(runtime, task)
  notifyWorkerLoop(runtime)
}
