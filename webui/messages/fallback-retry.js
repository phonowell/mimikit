const RETRY_VISIBLE_STATES = new Set(['exhausted', 'not_retryable'])

const asRecord = (value) =>
  value && typeof value === 'object' ? value : null

const asText = (value) => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

const asCount = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const normalized = Math.floor(value)
  return normalized >= 0 ? normalized : undefined
}

const readPayload = (message) => asRecord(message?.systemEventPayload)

const resolveRetrySourceInputId = (message) => {
  const payload = readPayload(message)
  return asText(payload?.source_input_id)
}

const findUserMessageById = (messages, inputId) => {
  for (const message of messages) {
    if (!message || message.role !== 'user') continue
    if (String(message.id) !== inputId) continue
    const text = asText(message.text)
    if (!text) return null
    return { inputId, text }
  }
  return null
}

const findNearestUserBeforeFallback = (messages, fallbackMessageId) => {
  let fallbackIndex = -1
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]
    if (!message?.id) continue
    if (String(message.id) === fallbackMessageId) {
      fallbackIndex = index
      break
    }
  }
  if (fallbackIndex < 0) return null

  for (let index = fallbackIndex - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!message || message.role !== 'user') continue
    const text = asText(message.text)
    if (!text) continue
    return { inputId: String(message.id), text }
  }
  return null
}

export const isManagerFallbackMessage = (message) =>
  message?.role === 'system' &&
  asText(message?.systemEventName) === 'manager_fallback_reply'

export const shouldShowManagerFallbackRetry = (message) => {
  if (!isManagerFallbackMessage(message)) return false
  const payload = readPayload(message)
  const state = asText(payload?.auto_retry_state)
  if (!state) return true
  return RETRY_VISIBLE_STATES.has(state)
}

export const resolveManagerFallbackRetrySource = (messages, fallbackMessage) => {
  if (!shouldShowManagerFallbackRetry(fallbackMessage)) return null
  const sourceInputId = resolveRetrySourceInputId(fallbackMessage)
  if (sourceInputId) {
    const byId = findUserMessageById(messages, sourceInputId)
    if (byId) return byId
  }
  const fallbackMessageId = asText(fallbackMessage?.id)
  if (!fallbackMessageId) return null
  return findNearestUserBeforeFallback(messages, fallbackMessageId)
}

export const readManagerFallbackRetryStats = (message) => {
  if (!isManagerFallbackMessage(message)) return null
  const payload = readPayload(message)
  return {
    attempts: asCount(payload?.auto_retry_attempts) ?? 0,
    maxAttempts: asCount(payload?.auto_retry_max_attempts) ?? 0,
    strategy: asText(payload?.auto_retry_strategy) ?? 'unspecified',
    state: asText(payload?.auto_retry_state) ?? 'unknown',
  }
}

export const formatManagerFallbackRetryHint = (message) => {
  const stats = readManagerFallbackRetryStats(message)
  if (!stats) return ''
  if (stats.attempts <= 0) return ''
  const suffix = stats.attempts === 1 ? '' : 's'
  return `Auto-retried ${stats.attempts} time${suffix} before failure.`
}
