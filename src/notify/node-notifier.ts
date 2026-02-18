import notifier from 'node-notifier'

import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'

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
      notifier.notify(
        {
          title,
          message,
          wait: false,
          timeout: 5,
        },
        (error) => done(error),
      )
    } catch (error) {
      done(error)
    }
  })

export const createTaskResultNotifier = (
  logPath: string,
): TaskResultNotifier => {
  let pendingSuccesses: SuccessItem[] = []
  let flushTimer: NodeJS.Timeout | null = null
  let lastSentAt = 0
  let flushing = false

  const logEvent = async (entry: Record<string, unknown>): Promise<void> => {
    await bestEffort('appendLog: desktop_notification', () =>
      appendLog(logPath, { event: 'desktop_notification', ...entry }),
    )
  }

  const send = async (
    kind: 'urgent' | 'success',
    title: string,
    message: string,
    meta: Record<string, unknown>,
  ): Promise<void> => {
    await sendDesktopNotification(title, message)
    lastSentAt = Date.now()
    await logEvent({ kind, title, ...meta })
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
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }

    const batch = pendingSuccesses
    pendingSuccesses = []
    if (batch.length === 1) {
      const single = batch[0]
      if (!single) {
        flushing = false
        return
      }
      await bestEffort('desktop_notification: success_single', () =>
        send(
          'success',
          `[succeeded] ${single.title}`,
          `profile=${single.profile} duration=${formatDuration(single.durationMs)}`,
          { count: 1, profile: single.profile, durationMs: single.durationMs },
        ),
      )
      flushing = false
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
    const summary = summarizeProfiles(batch)
    await bestEffort('desktop_notification: success_batch', () =>
      send(
        'success',
        `[succeeded] ${batch.length} tasks completed`,
        `profiles=${summary} titles=${titles}${more}`,
        { count: batch.length, profiles: summary },
      ),
    )
    flushing = false
  }

  const notifyTaskResult = async (
    task: Task,
    result: TaskResult,
  ): Promise<void> => {
    if (result.status === 'failed') {
      const reason = sanitizeLine(result.output, 160)
      await bestEffort('desktop_notification: failed', () =>
        send(
          'urgent',
          `[failed] ${normalizeTitle(task)}`,
          `profile=${task.profile} duration=${formatDuration(result.durationMs)} error=${reason}`,
          { status: result.status, taskId: task.id, profile: task.profile },
        ),
      )
      return
    }

    if (result.status === 'canceled') {
      const source = result.cancel?.source ?? 'system'
      const reason = result.cancel?.reason
        ? sanitizeLine(result.cancel.reason)
        : ''
      const suffix = reason ? ` reason=${reason}` : ''
      await bestEffort('desktop_notification: canceled', () =>
        send(
          'urgent',
          `[canceled] ${normalizeTitle(task)}`,
          `profile=${task.profile} duration=${formatDuration(result.durationMs)} source=${source}${suffix}`,
          {
            status: result.status,
            taskId: task.id,
            profile: task.profile,
            source,
          },
        ),
      )
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
  }

  const stop = (): void => {
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = null
    pendingSuccesses = []
  }

  return { notifyTaskResult, stop }
}
