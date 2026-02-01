import { readJson, writeJson } from '../fs/json.js'

import { migrateTaskStatusIndex } from './migrations.js'
import { withStoreLock } from './store-lock.js'

import type { TaskStatus } from '../types/tasks.js'

export type TaskStatusIndex = Record<string, TaskStatus>

export const readTaskStatus = async (
  path: string,
): Promise<TaskStatusIndex> => {
  const raw = await readJson<unknown>(path, {})
  return migrateTaskStatusIndex(raw)
}

export const writeTaskStatus = async (
  path: string,
  index: TaskStatusIndex,
): Promise<void> => {
  await withStoreLock(path, async () => {
    await writeJson(path, index)
  })
}

export const upsertTaskStatus = async (
  path: string,
  status: TaskStatus,
): Promise<void> => {
  await withStoreLock(path, async () => {
    const index = await readTaskStatus(path)
    index[status.id] = status
    await writeJson(path, index)
  })
}
