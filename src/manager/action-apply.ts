import { z } from 'zod'

import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
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

import type { Parsed } from '../actions/model/spec.js'
import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { CronJob, Task, WorkerProfile } from '../types/index.js'

const nonEmptyString = z.string().trim().min(1)

const summarizeSchema = z
  .object({
    task_id: nonEmptyString,
    summary: nonEmptyString,
  })
  .strict()

const createSchema = z
  .object({
    prompt: nonEmptyString,
    title: nonEmptyString,
    profile: z.enum(['standard', 'specialist', 'manager']),
    cron: z.string().trim().optional(),
    scheduled_at: z.string().trim().optional(),
  })
  .strict()
  .refine(
    (data) => !(data.cron?.trim() && data.scheduled_at?.trim()),
    'cron and scheduled_at are mutually exclusive',
  )

const cancelSchema = z
  .object({
    id: nonEmptyString,
  })
  .strict()

const restartSchema = z.object({}).strict()

const parseSummary = (
  item: Parsed,
): { taskId: string; summary: string } | undefined => {
  const parsed = summarizeSchema.safeParse(item.attrs)
  if (!parsed.success) return undefined
  return { taskId: parsed.data.task_id, summary: parsed.data.summary }
}

const requestManagerRestart = (runtime: RuntimeState): void => {
  setTimeout(() => {
    void (async () => {
      runtime.stopped = true
      notifyWorkerLoop(runtime)
      await bestEffort('persistRuntimeState: manager_restart', () =>
        persistRuntimeState(runtime),
      )
      process.exit(75)
    })()
  }, 100)
}

export const collectTaskResultSummaries = (
  items: Parsed[],
): Map<string, string> => {
  const summaries = new Map<string, string>()
  for (const item of items) {
    if (item.name !== 'summarize_task_result') continue
    const summary = parseSummary(item)
    if (!summary) continue
    summaries.set(summary.taskId, summary.summary)
  }
  return summaries
}

type ApplyTaskActionsOptions = {
  suppressCreateTask?: boolean
}

const normalizePromptPath = (value: string): string =>
  value.replace(/\\/g, '/').toLowerCase()

const hasForbiddenWorkerStatePath = (prompt: string): boolean => {
  const normalized = normalizePromptPath(prompt)
  if (!normalized.includes('.mimikit')) return false
  const directDeny =
    normalized.includes('.mimikit/runtime-state') ||
    normalized.includes('.mimikit/results/') ||
    normalized.includes('.mimikit/inputs/') ||
    normalized.includes('.mimikit/tasks/') ||
    normalized.includes('.mimikit/log.jsonl') ||
    normalized.includes('.mimikit/history.jsonl')
  if (directDeny) return true
  const pathRefs = normalized.match(
    /(?:^|[^\p{L}\p{N}_-])(?:\.mimikit\/[^\s"'`)\]]+)/gu,
  )
  if (!pathRefs) return false
  return pathRefs.some((rawRef) => {
    const ref = rawRef.trim().replace(/^[^.]*/, '')
    if (ref === '.mimikit/generated' || ref.startsWith('.mimikit/generated/'))
      return false
    return true
  })
}

const markCreateAttempt = (
  runtime: RuntimeState,
  semanticKey: string,
): { debounced: boolean; waitMs: number } => {
  const now = Date.now()
  const debounceMs = Math.max(0, runtime.config.manager.createTaskDebounceMs)
  const debounceMap = runtime.createTaskDebounce
  const last = debounceMap.get(semanticKey)
  debounceMap.set(semanticKey, now)
  if (debounceMap.size > 1_000) {
    const cutoff = now - debounceMs * 4
    for (const [key, value] of debounceMap) {
      if (value >= cutoff) continue
      debounceMap.delete(key)
    }
  }
  if (last === undefined || debounceMs === 0)
    return { debounced: false, waitMs: 0 }
  const delta = now - last
  if (delta >= debounceMs) return { debounced: false, waitMs: 0 }
  return { debounced: true, waitMs: Math.max(0, debounceMs - delta) }
}

const applyCreateTask = async (
  runtime: RuntimeState,
  item: Parsed,
  seen: Set<string>,
  options?: ApplyTaskActionsOptions,
): Promise<void> => {
  if (options?.suppressCreateTask) return
  const parsed = createSchema.safeParse(item.attrs)
  if (!parsed.success) return
  const profile = parsed.data.profile as WorkerProfile
  if (
    profile !== 'manager' &&
    hasForbiddenWorkerStatePath(parsed.data.prompt)
  ) {
    await bestEffort(
      'appendLog: create_task_rejected_forbidden_state_path',
      () =>
        appendLog(runtime.paths.log, {
          event: 'create_task_rejected_forbidden_state_path',
          profile,
          title: parsed.data.title,
        }),
    )
    return
  }
  const cron = parsed.data.cron?.trim()
  const scheduledAt = parsed.data.scheduled_at?.trim()
  const scheduleKey = cron ?? scheduledAt ?? ''
  const semanticKey = buildTaskSemanticKey({
    prompt: parsed.data.prompt,
    title: parsed.data.title,
    profile,
    ...(scheduleKey ? { schedule: scheduleKey } : {}),
  })
  const debounce = markCreateAttempt(runtime, semanticKey)
  if (debounce.debounced) {
    await bestEffort('appendLog: create_task_debounced', () =>
      appendLog(runtime.paths.log, {
        event: 'create_task_debounced',
        profile,
        title: parsed.data.title,
        waitMs: debounce.waitMs,
      }),
    )
    return
  }
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
        source: 'manager',
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
    if (task.status !== 'pending' || task.profile === 'manager') return
    enqueueWorkerTask(runtime, task)
    notifyWorkerLoop(runtime)
    return
  }
  await appendTaskSystemMessage(runtime.paths.history, 'created', task, {
    createdAt: task.createdAt,
  })
  await persistRuntimeState(runtime)
  if (profile !== 'manager') {
    enqueueWorkerTask(runtime, task)
    notifyWorkerLoop(runtime)
  }
}

export const applyTaskActions = async (
  runtime: RuntimeState,
  items: Parsed[],
  options?: ApplyTaskActionsOptions,
): Promise<void> => {
  const seen = new Set<string>()
  for (const item of items) {
    if (item.name === 'create_task') {
      await applyCreateTask(runtime, item, seen, options)
      continue
    }
    if (item.name === 'cancel_task') {
      const parsed = cancelSchema.safeParse(item.attrs)
      if (!parsed.success) continue
      const { id } = parsed.data
      const canceled = await cancelTask(runtime, id, { source: 'manager' })
      if (canceled.ok || canceled.status !== 'not_found') continue
      const cronJob = runtime.cronJobs.find((job) => job.id === id)
      if (!cronJob?.enabled) continue
      cronJob.enabled = false
      cronJob.disabledReason = 'canceled'
      await persistRuntimeState(runtime)
      continue
    }
    if (item.name === 'restart_server') {
      const parsed = restartSchema.safeParse(item.attrs)
      if (!parsed.success) continue
      requestManagerRestart(runtime)
      return
    }
  }
}
