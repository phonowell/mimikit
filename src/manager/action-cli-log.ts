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
  index?: number
  total?: number
  attrCount?: number
  omittedAttrCount?: number
  attrs?: Record<string, string>
  result?: ApplyResult
  error?: string
  hint?: string
}

type ActionLogSink = (tag: '[manager] action', payload: ActionLogEntry) => void

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
  }) => void
  logFeedback: (params: {
    item: ManagerActionFeedback
    index: number
    total: number
  }) => void
} => {
  const sink = options?.sink ?? defaultSink

  const logLifecycle = (params: {
    stage: ActionLifecycleStage
    item: Parsed
    index: number
    total: number
    result?: ApplyResult
    error?: unknown
  }): void => {
    const attrs = summarizeAttrs(params.item.attrs)
    sink(MANAGER_ACTION_LOG_TAG, {
      stage: params.stage,
      action: params.item.name,
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
    })
  }

  const logFeedback = (params: {
    item: ManagerActionFeedback
    index: number
    total: number
  }): void => {
    const stage = resolveFeedbackStage(params.item.error)
    sink(MANAGER_ACTION_LOG_TAG, {
      stage,
      action: params.item.action,
      index: params.index,
      total: params.total,
      error: summarize(params.item.error),
      hint: summarize(params.item.hint),
    })
  }

  return { logLifecycle, logFeedback }
}

export const managerActionCliLogger = createManagerActionCliLogger()
