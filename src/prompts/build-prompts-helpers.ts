import { readTextFileIfExists } from '../fs/read-text.js'
import { readErrorCode } from '../shared/error-code.js'

import { escapeCdata } from './format-base.js'

import type { Task, TaskResult } from '../types/index.js'

const clipUtf8ByBytes = (value: string, maxBytes: number): string => {
  if (maxBytes <= 0) return ''
  const buffer = Buffer.from(value, 'utf8')
  if (buffer.byteLength <= maxBytes) return value
  return buffer.subarray(0, maxBytes).toString('utf8').trimEnd()
}

export const encodePromptSection = (value: string, maxBytes: number): string =>
  escapeCdata(clipUtf8ByBytes(value, maxBytes))

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

export const readOptionalMarkdown = async (path: string): Promise<string> => {
  try {
    return await readTextFileIfExists(path)
  } catch (error) {
    if (readErrorCode(error) === 'ENOENT') return ''
    throw error
  }
}
