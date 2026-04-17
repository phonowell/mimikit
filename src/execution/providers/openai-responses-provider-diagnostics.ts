import { asRecord, asString } from '../../foundation/shared/json.js'

export const parseJsonRecord = (
  raw: string,
): Record<string, unknown> | null => {
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

export const summarizeResponsesPayload = (
  raw: string,
): {
  chunkCount: number
  parseErrorCount: number
  hasCompletedEvent: boolean
  hasIncompleteEvent: boolean
  hasFailedEvent: boolean
  lastEventTypes: string[]
  tailPreview: string
} => {
  const trimmed = raw.trimStart()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const payload = parseJsonRecord(raw)
    const type =
      asString(payload, 'type') ?? asString(payload, 'status') ?? '<json>'
    return {
      chunkCount: raw.trim().length > 0 ? 1 : 0,
      parseErrorCount: payload ? 0 : 1,
      hasCompletedEvent:
        type === 'response.completed' ||
        asString(payload, 'status') === 'completed',
      hasIncompleteEvent:
        type === 'response.incomplete' ||
        asString(payload, 'status') === 'incomplete',
      hasFailedEvent:
        type === 'response.failed' ||
        type === 'error' ||
        Boolean(payload?.error),
      lastEventTypes: [payload ? type : '<parse_error>'],
      tailPreview: raw.slice(-240),
    }
  }

  const chunks = raw.split(/\r?\n\r?\n/)
  const eventTypes: string[] = []
  let chunkCount = 0
  let parseErrorCount = 0
  for (const chunk of chunks) {
    if (!chunk.trim()) continue
    chunkCount += 1
    try {
      const payload = toDataPayload(chunk)
      const event = asRecord(payload)
      const type = asString(event, 'type')
      if (type) eventTypes.push(type)
    } catch {
      parseErrorCount += 1
      eventTypes.push('<parse_error>')
    }
  }
  return {
    chunkCount,
    parseErrorCount,
    hasCompletedEvent: eventTypes.includes('response.completed'),
    hasIncompleteEvent: eventTypes.includes('response.incomplete'),
    hasFailedEvent:
      eventTypes.includes('response.failed') || eventTypes.includes('error'),
    lastEventTypes: eventTypes.slice(-8),
    tailPreview: raw.slice(-240),
  }
}
