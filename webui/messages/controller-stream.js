import { isRecord } from '../value.js'

const STREAM_FRAME_MS = 16

const asUsageNumber = (value) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const normalizeUsage = (raw) => {
  if (!isRecord(raw)) return null
  const input = asUsageNumber(raw.input)
  const output = asUsageNumber(raw.output)
  const inputCacheRead = asUsageNumber(raw.inputCacheRead)
  const inputCacheWrite = asUsageNumber(raw.inputCacheWrite)
  const outputCache = asUsageNumber(raw.outputCache)
  const total = asUsageNumber(raw.total)
  const sessionTotal = asUsageNumber(raw.sessionTotal)
  if (
    input === null &&
    output === null &&
    inputCacheRead === null &&
    inputCacheWrite === null &&
    outputCache === null &&
    total === null &&
    sessionTotal === null
  )
    return null
  return {
    ...(input !== null ? { input } : {}),
    ...(output !== null ? { output } : {}),
    ...(inputCacheRead !== null ? { inputCacheRead } : {}),
    ...(inputCacheWrite !== null ? { inputCacheWrite } : {}),
    ...(outputCache !== null ? { outputCache } : {}),
    ...(total !== null ? { total } : {}),
    ...(sessionTotal !== null ? { sessionTotal } : {}),
  }
}

export const scheduleFrame = (callback) => {
  if (
    typeof window !== 'undefined' &&
    typeof window.requestAnimationFrame === 'function'
  )
    return window.requestAnimationFrame(callback)
  return setTimeout(() => callback(Date.now()), STREAM_FRAME_MS)
}

export const cancelFrame = (handle) => {
  if (handle === null || handle === undefined) return
  if (
    typeof window !== 'undefined' &&
    typeof window.cancelAnimationFrame === 'function'
  ) {
    window.cancelAnimationFrame(handle)
    return
  }
  clearTimeout(handle)
}

export const normalizeStreamMessage = (raw) => {
  if (!isRecord(raw)) return null
  const role = typeof raw.role === 'string' ? raw.role : 'agent'
  if (role !== 'agent') return null
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  const text = typeof raw.text === 'string' ? raw.text : ''
  const usage = normalizeUsage(raw.usage)
  if (!id || (text.length === 0 && !usage)) return null
  const createdAt =
    typeof raw.createdAt === 'string' && raw.createdAt.trim()
      ? raw.createdAt
      : typeof raw.updatedAt === 'string' && raw.updatedAt.trim()
        ? raw.updatedAt
        : new Date().toISOString()
  return {
    id: `stream-${id}`,
    role: 'agent',
    text,
    ...(usage ? { usage } : {}),
    createdAt,
    streaming: true,
  }
}

const normalizeStreamPatch = (raw) => {
  if (!isRecord(raw)) return null
  const mode = typeof raw.mode === 'string' ? raw.mode.trim().toLowerCase() : ''
  if (mode === 'clear') return { mode: 'clear' }
  if (mode === 'replace') {
    if (!isRecord(raw.stream)) return null
    return { mode: 'replace', stream: raw.stream }
  }
  if (mode !== 'delta') return null
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  if (!id) return null
  const delta = typeof raw.delta === 'string' ? raw.delta : ''
  return {
    mode: 'delta',
    id,
    delta,
    ...(Object.prototype.hasOwnProperty.call(raw, 'usage')
      ? { usage: raw.usage }
      : {}),
  }
}

export const applyStreamPatch = (currentStreamMessage, patch) => {
  if (patch.mode === 'clear') return null
  if (patch.mode === 'replace') return normalizeStreamMessage(patch.stream)

  const streamId = `stream-${patch.id}`
  const base =
    currentStreamMessage?.id === streamId
      ? currentStreamMessage
      : {
          id: streamId,
          role: 'agent',
          text: '',
          createdAt: new Date().toISOString(),
          streaming: true,
        }
  const normalizedUsage = Object.prototype.hasOwnProperty.call(patch, 'usage')
    ? normalizeUsage(patch.usage)
    : undefined
  const nextText = `${base.text}${patch.delta}`
  return {
    ...base,
    text: nextText,
    ...(normalizedUsage === undefined
      ? 'usage' in base
        ? { usage: base.usage }
        : {}
      : normalizedUsage
        ? { usage: normalizedUsage }
        : {}),
  }
}

export const mergeStreamPatches = (rawPatches) => {
  const merged = []
  for (const rawPatch of rawPatches) {
    const patch = normalizeStreamPatch(rawPatch)
    if (!patch) continue
    const previous = merged[merged.length - 1]
    if (
      patch.mode !== 'delta' ||
      previous?.mode !== 'delta' ||
      previous.id !== patch.id
    ) {
      merged.push(patch)
      continue
    }
    previous.delta += patch.delta
    if (Object.prototype.hasOwnProperty.call(patch, 'usage'))
      previous.usage = patch.usage
  }
  return merged
}
