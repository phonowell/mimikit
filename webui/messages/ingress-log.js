const SYSTEM_EVENT_TAG_PATTERN =
  /<M:system_event\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/M:system_event>/i
const SUMMARY_MAX_LENGTH = 120
const MAX_TRACKED_SIGNATURES = 500

const compactText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim()

const summarizeText = (value, maxLength = SUMMARY_MAX_LENGTH) => {
  const normalized = compactText(value)
  if (!normalized) return ''
  if (!Number.isFinite(maxLength) || maxLength <= 0) return normalized
  const limit = Math.floor(maxLength)
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, limit)}...`
}

const asRecord = (value) =>
  value && typeof value === 'object' ? value : null

const parseSystemEvent = (text) => {
  const source = String(text ?? '').trim()
  if (!source) return { summary: '' }
  const matched = source.match(SYSTEM_EVENT_TAG_PATTERN)
  if (!matched) return { summary: source }
  const fullTag = matched[0]
  const name = compactText(matched[1])
  const payloadRaw = compactText(matched[2])
  const summary = source.replace(fullTag, '').trim()
  if (!payloadRaw)
    return { summary, ...(name ? { name } : {}) }
  try {
    const payload = asRecord(JSON.parse(payloadRaw))
    return {
      summary,
      ...(name ? { name } : {}),
      ...(payload ? { payload } : {}),
    }
  } catch {
    return { summary, ...(name ? { name } : {}) }
  }
}

const resolveType = (message, systemEvent) => {
  const role = compactText(message?.role).toLowerCase()
  if (role === 'system')
    return systemEvent?.name ? `system_event:${systemEvent.name}` : 'system'
  if (role === 'user') return 'user_message'
  if (role === 'agent') return 'agent_message'
  return role || 'unknown'
}

const resolveSource = (message, systemEvent) => {
  const explicitSource = compactText(message?.source)
  if (explicitSource) return explicitSource
  const payloadSource = compactText(systemEvent?.payload?.source)
  if (payloadSource) return payloadSource
  if (systemEvent?.name) return `system_event:${systemEvent.name}`
  return 'unknown'
}

const resolveVisibility = (message) => {
  const visibility = compactText(message?.visibility).toLowerCase()
  if (visibility === 'user' || visibility === 'agent' || visibility === 'all')
    return visibility
  return message?.role === 'system' ? 'unknown' : 'all'
}

const buildMessageLogEntry = (message) => {
  const role = compactText(message?.role).toLowerCase() || 'unknown'
  const systemEvent = role === 'system' ? parseSystemEvent(message?.text) : null
  const summary = summarizeText(
    role === 'system' ? systemEvent?.summary ?? '' : message?.text,
  )
  return {
    id:
      message?.id === null || message?.id === undefined
        ? undefined
        : String(message.id),
    role,
    type: resolveType(message, systemEvent),
    source: resolveSource(message, systemEvent),
    visibility: resolveVisibility(message),
    summary: summary || '(empty)',
  }
}

export const createIngressLogger = () => {
  const signatureByMessageId = new Map()
  let anonymousCounter = 0

  const trimTrackedSignatures = () => {
    while (signatureByMessageId.size > MAX_TRACKED_SIGNATURES) {
      const oldestKey = signatureByMessageId.keys().next().value
      if (oldestKey === undefined) break
      signatureByMessageId.delete(oldestKey)
    }
  }

  const logIncomingMessages = ({ mode, incoming }) => {
    if (!Array.isArray(incoming) || incoming.length === 0) return

    let loggedCount = 0
    let skippedCount = 0
    for (let index = 0; index < incoming.length; index += 1) {
      const message = incoming[index]
      const entry = buildMessageLogEntry(message)
      const dedupeId = entry.id ?? `anon-${anonymousCounter + index}`
      const signature = JSON.stringify(entry)
      if (signatureByMessageId.get(dedupeId) === signature) {
        skippedCount += 1
        continue
      }
      signatureByMessageId.set(dedupeId, signature)
      trimTrackedSignatures()
      console.info('[webui] session ingress message', entry)
      loggedCount += 1
    }
    anonymousCounter += incoming.length

    if (loggedCount > 0 || skippedCount > 0) {
      console.info('[webui] session ingress batch', {
        mode: compactText(mode) || 'full',
        incomingCount: incoming.length,
        loggedCount,
        skippedCount,
      })
    }
  }

  return { logIncomingMessages }
}
