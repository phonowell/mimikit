import type { Task } from '../types/tasks.js'

export const pickNextTask = (
  tasks: Task[],
  evalTriggerIds: Set<string>,
  opts?: { nowMs?: number; agingMs?: number; agingMaxBoost?: number },
): Task | null => {
  const nowMs = opts?.nowMs ?? Date.now()
  const eligible = tasks.filter((task) => {
    if (!task.deferUntil) return true
    const until = Date.parse(task.deferUntil)
    return !Number.isFinite(until) || until <= nowMs
  })
  if (eligible.length === 0) return null
  const agingMs = Math.max(1, opts?.agingMs ?? 60_000)
  const agingMaxBoost = Math.max(0, opts?.agingMaxBoost ?? 5)
  const sorted = [...eligible].sort((a, b) => {
    const ageA = Math.min(
      agingMaxBoost,
      Math.floor((nowMs - Date.parse(a.createdAt)) / agingMs),
    )
    const ageB = Math.min(
      agingMaxBoost,
      Math.floor((nowMs - Date.parse(b.createdAt)) / agingMs),
    )
    const pa = a.priority + ageA
    const pb = b.priority + ageB
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
