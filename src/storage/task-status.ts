import { readJson, writeJson } from '../fs/json.js'

import type { TaskStatus } from '../types/tasks.js'

export type TaskStatusIndex = Record<string, TaskStatus>

export const readTaskStatus = (path: string): Promise<TaskStatusIndex> =>
  readJson<TaskStatusIndex>(path, {})

export const writeTaskStatus = async (
  path: string,
  index: TaskStatusIndex,
): Promise<void> => {
  await writeJson(path, index)
}

export const upsertTaskStatus = async (
  path: string,
  status: TaskStatus,
): Promise<void> => {
  const index = await readTaskStatus(path)
  index[status.id] = status
  await writeTaskStatus(path, index)
}
