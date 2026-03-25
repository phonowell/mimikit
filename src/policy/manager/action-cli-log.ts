import { appendLog } from '../../persistence/log/append.js'
import { bestEffort } from '../../persistence/log/safe.js'

import type { ApplyResult } from './action-registry-shared.js'
import type { ManagerActionFeedback } from '../../foundation/types/index.js'
import type { Parsed } from '../actions/model/spec.js'

export type ActionLifecycleStage =
  | 'dispatch'
  | 'running'
  | 'applied'
  | 'failed'
  | 'stopped'
type ActionFeedbackStage = 'rejected' | 'invalid'
type ActionLogEntry = {
  stage: ActionLifecycleStage | ActionFeedbackStage
  action: string
  taskId?: string
  traceId?: string
  index?: number
  total?: number
  result?: ApplyResult
  error?: string
  elapsedMs?: number
}

type ActionLogSink = (tag: '[manager] action', payload: ActionLogEntry) => void

type ActionLogPersistPayload = ActionLogEntry & {
  traceId?: string
  event: 'manager_action'
}

const MANAGER_ACTION_LOG_TAG = '[manager] action' as const
const TASK_ID_RE = /\b(?:task_id|id|last_task_id)\s*=\s*"([^"]+)"/i

const defaultSink: ActionLogSink = (tag, payload) => {
  console.info(tag, payload)
}

let actionConsoleLogEnabled = !process.env.VITEST
let actionLogPath: string | undefined

export const configureManagerActionCliLogger = (params?: {
  enabled?: boolean
  logPath?: string | null
}): void => {
  if (params && Object.prototype.hasOwnProperty.call(params, 'enabled'))
    actionConsoleLogEnabled = params.enabled ?? true
  if (params && Object.prototype.hasOwnProperty.call(params, 'logPath')) {
    const logPath = params.logPath?.trim()
    actionLogPath = logPath && logPath.length > 0 ? logPath : undefined
  }
}

const persistActionLog = async (
  payload: ActionLogPersistPayload,
): Promise<void> => {
  const logPath = actionLogPath
  if (!logPath) return
  await bestEffort('appendLog: manager_action', () =>
    appendLog(logPath, payload as unknown as Record<string, unknown>),
  )
}

const normalize = (value: unknown): string =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()

const readTaskId = (item: Parsed): string | undefined => {
  const taskId = item.attrs.task_id?.trim()
  if (taskId) return taskId
  const id = item.attrs.id?.trim()
  if (id?.startsWith('task-')) return id
  const lastTaskId = item.attrs.last_task_id?.trim()
  if (lastTaskId?.startsWith('task-')) return lastTaskId
  return undefined
}

const readTaskIdFromAttempted = (attempted?: string): string | undefined => {
  const matched = attempted?.match(TASK_ID_RE)?.[1]?.trim()
  return matched?.startsWith('task-') ? matched : undefined
}

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return normalize(error.message) || error.name
  return normalize(error)
}

export const createManagerActionCliLogger = (options?: {
  sink?: ActionLogSink
}): {
  logLifecycle: (params: {
    stage: ActionLifecycleStage
    item: Parsed
    index: number
    total: number
    result?: ApplyResult
    error?: unknown
    elapsedMs?: number
    traceId?: string
  }) => Promise<void>
  logFeedback: (params: {
    item: ManagerActionFeedback
    index: number
    total: number
    traceId?: string
  }) => Promise<void>
} => {
  const sink = options?.sink ?? defaultSink

  const logLifecycle = async (params: {
    stage: ActionLifecycleStage
    item: Parsed
    index: number
    total: number
    result?: ApplyResult
    error?: unknown
    elapsedMs?: number
    traceId?: string
  }): Promise<void> => {
    const taskId = readTaskId(params.item)
    const payload: ActionLogEntry = {
      stage: params.stage,
      action: params.item.name,
      ...(taskId ? { taskId } : {}),
      index: params.index,
      total: params.total,
      ...(params.result ? { result: params.result } : {}),
      ...(params.error !== undefined
        ? { error: toErrorMessage(params.error) }
        : {}),
      ...(params.elapsedMs !== undefined
        ? { elapsedMs: params.elapsedMs }
        : {}),
      ...(params.traceId ? { traceId: params.traceId } : {}),
    }
    if (actionConsoleLogEnabled) sink(MANAGER_ACTION_LOG_TAG, payload)
    await persistActionLog({
      event: 'manager_action',
      ...(params.traceId ? { traceId: params.traceId } : {}),
      ...payload,
    })
  }

  const logFeedback = async (params: {
    item: ManagerActionFeedback
    index: number
    total: number
    traceId?: string
  }): Promise<void> => {
    const taskId = readTaskIdFromAttempted(params.item.attempted)
    const payload: ActionLogEntry = {
      stage:
        params.item.error === 'action_execution_rejected'
          ? 'rejected'
          : 'invalid',
      action: params.item.action,
      ...(taskId ? { taskId } : {}),
      index: params.index,
      total: params.total,
      error: normalize(params.item.error),
      ...(params.traceId ? { traceId: params.traceId } : {}),
    }
    if (actionConsoleLogEnabled) sink(MANAGER_ACTION_LOG_TAG, payload)
    await persistActionLog({
      event: 'manager_action',
      ...(params.traceId ? { traceId: params.traceId } : {}),
      ...payload,
    })
  }

  return { logLifecycle, logFeedback }
}

export const managerActionCliLogger = createManagerActionCliLogger()
