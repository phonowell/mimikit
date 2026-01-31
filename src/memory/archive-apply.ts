import { writeFileAtomic } from '../fs/atomic.js'
import { appendLog } from '../log/append.js'
import { addSeconds, nowIso } from '../time.js'

import { readArchiveJobs, removeArchiveJob } from './archive-jobs.js'

import type { HistoryMessage } from '../types/history.js'

export const applyArchiveResult = async (params: {
  history: HistoryMessage[]
  archiveJobsPath: string
  taskId: string
  success: boolean
  outputText?: string
  logPath?: string
}): Promise<{ history: HistoryMessage[]; handled: boolean }> => {
  const jobs = await readArchiveJobs(params.archiveJobsPath)
  const job = jobs[params.taskId]
  if (!job) return { history: params.history, handled: false }

  if (params.success && params.outputText && job.outputPath)
    await writeFileAtomic(job.outputPath, `${params.outputText}\n`)

  const backoffSteps = [600, 1800, 7200, 21600, 43200]
  const maxAttempts = backoffSteps.length
  const shouldLogBacklog =
    !params.success &&
    params.logPath &&
    params.history.some(
      (msg) =>
        job.messageIds.includes(msg.id) &&
        (msg.archiveAttempts ?? 0) + 1 >= maxAttempts,
    )

  const updated = params.history.map((msg) => {
    if (!job.messageIds.includes(msg.id)) return msg
    if (params.success) return { ...msg, archived: true }
    const attempts = (msg.archiveAttempts ?? 0) + 1
    const idx = Math.min(attempts - 1, backoffSteps.length - 1)
    const fallback = backoffSteps[backoffSteps.length - 1] ?? 600
    const backoff = backoffSteps[idx] ?? fallback
    const now = nowIso()
    return {
      ...msg,
      archived: false,
      archiveAttempts: attempts,
      archiveFailedAt: now,
      archiveNextAt: addSeconds(now, backoff),
    }
  })
  await removeArchiveJob(params.archiveJobsPath, params.taskId)
  if (shouldLogBacklog && params.logPath) {
    await appendLog(params.logPath, {
      event: 'archive_backlog',
      taskId: params.taskId,
      messageCount: job.messageIds.length,
    })
  }
  return { history: updated, handled: true }
}
