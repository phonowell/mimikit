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

const resolveTaskAccessMode = (
  value: string | undefined,
): { chipText?: string; mode: 'read' | 'write' | 'unknown' } => {
  const normalized = value?.trim().toLowerCase()
  if (normalized === 'read') return { chipText: 'read-only', mode: 'read' }
  if (normalized === 'write') return { chipText: 'writable', mode: 'write' }
  if (!normalized) return { mode: 'unknown' }
  return { chipText: normalized, mode: 'unknown' }
}

const toMs = (value: string | undefined): number | null => {
  const parsed = parseTimeInput(value)
  return parsed ? parsed.getTime() : null
}

export const TaskMeta = ({ open, task }: Props) => {
  const accessMode = resolveTaskAccessMode(task.resourceMode)
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
  const dispatchLockDetail =
    status === 'pending' && task.pending_reason === 'waiting_dispatch_lock'
      ? task.dispatchLock
      : undefined
  const dispatchLockTitle = dispatchLockDetail
    ? `Blocked by ${dispatchLockDetail.blockerTaskId} via ${dispatchLockDetail.lockKey}`
    : ''
  const dispatchLockText = dispatchLockDetail
    ? `${dispatchLockDetail.blockerTaskId} · ${dispatchLockDetail.lockKey}`
    : ''
  const gitClosureItems: Array<{ key: string; text: string }> = []
  if (task.gitClosure?.review?.passed)
    gitClosureItems.push({ key: 'review', text: 'review' })
  if (task.gitClosure?.merged)
    gitClosureItems.push({ key: 'merged', text: 'merged' })
  if (task.gitClosure && task.gitClosure.cleaned === false)
    gitClosureItems.push({ key: 'cleanup-pending', text: 'cleanup pending' })
  if (task.gitClosure?.cleaned)
    gitClosureItems.push({ key: 'cleaned', text: 'cleaned' })

  return (
    <small className="task-meta">
      <span className="task-tokens" title={usage?.title ?? ''}>
        {usage?.text ?? '-'}
      </span>
      {accessMode.chipText ? (
        <span
          className="task-git-closure task-access-mode"
          data-access-mode={accessMode.mode}
        >
          {accessMode.chipText}
        </span>
      ) : null}
      {accessMode.mode === 'write' && task.git?.branch ? (
        <span
          className="task-git-closure task-git-target"
          title={task.git.branch}
        >
          {task.git.branch}
        </span>
      ) : null}
      {gitClosureItems.map((item) => (
        <span key={item.key} className="task-git-closure">
          {item.text}
        </span>
      ))}
      {pendingReason ? (
        <span className="task-pending-reason" title={task.pending_reason}>
          {pendingReason}
        </span>
      ) : null}
      {dispatchLockDetail ? (
        <span className="task-pending-detail" title={dispatchLockTitle}>
          {dispatchLockText}
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
}
