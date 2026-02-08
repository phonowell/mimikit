import type { Task, TaskResult } from '../types/index.js'

export const mergeTaskResults = (
  primary: TaskResult[],
  secondary: TaskResult[],
): TaskResult[] => {
  const merged = new Map<string, TaskResult>()
  for (const result of secondary) merged.set(result.taskId, result)
  for (const result of primary) merged.set(result.taskId, result)
  const values = Array.from(merged.values())
  values.sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt))
  return values
}

export const dedupeTaskResults = (results: TaskResult[]): TaskResult[] =>
  mergeTaskResults(results, [])

export const collectTaskResults = (tasks: Task[]): TaskResult[] =>
  tasks
    .filter((task): task is Task & { result: TaskResult } =>
      Boolean(task.result),
    )
    .map((task) => task.result)

export const collectResultTaskIds = (tasks: Task[]): string[] =>
  tasks
    .filter((task) => task.status !== 'pending' && task.status !== 'running')
    .map((task) => task.id)

export const buildTaskResultDateHints = (
  tasks: Task[],
): Record<string, string> =>
  Object.fromEntries(
    tasks
      .filter(
        (task): task is Task & { completedAt: string } =>
          typeof task.completedAt === 'string' && task.completedAt.length > 0,
      )
      .map((task) => [task.id, task.completedAt.slice(0, 10)]),
  )
