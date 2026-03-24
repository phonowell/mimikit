import { randomUUID } from 'node:crypto'

import { normalizeUsage } from '../../foundation/shared/utils.js'

import { asRecord, asString } from './provider-payload.js'

import type { TokenUsage } from './token-usage.js'
import type {
  OpenAiResponsesProviderRequest,
  ProviderPromptSegment,
} from './types.js'

const toDataPayload = (chunk: string): unknown => {
  const dataLines = chunk
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
  if (dataLines.length === 0) return null
  const raw = dataLines.join('\n').trim()
  if (!raw || raw === '[DONE]') return null
  return JSON.parse(raw) as unknown
}

const readCompletedOutput = (completed: Record<string, unknown>): string => {
  const { output } = completed
  if (!Array.isArray(output)) return ''
  let text = ''
  for (const item of output) {
    const itemRecord = asRecord(item)
    if (asString(itemRecord, 'type') !== 'message') continue
    const content = itemRecord?.content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      const partRecord = asRecord(part)
      if (asString(partRecord, 'type') !== 'output_text') continue
      text += asString(partRecord, 'text') ?? ''
    }
  }
  return text
}

const parseJsonRecord = (raw: string): Record<string, unknown> | null => {
  try {
    return asRecord(JSON.parse(raw))
  } catch {
    return null
  }
}

export const readResponsesErrorMessage = (raw: string): string | undefined => {
  const payload = parseJsonRecord(raw)
  const message = asString(payload, 'message')
  if (message) return message
  const error = asRecord(payload?.error)
  return asString(error, 'message')
}

const readIncompleteReason = (
  payload: Record<string, unknown> | null | undefined,
): string | undefined => {
  const details = asRecord(payload?.incomplete_details)
  return asString(details, 'reason')
}

const buildIncompleteMessage = (
  payload: Record<string, unknown> | null | undefined,
): string => {
  const reason = readIncompleteReason(payload)
  return reason ? `responses_incomplete:${reason}` : 'responses_incomplete'
}

export const resolveSessionId = (
  threadId: string | null | undefined,
): string => {
  const current = threadId?.trim()
  if (current) return current
  return `session-${randomUUID()}`
}

const toPromptSegments = (
  request: OpenAiResponsesProviderRequest,
): ProviderPromptSegment[] => {
  if (!request.promptSegments || request.promptSegments.length === 0)
    return [{ text: request.prompt }]

  const normalized = request.promptSegments
    .map((segment) => ({
      text: segment.text,
      ...(segment.cacheControl ? { cacheControl: segment.cacheControl } : {}),
    }))
    .filter((segment) => segment.text.trim().length > 0)
  if (normalized.length === 0) return [{ text: request.prompt }]
  return normalized
}

export const buildResponsesInput = (
  request: OpenAiResponsesProviderRequest,
): Array<Record<string, unknown>> => {
  const segments = toPromptSegments(request)
  return segments.map((segment) => ({
    role: 'user',
    content: [
      {
        type: 'input_text',
        text: segment.text,
      },
    ],
  }))
}

export const parseResponsesSse = (
  raw: string,
): { output: string; usage?: TokenUsage } => {
  const chunks = raw.split(/\r?\n\r?\n/)
  let completed: Record<string, unknown> | null = null
  let latestOutputText = ''
  for (const chunk of chunks) {
    if (!chunk.trim()) continue
    let payload: unknown
    try {
      payload = toDataPayload(chunk)
    } catch {
      continue
    }
    const event = asRecord(payload)
    const type = asString(event, 'type')
    if (!type) continue
    if (type === 'response.output_text.done') {
      latestOutputText = asString(event, 'text') ?? latestOutputText
      continue
    }
    if (type === 'response.failed') {
      const response = asRecord(event?.response)
      const error = asRecord(response?.error)
      throw new Error(asString(error, 'message') ?? 'responses_failed')
    }
    if (type === 'response.incomplete') {
      const response = asRecord(event?.response)
      throw new Error(buildIncompleteMessage(response))
    }
    if (type === 'error')
      throw new Error(asString(event, 'message') ?? 'responses_error')
    if (type === 'response.completed') completed = asRecord(event?.response)
  }
  if (!completed) throw new Error('responses_completed_event_missing')
  const usage = normalizeUsage(completed.usage ?? null)
  const output = readCompletedOutput(completed) || latestOutputText
  return { output, ...(usage ? { usage } : {}) }
}

export const parseResponsesJson = (
  raw: string,
): { output: string; usage?: TokenUsage } => {
  const payload = parseJsonRecord(raw)
  if (!payload) throw new Error('responses_json_parse_failed')
  if (
    asString(payload, 'type') === 'response.incomplete' ||
    asString(payload, 'status') === 'incomplete'
  )
    throw new Error(buildIncompleteMessage(payload))
  const message = readResponsesErrorMessage(raw)
  if (message && (payload.error || typeof payload.code === 'number'))
    throw new Error(message)

  const usage = normalizeUsage(payload.usage ?? null)
  const output =
    readCompletedOutput(payload) || (asString(payload, 'output_text') ?? '')
  return { output, ...(usage ? { usage } : {}) }
}

export const parseResponsesPayload = (
  raw: string,
): { output: string; usage?: TokenUsage } => {
  const trimmed = raw.trimStart()
  if (trimmed.startsWith('{') || trimmed.startsWith('['))
    return parseResponsesJson(raw)
  return parseResponsesSse(raw)
}
