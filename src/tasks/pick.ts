import type { Task } from '../types/tasks.js'

export const pickNextTask = (
  tasks: Task[],
  evalTriggerIds: Set<string>,
): Task | null => {
  if (tasks.length === 0) return null
  const sorted = [...tasks].sort((a, b) => {
    const pa = a.priority
    const pb = b.priority
    if (pa !== pb) return pb - pa
    const ea =
      a.sourceTriggerId && evalTriggerIds.has(a.sourceTriggerId) ? 1 : 0
    const eb =
      b.sourceTriggerId && evalTriggerIds.has(b.sourceTriggerId) ? 1 : 0
    if (ea !== eb) return eb - ea
    return Date.parse(a.createdAt) - Date.parse(b.createdAt)
  })
  return sorted[0] ?? null
}
