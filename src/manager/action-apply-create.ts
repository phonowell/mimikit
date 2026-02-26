import {
  ensureFocus,
  resolveDefaultFocusId,
  touchFocus,
} from '../focus/index.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import {
  buildTaskFingerprint,
  buildTaskSemanticKey,
  enqueueTask,
  findActiveTaskBySemanticKey,
} from '../orchestrator/core/task-state.js'
import { notifyWorkerLoop } from '../orchestrator/core/signals.js'
import { appendTaskSystemMessage } from '../history/task-events.js'
import { newId, nowIso } from '../shared/utils.js'
import { cancelTask } from '../worker/cancel-task.js'
import { enqueueWorkerTask } from '../worker/dispatch.js'

import {
  hasForbiddenWorkerStatePath,
  markCreateAttempt,
} from './action-apply-guards.js'
import { runTaskSchema, scheduleTaskSchema } from './action-apply-schema.js'

import type { Parsed } from '../actions/model/spec.js'
import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type {
  CronJob,
  FocusId,
  Task,
  WorkerProfile,
} from '../types/index.js'

export type ApplyTaskActionsOptions = {
  suppressRunTask?: boolean
}

const resolveActionFocusId = (
  runtime: RuntimeState,
  actionFocusId?: string,
): FocusId => {
  const trimmed = actionFocusId?.trim()
  const focusId =
    trimmed && trimmed.length > 0 ? trimmed : resolveDefaultFocusId(runtime)
  ensureFocus(runtime, focusId)
  touchFocus(runtime, focusId)
  return focusId
}

export const applyRunTask = async (
  runtime: RuntimeState,
  item: Parsed,
  seen: Set<string>,
  options?: ApplyTaskActionsOptions,
): Promise<void> => {
  if (options?.suppressRunTask) return
  const parsed = runTaskSchema.safeParse(item.attrs)
  if (!parsed.success) return
  if (hasForbiddenWorkerStatePath(parsed.data.prompt)) return
  const profile: WorkerProfile = 'worker'
  const focusId = resolveActionFocusId(runtime, parsed.data.focus_id)
  const semanticKey = buildTaskSemanticKey({
    prompt: parsed.data.prompt,
    title: parsed.data.title,
    profile,
  })
  const debounce = markCreateAttempt(runtime, semanticKey)
  if (debounce.debounced) return
  const dedupeKey = `${parsed.data.prompt}\n${parsed.data.title}\n${profile}`
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
    })
    const nextFingerprint = buildTaskFingerprint({
      prompt: parsed.data.prompt,
      title: parsed.data.title,
      profile,
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

  const { task, created } = enqueueTask(
    runtime.tasks,
    parsed.data.prompt,
    parsed.data.title,
    profile,
    undefined,
    focusId,
  )
  if (!created) {
    if (task.status !== 'pending') return
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

export const applyScheduleTask = async (
  runtime: RuntimeState,
  item: Parsed,
  seen: Set<string>,
): Promise<void> => {
  const parsed = scheduleTaskSchema.safeParse(item.attrs)
  if (!parsed.success) return
  const cron = parsed.data.cron?.trim()
  const scheduledAt = parsed.data.scheduled_at?.trim()
  if (!cron && !scheduledAt) return
  const profile: WorkerProfile = 'worker'
  const focusId = resolveActionFocusId(runtime, parsed.data.focus_id)
  const scheduleKey = cron ?? scheduledAt ?? ''
  const dedupeKey = `${parsed.data.prompt}\n${parsed.data.title}\n${profile}\n${scheduleKey}\n${focusId}`
  if (seen.has(dedupeKey)) return
  seen.add(dedupeKey)

  const existing = runtime.cronJobs.find((job) => {
    if (!job.enabled || job.focusId !== focusId) return false
    if (cron) {
      return (
        job.cron === cron &&
        job.prompt === parsed.data.prompt &&
        job.title === parsed.data.title
      )
    }
    return (
      job.scheduledAt === scheduledAt &&
      job.prompt === parsed.data.prompt &&
      job.title === parsed.data.title
    )
  })
  if (existing) return

  const createdAt = nowIso()
  const cronJob: CronJob = {
    id: `cron-${newId()}`,
    ...(cron ? { cron } : {}),
    ...(scheduledAt ? { scheduledAt } : {}),
    prompt: parsed.data.prompt,
    title: parsed.data.title,
    focusId,
    profile,
    enabled: true,
    createdAt,
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
    focusId,
    ...(cron ? { cron } : scheduledAt ? { cron: scheduledAt } : {}),
    profile,
    status: 'pending',
    createdAt,
  }

  await appendTaskSystemMessage(runtime.paths.history, 'created', scheduledTask, {
    createdAt,
  })
  await persistRuntimeState(runtime)
}
