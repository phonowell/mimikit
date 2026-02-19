import notifier from 'node-notifier'

import {
  formatDuration,
  normalizeTitle,
  sanitizeLine,
  shouldNotifySucceeded,
  SUCCESS_BATCH_TITLES_LIMIT,
  SUCCESS_BATCH_WINDOW_MS,
  SUCCESS_MIN_INTERVAL_MS,
  type SuccessItem,
  summarizeProfiles,
} from './node-notifier-policy.js'

import type { Task, TaskResult } from '../types/index.js'

export type TaskResultNotifier = {
  notifyTaskResult: (task: Task, result: TaskResult) => Promise<void>
  stop: () => void
}

const sendDesktopNotification = (
  title: string,
  message: string,
): Promise<void> =>
  new Promise((resolve, reject) => {
    let settled = false
    const settle = (error?: unknown) => {
      if (settled) return
      settled = true
      if (error) {
        reject(error instanceof Error ? error : new Error(String(error)))
        return
      }
      resolve()
    }
    const watchdog = setTimeout(() => settle(), 2_000)
    const done = (error?: unknown) => {
      clearTimeout(watchdog)
      settle(error)
    }
    try {
      notifier.notify({ title, message, wait: false, timeout: 5 }, (error) => {
        done(error)
      })
    } catch (error) {
      done(error)
    }
  })

const sendFailed = (task: Task, result: TaskResult) =>
  sendDesktopNotification(
    `[failed] ${normalizeTitle(task)}`,
    `profile=${task.profile} duration=${formatDuration(result.durationMs)} error=${sanitizeLine(result.output, 160)}`,
  )

const sendCanceled = (task: Task, result: TaskResult) => {
  const source = result.cancel?.source ?? 'system'
  const reason = result.cancel?.reason
    ? ` reason=${sanitizeLine(result.cancel.reason)}`
    : ''
  return sendDesktopNotification(
    `[canceled] ${normalizeTitle(task)}`,
    `profile=${task.profile} duration=${formatDuration(result.durationMs)} source=${source}${reason}`,
  )
}

export const createTaskResultNotifier = (
  _logPath: string,
): TaskResultNotifier => {
  let pendingSuccesses: SuccessItem[] = []
  let flushTimer: NodeJS.Timeout | null = null
  let lastSentAt = 0
  let flushing = false

  const send = async (title: string, message: string): Promise<void> => {
    await sendDesktopNotification(title, message)
    lastSentAt = Date.now()
  }

  const scheduleFlush = (delayMs: number): void => {
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = setTimeout(() => {
      void flushSuccessBatch()
    }, delayMs)
  }

  const flushSuccessBatch = async (): Promise<void> => {
    if (flushing) return
    if (pendingSuccesses.length === 0) return
    const elapsed = Date.now() - lastSentAt
    if (elapsed < SUCCESS_MIN_INTERVAL_MS) {
      scheduleFlush(SUCCESS_MIN_INTERVAL_MS - elapsed)
      return
    }
    flushing = true
    const batch = pendingSuccesses
    pendingSuccesses = []
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = null
    try {
      if (batch.length === 1) {
        const one = batch[0]
        if (!one) return
        await send(
          `[succeeded] ${one.title}`,
          `profile=${one.profile} duration=${formatDuration(one.durationMs)}`,
        )
        return
      }
      const titles = batch
        .slice(0, SUCCESS_BATCH_TITLES_LIMIT)
        .map((item) => sanitizeLine(item.title, 24))
        .join(', ')
      const more =
        batch.length > SUCCESS_BATCH_TITLES_LIMIT
          ? ` +${batch.length - SUCCESS_BATCH_TITLES_LIMIT} more`
          : ''
      await send(
        `[succeeded] ${batch.length} tasks completed`,
        `profiles=${summarizeProfiles(batch)} titles=${titles}${more}`,
      )
    } finally {
      flushing = false
    }
  }

  return {
    notifyTaskResult: async (task: Task, result: TaskResult) => {
      if (result.status === 'failed') {
        await sendFailed(task, result)
          .then(() => {
            lastSentAt = Date.now()
          })
          .catch(() => undefined)
        return
      }
      if (result.status === 'canceled') {
        await sendCanceled(task, result)
          .then(() => {
            lastSentAt = Date.now()
          })
          .catch(() => undefined)
        return
      }
      if (!shouldNotifySucceeded(task, result)) return

      pendingSuccesses.push({
        title: normalizeTitle(task),
        profile: task.profile,
        durationMs: result.durationMs,
      })
      if (pendingSuccesses.length !== 1) return
      scheduleFlush(SUCCESS_BATCH_WINDOW_MS)
    },
    stop: () => {
      if (flushTimer) clearTimeout(flushTimer)
      flushTimer = null
      pendingSuccesses = []
    },
  }
}
