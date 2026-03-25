import { memo } from 'react'

import { useNowTick } from '../hooks/use-now-tick.js'
import {
  formatDateTimeFull,
  formatDisplayTimeWithFull,
  parseTimeInput,
} from '../lib/messages/format-time.js'
import { formatUsage } from '../lib/messages/format-usage.js'
import { resolveTaskPendingReasonLabel } from '../lib/system-text.js'
import { formatElapsedText } from '../lib/tasks-view-time.js'

import type { TaskView } from '../types.js'

type Props = {
  open: boolean
  task: TaskView
}

const toMs = (value: string | undefined): number | null => {
  const parsed = parseTimeInput(value)
  return parsed ? parsed.getTime() : null
}

export const TaskMeta = memo(function TaskMeta({ open, task }: Props) {
  const status = task.status || 'pending'
  const hasRunningClock = status === 'running'
  const now = useNowTick(hasRunningClock ? 1_000 : 60_000, open)
  const usage = formatUsage(task.usage)
  const hasUsage = Boolean(usage?.text)
  const startMs = toMs(task.startedAt) ?? toMs(task.createdAt)
  const completedMs = toMs(task.completedAt)
  const elapsed =
    hasRunningClock && startMs
      ? formatElapsedText(now - startMs, hasUsage)
      : typeof task.durationMs === 'number'
        ? formatElapsedText(task.durationMs, hasUsage)
        : startMs && completedMs
          ? formatElapsedText(Math.max(0, completedMs - startMs), hasUsage)
          : ''
  const timeDisplay = formatDisplayTimeWithFull(task.changeAt, { now })
  const pendingReason =
    status === 'pending'
      ? resolveTaskPendingReasonLabel(task.pending_reason)
      : ''

  return (
    <small className="task-meta">
      <span className="task-tokens" title={usage?.title ?? ''}>
        {usage?.text ?? '-'}
      </span>
      {pendingReason ? (
        <span className="task-pending-reason" title={task.pending_reason}>
          {pendingReason}
        </span>
      ) : null}
      {task.recoverable ? (
        <span
          className="task-pending-reason task-pending-reason--recoverable"
          title={task.stopReason ?? 'budget_exhausted'}
        >
          Resume from partial
        </span>
      ) : null}
      {elapsed ? <span className="task-elapsed">{elapsed}</span> : null}
      {timeDisplay.displayText ? (
        <span
          className="task-time"
          title={formatDateTimeFull(task.changeAt) || task.changeAt}
        >
          {timeDisplay.displayText}
        </span>
      ) : null}
    </small>
  )
})
