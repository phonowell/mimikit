const normalizeChoiceOption = (value) => {
  if (!value || typeof value !== 'object') return null
  const item = value
  const id = typeof item.id === 'string' ? item.id.trim() : ''
  const label = typeof item.label === 'string' ? item.label.trim() : ''
  const reason = typeof item.reason === 'string' ? item.reason.trim() : ''
  if (!id || !label || !reason) return null
  return { id, label, reason }
}

const reorderOptionsWithDefaultFirst = (options, defaultOptionId) => {
  const defaultIndex = options.findIndex((item) => item.id === defaultOptionId)
  if (defaultIndex <= 0) return options
  return [
    options[defaultIndex],
    ...options.slice(0, defaultIndex),
    ...options.slice(defaultIndex + 1),
  ]
}

const normalizeChoicePayload = (value) => {
  if (!value || typeof value !== 'object') return null
  const payload = value
  const id = typeof payload.id === 'string' ? payload.id.trim() : ''
  const question =
    typeof payload.question === 'string' ? payload.question.trim() : ''
  const defaultOptionId =
    typeof payload.defaultOptionId === 'string'
      ? payload.defaultOptionId.trim()
      : ''
  const expiresAt =
    typeof payload.expiresAt === 'string' ? payload.expiresAt.trim() : ''
  const optionsRaw = Array.isArray(payload.options) ? payload.options : []
  const options = optionsRaw
    .map(normalizeChoiceOption)
    .filter((item) => item !== null)
  if (!id || !question || !defaultOptionId || options.length < 2)
    return null
  if (!options.some((item) => item.id === defaultOptionId)) return null
  const orderedOptions = reorderOptionsWithDefaultFirst(options, defaultOptionId)
  return {
    id,
    question,
    options: orderedOptions,
    defaultOptionId,
    ...(expiresAt ? { expiresAt } : {}),
  }
}

export const normalizeChoicesPayload = (value) => {
  if (Array.isArray(value))
    return value.map(normalizeChoicePayload).filter((item) => item !== null)
  const choice = normalizeChoicePayload(value)
  return choice ? [choice] : []
}

export const formatChoiceRemaining = (expiresAt, nowMs = Date.now()) => {
  if (typeof expiresAt !== 'string' || !expiresAt.trim()) return ''
  const expiresAtMs = Date.parse(expiresAt)
  if (!Number.isFinite(expiresAtMs)) return ''
  const remainingMs = Math.max(0, expiresAtMs - nowMs)
  const totalSeconds = Math.floor(remainingMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export const resolveChoiceDefaultLabel = (choice) =>
  choice.options.find((item) => item.id === choice.defaultOptionId)?.label ??
  choice.defaultOptionId
