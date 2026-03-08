import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { truncateText } from '../shared/text.js'

import type { ApplyResult } from './action-registrations.js'
import type { Parsed } from '../actions/model/spec.js'
import type { ManagerActionFeedback } from '../types/index.js'

type ActionLifecycleStage =
  | 'dispatch'
  | 'running'
  | 'applied'
  | 'failed'
  | 'stopped'

type ActionFeedbackStage = 'rejected' | 'invalid'

type ActionLogEntry = {
  stage: ActionLifecycleStage | ActionFeedbackStage
  action: string
  actionId?: string
  taskId?: string
  traceId?: string
  index?: number
  total?: number
  attrCount?: number
  omittedAttrCount?: number
  attrs?: Record<string, string>
  result?: ApplyResult
  error?: string
  hint?: string
  elapsedMs?: number
}

type ActionLogSink = (tag: '[manager] action', payload: ActionLogEntry) => void

type ActionLogPersistPayload = ActionLogEntry & {
  traceId?: string
  event: 'manager_action'
}

const MANAGER_ACTION_LOG_TAG = '[manager] action' as const
const MAX_ATTR_ENTRIES = 6
const MAX_ATTR_VALUE_CHARS = 96
const REDACTED = '[REDACTED]'
const SENSITIVE_KEY_RE =
  /(pass(word)?|pwd|secret|token|api[_-]?key|authorization|auth[_-]?token|bearer|cookie|session|credential|private[_-]?key|verify(_|-)?code|otp|captcha|验证码|口令|密钥)/i
const SENSITIVE_VALUE_RE =
  /sk-[a-z0-9]+|ghp_[a-z0-9]+|xox[baprs]-[a-z0-9-]+|bearer\s+[a-z0-9._-]+/i
const SENSITIVE_VALUE_GLOBAL_RE =
  /sk-[a-z0-9]+|ghp_[a-z0-9]+|xox[baprs]-[a-z0-9-]+|bearer\s+[a-z0-9._-]+/gi

const compact = (value: unknown): string =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()

const sanitizeText = (value: string): string =>
  value.replace(SENSITIVE_VALUE_GLOBAL_RE, REDACTED)

const summarize = (value: unknown): string =>
  truncateText(sanitizeText(compact(value)), MAX_ATTR_VALUE_CHARS, {
    normalizeWhitespace: true,
  })

const isSensitiveKey = (key: string): boolean =>
  SENSITIVE_KEY_RE.test(key.trim())

const shouldRedactValue = (key: string, value: string): boolean =>
  isSensitiveKey(key) || SENSITIVE_VALUE_RE.test(value.trim())

const summarizeAttrs = (
  attrs: Record<string, string>,
): {
  attrCount: number
  attrs?: Record<string, string>
  omittedAttrCount?: number
} => {
  const entries = Object.entries(attrs)
  const attrCount = entries.length
  if (attrCount === 0) return { attrCount }
  const attrsSummary: Record<string, string> = {}
  for (const [key, raw] of entries.slice(0, MAX_ATTR_ENTRIES))
    attrsSummary[key] = shouldRedactValue(key, raw) ? REDACTED : summarize(raw)

  return {
    attrCount,
    attrs: attrsSummary,
    ...(attrCount > MAX_ATTR_ENTRIES
      ? { omittedAttrCount: attrCount - MAX_ATTR_ENTRIES }
      : {}),
  }
}

const readAttr = (
  attrs: Record<string, string>,
  key: string,
): string | undefined => {
  const value = attrs[key]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

const resolveActionId = (item: Parsed): string | undefined =>
  readAttr(item.attrs, 'id') ??
  readAttr(item.attrs, 'task_id') ??
  readAttr(item.attrs, 'last_task_id')

const resolveTaskId = (item: Parsed): string | undefined => {
  const taskId = readAttr(item.attrs, 'task_id')
  if (taskId) return taskId
  const id = readAttr(item.attrs, 'id')
  if (id?.startsWith('task-')) return id
  const lastTaskId = readAttr(item.attrs, 'last_task_id')
  if (lastTaskId?.startsWith('task-')) return lastTaskId
  return undefined
}

const ATTEMPTED_ATTR_RE = /\b(id|task_id|last_task_id)\s*=\s*"([^"]+)"/gi

const resolveIdsFromAttempted = (
  attempted?: string,
): { actionId?: string; taskId?: string } => {
  if (!attempted) return {}
  let actionId: string | undefined
  let taskId: string | undefined
  for (const match of attempted.matchAll(ATTEMPTED_ATTR_RE)) {
    const key = match[1]?.toLowerCase()
    const value = match[2]?.trim()
    if (!key || !value) continue
    if (
      actionId === undefined &&
      (key === 'id' || key === 'task_id' || key === 'last_task_id')
    )
      actionId = value
    if (taskId === undefined) {
      if (key === 'task_id') taskId = value
      else if (
        (key === 'id' || key === 'last_task_id') &&
        value.startsWith('task-')
      )
        taskId = value
    }
  }
  return {
    ...(actionId ? { actionId } : {}),
    ...(taskId ? { taskId } : {}),
  }
}

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    const normalized = compact(error.message)
    if (normalized) return summarize(normalized)
    return error.name || 'unknown_error'
  }
  return summarize(String(error))
}

const resolveFeedbackStage = (error: string): ActionFeedbackStage =>
  error === 'action_execution_rejected' ? 'rejected' : 'invalid'

const defaultSink: ActionLogSink = (tag, payload) => {
  console.info(tag, payload)
}

let actionConsoleLogEnabled = true
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
    const attrs = summarizeAttrs(params.item.attrs)
    const actionId = resolveActionId(params.item)
    const taskId = resolveTaskId(params.item)
    const payload: ActionLogEntry = {
      stage: params.stage,
      action: params.item.name,
      ...(actionId ? { actionId } : {}),
      ...(taskId ? { taskId } : {}),
      index: params.index,
      total: params.total,
      attrCount: attrs.attrCount,
      ...(attrs.attrs ? { attrs: attrs.attrs } : {}),
      ...(attrs.omittedAttrCount !== undefined
        ? { omittedAttrCount: attrs.omittedAttrCount }
        : {}),
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
    const stage = resolveFeedbackStage(params.item.error)
    const ids = resolveIdsFromAttempted(params.item.attempted)
    const payload: ActionLogEntry = {
      stage,
      action: params.item.action,
      ...ids,
      index: params.index,
      total: params.total,
      error: summarize(params.item.error),
      hint: summarize(params.item.hint),
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
