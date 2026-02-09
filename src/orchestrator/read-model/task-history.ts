import { safe } from '../../log/safe.js'
import { newId, nowIso } from '../../shared/utils.js'
import { appendHistory } from '../../storage/jsonl.js'

import type {
  HistoryMessage,
  Task,
  TaskResultStatus,
} from '../../types/index.js'

type TaskHistoryEvent = 'created' | 'canceled' | 'completed'

const STATUS_LABELS: Record<TaskResultStatus, string> = {
  succeeded: '成功',
  failed: '失败',
  canceled: '已取消',
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
): string => {
  if (event === 'created') return `任务已创建：${label}`
  if (event === 'canceled') return `任务已取消：${label}`
  const statusLabel = status ? STATUS_LABELS[status] : '未知'
  return `任务已完成：${label}，状态：${statusLabel}`
}

export const appendTaskSystemMessage = (
  historyPath: string,
  event: TaskHistoryEvent,
  task: Task,
  options?: { status?: TaskResultStatus; createdAt?: string },
): Promise<boolean> => {
  const text = buildTaskText(event, resolveTaskLabel(task), options?.status)
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
