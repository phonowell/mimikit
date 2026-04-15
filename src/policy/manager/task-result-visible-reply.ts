import {
  toDisplayPath,
  toStateDisplayPath,
} from '../../surface/shared/path-display.js'
import { resolveTaskLabel } from '../../work/shared/task-state.js'

import { normalizeManagerReplyText } from './reply-normalize.js'

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
  closure_pending: '待执行 merge/cleanup 收尾',
  guard_rejected: '命中门禁',
  input_required: '需要补充输入',
}

const BLOCKED_NEXT_STEP = '我先停在这里，等最小必要确认补齐后再继续推进。'

const TASK_RESULT_DECISION_TEXT: Partial<Record<TaskResultStopReason, string>> =
  {
    guard_rejected: '请直接确认是否继续这一步，以及要操作的目标对象。',
    input_required: '请直接补充这一步还缺的目标、范围或验收标准。',
  }

const resolveTaskResultStatusText = (result: TaskResult): string => {
  if (result.taskStatus === 'paused' && result.outcome === 'blocked')
    return result.stopReason === 'closure_pending' ? '待收尾' : '已暂停'

  return TASK_RESULT_STATUS_TEXT[result.status]
}

const resolveTaskResultRef = (
  task: Task | undefined,
  result: TaskResult,
): string => {
  if (task) {
    const label = resolveTaskLabel(task)
    return label === task.id ? task.id : `${label}（${task.id}）`
  }
  const title = result.title?.trim()
  if (title && title !== result.taskId) return title
  return result.taskId
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
    ? (
        toStateDisplayPath(rawArchivePath) ??
        toDisplayPath(rawArchivePath, params.workDir)
      ).trim()
    : ''
  return archivePath ? `[任务归档](${archivePath})` : '任务归档: 未生成'
}

const resolveStopReasonRisk = (
  stopReason: TaskResult['stopReason'],
): string | undefined => {
  if (!stopReason || stopReason === 'completed') return undefined
  const hint = TASK_RESULT_STOP_REASON_HINT[stopReason]
  return hint ? `停下原因：${stopReason}（${hint}）` : `停下原因：${stopReason}`
}

const resolveRiskLine = (result: TaskResult): string | undefined => {
  const stopReasonRisk = resolveStopReasonRisk(result.stopReason)
  if (stopReasonRisk) return stopReasonRisk
  const risk = result.handoff?.risks?.find(
    (item) => typeof item === 'string' && item.trim().length > 0,
  )
  return risk ? risk.trim() : undefined
}

const resolveNextStepLine = (result: TaskResult): string => {
  const nextStep = result.handoff?.nextSteps?.find(
    (item) => typeof item === 'string' && item.trim().length > 0,
  )
  if (nextStep) return nextStep.trim()
  if (
    result.stopReason === 'input_required' ||
    result.stopReason === 'guard_rejected'
  )
    return BLOCKED_NEXT_STEP
  if (result.status === 'failed' || result.status === 'canceled')
    return '我会先按现有结果收敛停下原因，再决定是补证据、改派还是等待新输入。'
  return '我会继续沿当前工作线推进后续收尾，并只在需要你拍板时再抬给你。'
}

export const formatManagerVisibleTaskResultReply = (params: {
  task?: Task
  result: TaskResult
  detail?: string
  workDir: string
}): string => {
  const detail = params.detail?.trim()
  const progressParts = [
    `任务 ${resolveTaskResultRef(params.task, params.result)}：${resolveTaskResultStatusText(params.result)}。`,
  ]
  if (detail) progressParts.push(detail)
  const lines = [`当前进展：${progressParts.join(' ')}`]
  const riskLine = resolveRiskLine(params.result)
  if (riskLine) lines.push(`当前风险：${riskLine}`)
  const decisionLine = params.result.stopReason
    ? TASK_RESULT_DECISION_TEXT[params.result.stopReason]
    : undefined
  if (decisionLine) lines.push(`需要你决定：${decisionLine}`)
  lines.push(`下一步：${resolveNextStepLine(params.result)}`)
  lines.push(resolveTaskArchiveLine(params))
  return normalizeManagerReplyText(lines.join('\n'))
}
