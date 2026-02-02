import type { Task } from '../types/tasks.js'

export const pickNextTask = (
  tasks: Task[],
  opts?: { nowMs?: number },
): Task | null => {
  const nowMs = opts?.nowMs ?? Date.now()
  const done = new Set(
    tasks.filter((task) => task.status === 'done').map((task) => task.id),
  )
  const eligible = tasks.filter((task) => {
    if (task.status !== 'queued') return false
    if (task.blockedBy?.length)
      if (!task.blockedBy.every((id) => done.has(id))) return false

    if (!task.scheduledAt) return true
    const scheduled = Date.parse(task.scheduledAt)
    return !Number.isFinite(scheduled) || scheduled <= nowMs
  })
  if (eligible.length === 0) return null
  const sorted = [...eligible].sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority
    return Date.parse(a.createdAt) - Date.parse(b.createdAt)
  })
  return sorted[0] ?? null
}
