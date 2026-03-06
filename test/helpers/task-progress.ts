import { join } from 'node:path'

import { listFiles } from '../../src/fs/paths.js'
import { readJsonl } from '../../src/storage/jsonl.js'

type TaskProgressEvent = {
  taskId: string
  type: string
  createdAt: string
  payload: Record<string, unknown>
}

const TASK_PROGRESS_DIR = 'task-progress'

const isTaskProgressEvent = (value: unknown): value is TaskProgressEvent => {
  if (!value || typeof value !== 'object') return false
  const event = value as Record<string, unknown>
  return (
    typeof event.taskId === 'string' &&
    event.taskId.trim().length > 0 &&
    typeof event.type === 'string' &&
    event.type.trim().length > 0 &&
    typeof event.createdAt === 'string' &&
    event.createdAt.trim().length > 0 &&
    Boolean(event.payload) &&
    typeof event.payload === 'object'
  )
}

export const readTaskProgressForTest = async (
  stateDir: string,
  taskId: string,
): Promise<TaskProgressEvent[]> => {
  const entries = await listFiles(join(stateDir, TASK_PROGRESS_DIR))
  const dateDirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  if (dateDirs.length === 0) return []
  const chunks = await Promise.all(
    dateDirs.map((dateDir) =>
      readJsonl<TaskProgressEvent>(
        join(stateDir, TASK_PROGRESS_DIR, dateDir, `${taskId}.jsonl`),
        { validate: (item) => (isTaskProgressEvent(item) ? item : undefined) },
      ),
    ),
  )
  return chunks.flat()
}
