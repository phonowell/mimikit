import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'

import {
  type ActionLifecycleStage,
  type ActionLogEntry,
  buildFeedbackActionLogEntry,
  buildLifecycleActionLogEntry,
} from './action-cli-log-payload.js'

import type { ApplyResult } from './action-registry-shared.js'
import type { Parsed } from '../actions/model/spec.js'
import type { ManagerActionFeedback } from '../types/index.js'

type ActionLogSink = (tag: '[manager] action', payload: ActionLogEntry) => void

type ActionLogPersistPayload = ActionLogEntry & {
  traceId?: string
  event: 'manager_action'
}

const MANAGER_ACTION_LOG_TAG = '[manager] action' as const

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
    const payload = buildLifecycleActionLogEntry(params)
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
    const payload = buildFeedbackActionLogEntry(params)
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
