import { newId, nowIso } from '../../foundation/shared/utils.js'
import { createSystemEventRecord } from '../../surface/shared/system-event.js'
import { resolveTaskLabel } from '../../work/shared/task-state.js'
import { safe } from '../log/safe.js'

import { appendHistory } from './store.js'

import type {
  HistoryMessage,
  Task,
  TaskCancelMeta,
  TaskResultStatus,
  TaskStatus,
} from '../../foundation/types/index.js'

type TaskHistoryEvent =
  | 'created'
  | 'paused'
  | 'resumed'
  | 'canceled'
  | 'completed'

type WorkerSlotPayload = {
  max_slots: number
  occupied_slots: number
  available_slots: number
}

const formatTaskLabel = (label: string): string => `"${label}"`

const buildTaskText = (
  event: TaskHistoryEvent,
  label: string,
  status?: TaskResultStatus,
  taskStatus?: TaskStatus,
  outcome?: 'completed' | 'partial' | 'blocked',
  stopReason?: string,
  cancel?: TaskCancelMeta,
  resumeInstructionPresent?: boolean,
): string => {
  const taskLabel = formatTaskLabel(label)
  if (event === 'created') return `Created task ${taskLabel}.`
  if (event === 'paused') return `Paused task ${taskLabel}.`
  if (event === 'resumed') {
    return resumeInstructionPresent
      ? `Resumed task ${taskLabel} with a supplemental instruction.`
      : `Resumed task ${taskLabel}.`
  }
  if (event === 'canceled') {
    return cancel?.source === 'user'
      ? `Canceled task ${taskLabel} at the user's request.`
      : `Canceled task ${taskLabel}.`
  }

  if (status === 'succeeded') return `Task ${taskLabel} completed successfully.`
  if (status === 'partial') {
    return stopReason === 'budget_exhausted'
      ? `Task ${taskLabel} paused after hitting the run budget and returned a partial result. Use Continue in the task list to resume.`
      : `Task ${taskLabel} paused with a partial result.`
  }
  if (status === 'failed') return `Task ${taskLabel} failed.`
  if (taskStatus === 'paused' && outcome === 'blocked')
    return `Task ${taskLabel} paused.`
  if (status === 'canceled') return `Task ${taskLabel} was canceled.`
  return `Task ${taskLabel} completed.`
}

const TASK_EVENT_NAME: Record<
  TaskHistoryEvent,
  | 'task_created'
  | 'task_paused'
  | 'task_resumed'
  | 'task_canceled'
  | 'task_completed'
> = {
  created: 'task_created',
  paused: 'task_paused',
  resumed: 'task_resumed',
  canceled: 'task_canceled',
  completed: 'task_completed',
}

const buildTaskPayload = (
  event: TaskHistoryEvent,
  task: Task,
  label: string,
  status?: TaskResultStatus,
  taskStatus?: TaskStatus,
  outcome?: 'completed' | 'partial' | 'blocked',
  stopReason?: string,
  cancel?: TaskCancelMeta,
  slotStatus?: WorkerSlotPayload,
  resumeInstructionPresent?: boolean,
): Record<string, unknown> => ({
  task_id: task.id,
  provider: task.provider,
  label,
  ...(task.title.trim() ? { title: task.title.trim() } : {}),
  ...(event === 'created' ? { status: 'pending' } : {}),
  ...(event === 'paused' ? { status: 'paused' } : {}),
  ...(event === 'resumed' ? { status: 'pending' } : {}),
  ...(event === 'resumed' && resumeInstructionPresent
    ? { resume_instruction_present: true }
    : {}),
  ...(event === 'completed' ? { status: status ?? 'completed' } : {}),
  ...(taskStatus ? { task_status: taskStatus } : {}),
  ...(outcome ? { outcome } : {}),
  ...(stopReason ? { stop_reason: stopReason } : {}),
  ...(event === 'canceled' ? { status: 'canceled' } : {}),
  ...(cancel?.source ? { cancel_source: cancel.source } : {}),
  ...(cancel?.reason ? { cancel_reason: cancel.reason } : {}),
  ...(slotStatus ? { slots: slotStatus } : {}),
})

export const appendTaskSystemMessage = (
  historyPath: string,
  event: TaskHistoryEvent,
  task: Task,
  options?: {
    status?: TaskResultStatus
    taskStatus?: TaskStatus
    outcome?: 'completed' | 'partial' | 'blocked'
    stopReason?: string
    createdAt?: string
    cancel?: TaskCancelMeta
    slotStatus?: WorkerSlotPayload
    resumeInstructionPresent?: boolean
  },
): Promise<boolean> => {
  const label = resolveTaskLabel(task)
  const eventRecord = createSystemEventRecord({
    summary: buildTaskText(
      event,
      label,
      options?.status,
      options?.taskStatus,
      options?.outcome,
      options?.stopReason,
      options?.cancel,
      options?.resumeInstructionPresent,
    ),
    event: TASK_EVENT_NAME[event],
    payload: buildTaskPayload(
      event,
      task,
      label,
      options?.status,
      options?.taskStatus,
      options?.outcome,
      options?.stopReason,
      options?.cancel,
      options?.slotStatus,
      options?.resumeInstructionPresent,
    ),
  })
  const message: HistoryMessage = {
    id: `sys-task-${newId()}`,
    role: 'system',
    visibility: 'user',
    ...eventRecord,
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
