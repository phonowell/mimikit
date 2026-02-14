import { newId, nowIso, titleFromCandidates } from '../../shared/utils.js'

import { persistRuntimeState } from './runtime-persistence.js'
import { notifyUiSignal } from './ui-signal.js'

import type { RuntimeState } from './runtime-state.js'
import type { CronJob, WorkerProfile } from '../../types/index.js'

const cloneCronJob = (job: CronJob): CronJob => ({ ...job })

export const addCronJob = async (
  runtime: RuntimeState,
  input: {
    cron?: string
    scheduledAt?: string
    prompt: string
    title?: string
    profile?: WorkerProfile
    enabled?: boolean
  },
): Promise<CronJob> => {
  const prompt = input.prompt.trim()
  if (!prompt) throw new Error('add_cron_job_prompt_empty')
  const cron = input.cron?.trim()
  const scheduledAt = input.scheduledAt?.trim()
  if (!cron && !scheduledAt) throw new Error('add_cron_job_schedule_missing')
  if (cron && scheduledAt) throw new Error('add_cron_job_schedule_conflict')
  const id = newId()
  const job: CronJob = {
    id,
    ...(cron ? { cron } : {}),
    ...(scheduledAt ? { scheduledAt } : {}),
    prompt,
    title: titleFromCandidates(id, [input.title, prompt]),
    profile: input.profile ?? 'standard',
    enabled: input.enabled ?? true,
    createdAt: nowIso(),
  }
  runtime.cronJobs.push(job)
  await persistRuntimeState(runtime)
  notifyUiSignal(runtime)
  return cloneCronJob(job)
}

export const getCronJobs = (runtime: RuntimeState): CronJob[] =>
  runtime.cronJobs.map((job) => cloneCronJob(job))

export const cancelCronJob = async (
  runtime: RuntimeState,
  cronJobId: string,
): Promise<boolean> => {
  const targetId = cronJobId.trim()
  if (!targetId) return false
  const target = runtime.cronJobs.find((job) => job.id === targetId)
  if (!target) return false
  if (!target.enabled) return true
  target.enabled = false
  target.disabledReason = 'canceled'
  await persistRuntimeState(runtime)
  notifyUiSignal(runtime)
  return true
}
