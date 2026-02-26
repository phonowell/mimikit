import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { FocusId, TaskResult, UserInput } from '../types/index.js'

export const collectPreferredFocusIds = (
  runtime: RuntimeState,
  inputs: UserInput[],
  results: TaskResult[],
): FocusId[] => {
  const ids: FocusId[] = []
  for (const input of inputs) ids.push(input.focusId)
  for (const result of results) {
    const task = runtime.tasks.find((item) => item.id === result.taskId)
    if (task) ids.push(task.focusId)
  }
  return Array.from(new Set(ids.filter((id) => id.trim().length > 0)))
}
