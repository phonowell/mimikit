import { safe } from '../../log/safe.js'
import { newId, nowIso } from '../../shared/utils.js'
import { appendHistory } from '../../storage/history-jsonl.js'

import type {
  HistoryMessage,
  Task,
  TaskCancelMeta,
  TaskResultStatus,
} from '../../types/index.js'

type TaskHistoryEvent = 'created' | 'canceled' | 'completed'

const STATUS_LABELS: Record<TaskResultStatus, string> = {
  succeeded: 'done',
  failed: 'failed',
  canceled: 'canceled',
}

const resolveTaskLabel = (task: Task): string => {
  const title = task.title.trim()
  if (title && title !== task.id) return title
  return task.id
}

const buildTaskText = (
  event: TaskHistoryEvent,
  label: string,
  status?: TaskResultStatus,
  cancel?: TaskCancelMeta,
): string => {
  if (event === 'created') return `Task created · ${label}`
  if (event === 'canceled') {
    return cancel?.source === 'user'
      ? `Task canceled by user · ${label}`
      : `Task canceled · ${label}`
  }
  const statusLabel = status ? STATUS_LABELS[status] : 'completed'
  return `Task ${statusLabel} · ${label}`
}

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
  const text = buildTaskText(
    event,
    resolveTaskLabel(task),
    options?.status,
    options?.cancel,
  )
  const message: HistoryMessage = {
    id: `sys-task-${newId()}`,
    role: 'system',
    text,
    createdAt: options?.createdAt ?? nowIso(),
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
