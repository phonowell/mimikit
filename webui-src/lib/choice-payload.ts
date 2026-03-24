import type { ChoiceOption, ChoiceView } from '../types.js'

type RawChoicePayload = {
  id?: unknown
  question?: unknown
  defaultOptionId?: unknown
  expiresAt?: unknown
  options?: unknown
}

const normalizeChoiceOption = (value: unknown): ChoiceOption | null => {
  if (!value || typeof value !== 'object') return null
  const item = value as {
    id?: unknown
    label?: unknown
    reason?: unknown
  }
  const id = typeof item.id === 'string' ? item.id.trim() : ''
  const label = typeof item.label === 'string' ? item.label.trim() : ''
  const reason = typeof item.reason === 'string' ? item.reason.trim() : ''
  if (!id || !label || !reason) return null
  return { id, label, reason }
}

const reorderOptionsWithDefaultFirst = (
  options: ChoiceOption[],
  defaultOptionId: string,
): ChoiceOption[] => {
  const defaultIndex = options.findIndex((item) => item.id === defaultOptionId)
  if (defaultIndex <= 0) return options
  const defaultOption = options[defaultIndex]
  if (!defaultOption) return options
  return [
    defaultOption,
    ...options.slice(0, defaultIndex),
    ...options.slice(defaultIndex + 1),
  ]
}

const normalizeChoicePayload = (value: unknown): ChoiceView | null => {
  if (!value || typeof value !== 'object') return null
  const payload = value as RawChoicePayload
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
    .filter((item): item is ChoiceOption => item !== null)
  if (!id || !question || !defaultOptionId || options.length < 2) return null
  if (!options.some((item) => item.id === defaultOptionId)) return null
  return {
    id,
    question,
    options: reorderOptionsWithDefaultFirst(options, defaultOptionId),
    defaultOptionId,
    ...(expiresAt ? { expiresAt } : {}),
  }
}

export const normalizeChoicesPayload = (value: unknown): ChoiceView[] => {
  if (Array.isArray(value)) {
    return value
      .map(normalizeChoicePayload)
      .filter((item): item is ChoiceView => item !== null)
  }
  const choice = normalizeChoicePayload(value)
  return choice ? [choice] : []
}

export const formatChoiceRemaining = (
  expiresAt: string | undefined,
  nowMs = Date.now(),
): string => {
  if (typeof expiresAt !== 'string' || !expiresAt.trim()) return ''
  const expiresAtMs = Date.parse(expiresAt)
  if (!Number.isFinite(expiresAtMs)) return ''
  const remainingMs = Math.max(0, expiresAtMs - nowMs)
  const totalSeconds = Math.floor(remainingMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export const resolveChoiceDefaultLabel = (choice: ChoiceView): string =>
  choice.options.find((item) => item.id === choice.defaultOptionId)?.label ??
  choice.defaultOptionId
