import { resolveSystemEvent } from '../../surface/shared/system-event.js'

import type { UserInput } from '../../foundation/types/index.js'

const toStringField = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

export const hasResumeChoiceEffectTask = (
  inputs: UserInput[] | undefined,
  taskId: string,
  op: string,
): boolean => {
  if (op !== 'resume') return false
  if (!inputs || inputs.length === 0) return false
  for (const input of inputs) {
    if (input.role !== 'system') continue
    const event = resolveSystemEvent(input)
    if (event.name !== 'user_choice') continue
    const effectType = toStringField(event.payload?.choice_effect_type)
    const effectTaskId = toStringField(event.payload?.choice_effect_task_id)
    if (effectType === 'resume_task' && effectTaskId === taskId) return true
  }
  return false
}
