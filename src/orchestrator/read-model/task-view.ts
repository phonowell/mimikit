import { titleFromCandidates } from '../../shared/utils.js'

import type { CronJob, Task, TaskStatus } from '../../types/index.js'

export type TaskView = {
  id: string
  status: TaskStatus
  profile: Task['profile']
  title: string
  cron?: string
  createdAt: string
  changeAt: string
  startedAt?: string
  completedAt?: string
  durationMs?: number
  usage?: Task['usage']
  archivePath?: string
}

export type TaskCounts = Record<TaskStatus, number>

const initCounts = (): TaskCounts => ({
  pending: 0,
  running: 0,
  succeeded: 0,
  failed: 0,
  canceled: 0,
})

const resolveTaskChangeAt = (task: Task): string =>
  task.completedAt ?? task.startedAt ?? task.createdAt

const resolveCronJobStatus = (cronJob: CronJob): TaskStatus => {
  if (cronJob.enabled) return 'pending'
  if (cronJob.disabledReason === 'completed') return 'succeeded'
  if (cronJob.disabledReason === 'canceled') return 'canceled'
  if (cronJob.scheduledAt && cronJob.lastTriggeredAt) return 'succeeded'
  return 'canceled'
}

const cronJobToView = (cronJob: CronJob): TaskView => {
  const schedule = cronJob.cron ?? cronJob.scheduledAt ?? ''
  return {
    id: cronJob.id,
    status: resolveCronJobStatus(cronJob),
    profile: cronJob.profile,
    title: cronJob.title || titleFromCandidates(cronJob.id, [cronJob.prompt]),
    ...(schedule ? { cron: schedule } : {}),
    createdAt: cronJob.createdAt,
    changeAt: cronJob.lastTriggeredAt ?? cronJob.createdAt,
  }
}

const taskToView = (task: Task): TaskView => ({
  id: task.id,
  status: task.status,
  profile: task.profile,
  title: task.title || titleFromCandidates(task.id, [task.prompt]),
  ...(task.cron ? { cron: task.cron } : {}),
  createdAt: task.createdAt,
  changeAt: resolveTaskChangeAt(task),
  ...(task.startedAt ? { startedAt: task.startedAt } : {}),
  ...(task.completedAt ? { completedAt: task.completedAt } : {}),
  ...(typeof task.durationMs === 'number'
    ? { durationMs: task.durationMs }
    : {}),
  ...(task.usage ? { usage: task.usage } : {}),
  ...(task.archivePath
    ? { archivePath: task.archivePath }
    : task.result?.archivePath
      ? { archivePath: task.result.archivePath }
      : {}),
})

export const buildTaskViews = (
  tasks: Task[],
  cronJobs: CronJob[] = [],
  limit = 200,
): { tasks: TaskView[]; counts: TaskCounts } => {
  const views = [...tasks.map(taskToView), ...cronJobs.map(cronJobToView)]
  views.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  const limited = views.slice(0, Math.max(0, limit))
  const counts = initCounts()
  for (const view of limited) counts[view.status] += 1
  return { tasks: limited, counts }
}
