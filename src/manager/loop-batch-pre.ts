import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { TaskResult, UserInput } from '../types/index.js'

const toMs = (value: string | undefined): number => {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export const isIdleSystemInput = (input: UserInput): boolean =>
  input.role === 'system' && input.text.includes('name="idle"')

export const hasNonIdleManagerInput = (inputs: UserInput[]): boolean =>
  inputs.some((input) => input.role !== 'system' || !isIdleSystemInput(input))

export const applyIntentCompletionCooldown = (
  runtime: RuntimeState,
  results: TaskResult[],
): void => {
  if (results.length === 0) return
  const latestByTaskId = new Map<string, TaskResult>()
  for (const result of results) {
    const existing = latestByTaskId.get(result.taskId)
    if (!existing || toMs(result.completedAt) >= toMs(existing.completedAt))
      latestByTaskId.set(result.taskId, result)
  }
  for (const intent of runtime.idleIntents) {
    if (intent.triggerPolicy.mode !== 'on_idle') continue
    const taskId = intent.lastTaskId?.trim()
    if (!taskId) continue
    const matched = latestByTaskId.get(taskId)
    if (!matched) continue
    intent.triggerState.lastCompletedAt = matched.completedAt
    intent.updatedAt = matched.completedAt
  }
}
