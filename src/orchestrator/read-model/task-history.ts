import { safe } from '../../log/safe.js'
import { formatSystemEventText } from '../../shared/system-event.js'
import { newId, nowIso } from '../../shared/utils.js'
import { appendHistory } from '../../storage/history-jsonl.js'

import type {
  HistoryMessage,
  Task,
  TaskCancelMeta,
  TaskResultStatus,
} from '../../types/index.js'

type TaskHistoryEvent = 'created' | 'canceled' | 'completed'

const resolveTaskLabel = (task: Task): string => {
  const title = task.title.trim()
  if (title && title !== task.id) return title
  return task.id
}

const formatTaskLabel = (label: string): string => `"${label}"`

const buildTaskText = (
  event: TaskHistoryEvent,
  label: string,
  status?: TaskResultStatus,
  cancel?: TaskCancelMeta,
): string => {
  const taskLabel = formatTaskLabel(label)
  if (event === 'created') return `Created task ${taskLabel}.`
  if (event === 'canceled') {
    return cancel?.source === 'user'
      ? `Canceled task ${taskLabel} at the user's request.`
      : `Canceled task ${taskLabel}.`
  }
  if (status === 'succeeded') return `Task ${taskLabel} completed successfully.`
  if (status === 'failed') return `Task ${taskLabel} failed.`
  if (status === 'canceled') return `Task ${taskLabel} was canceled.`
  return `Task ${taskLabel} completed.`
}

const TASK_EVENT_NAME: Record<
  TaskHistoryEvent,
  'task_created' | 'task_canceled' | 'task_completed'
> = {
  created: 'task_created',
  canceled: 'task_canceled',
  completed: 'task_completed',
}

const buildTaskPayload = (
  event: TaskHistoryEvent,
  task: Task,
  label: string,
  status?: TaskResultStatus,
  cancel?: TaskCancelMeta,
): Record<string, unknown> => ({
  task_id: task.id,
  label,
  ...(task.title.trim() ? { title: task.title.trim() } : {}),
  ...(event === 'created' ? { status: 'pending' } : {}),
  ...(event === 'completed' ? { status: status ?? 'completed' } : {}),
  ...(event === 'canceled' ? { status: 'canceled' } : {}),
  ...(cancel?.source ? { cancel_source: cancel.source } : {}),
  ...(cancel?.reason ? { cancel_reason: cancel.reason } : {}),
})

export const appendTaskSystemMessage = (
  historyPath: string,
  event: TaskHistoryEvent,
  task: Task,
  options?: {
    status?: TaskResultStatus
    createdAt?: string
    cancel?: TaskCancelMeta
  },
): Promise<boolean> => {
  const label = resolveTaskLabel(task)
  const text = formatSystemEventText({
    summary: buildTaskText(event, label, options?.status, options?.cancel),
    event: TASK_EVENT_NAME[event],
    payload: buildTaskPayload(
      event,
      task,
      label,
      options?.status,
      options?.cancel,
    ),
  })
  const message: HistoryMessage = {
    id: `sys-task-${newId()}`,
    role: 'system',
    visibility: 'user',
    text,
    createdAt: options?.createdAt ?? nowIso(),
    focusId: task.focusId,
  }
  return safe(
    'appendHistory: task_system_message',
    async () => {
      await appendHistory(historyPath, message)
      return true
    },
    { fallback: false, meta: { event, taskId: task.id } },
  )
}
