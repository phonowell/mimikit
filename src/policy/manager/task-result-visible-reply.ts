import { toDisplayPath } from '../../surface/shared/path-display.js'
import { resolveTaskLabel } from '../../work/shared/task-state.js'

import type {
  Task,
  TaskResult,
  TaskResultStopReason,
} from '../../foundation/types/index.js'

const TASK_RESULT_STATUS_TEXT: Record<TaskResult['status'], string> = {
  succeeded: '已完成',
  failed: '已失败',
  canceled: '已取消',
}

const TASK_RESULT_STOP_REASON_HINT: Partial<
  Record<TaskResultStopReason, string>
> = {
  guard_rejected: '命中门禁',
  input_required: '需要补充输入',
}

const resolveTaskResultLabel = (
  task: Task | undefined,
  result: TaskResult,
): string => {
  if (task) return resolveTaskLabel(task)
  const title = result.title?.trim()
  if (title && title !== result.taskId) return title
  return result.taskId
}

const resolveTaskResultRef = (
  task: Task | undefined,
  result: TaskResult,
): string => {
  const label = resolveTaskResultLabel(task, result)
  const id = task?.id ?? result.taskId
  return label === id ? id : `${label}（${id}）`
}

const resolveTaskArchiveLine = (params: {
  task?: Task
  result: TaskResult
  workDir: string
}): string => {
  const rawArchivePath = [
    params.result.archivePath,
    params.task?.archivePath,
    params.task?.result?.archivePath,
  ].find((value) => typeof value === 'string' && value.trim().length > 0)
  const archivePath = rawArchivePath
    ? toDisplayPath(rawArchivePath, params.workDir).trim()
    : ''
  return archivePath ? `[任务归档](${archivePath})` : '任务归档: 未生成'
}

const resolveStopReasonLine = (
  stopReason: TaskResult['stopReason'],
): string | undefined => {
  if (!stopReason || stopReason === 'completed') return undefined
  const reason = stopReason
  const hint = TASK_RESULT_STOP_REASON_HINT[reason]
  return hint ? `停下原因：${reason}（${hint}）` : `停下原因：${reason}`
}

export const formatManagerVisibleTaskResultReply = (params: {
  task?: Task
  result: TaskResult
  detail?: string
  workDir: string
}): string => {
  const detail = params.detail?.trim()
  const lines = [
    `任务 ${resolveTaskResultRef(params.task, params.result)}：${TASK_RESULT_STATUS_TEXT[params.result.status]}。`,
  ]
  if (detail) lines.push(detail)
  const stopReasonLine = resolveStopReasonLine(params.result.stopReason)
  if (stopReasonLine) lines.push(stopReasonLine)
  lines.push(resolveTaskArchiveLine(params))
  return lines.join('\n')
}
