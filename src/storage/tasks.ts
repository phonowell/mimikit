import { join } from 'node:path'

import { readJson, writeJson } from '../fs/json.js'
import { safe } from '../log/safe.js'

import { listJsonPaths } from './dir.js'
import { withStoreLock } from './store-lock.js'

import type { Task } from '../types/tasks.js'

const taskPath = (dir: string, id: string): string => join(dir, `${id}.json`)

export const readTask = (dir: string, id: string): Promise<Task | null> => {
  const path = taskPath(dir, id)
  return safe('readTask: readJson', () => readJson<Task | null>(path, null), {
    fallback: null,
    meta: { path },
  })
}

export const writeTask = async (dir: string, task: Task): Promise<void> => {
  const path = taskPath(dir, task.id)
  await writeJson(path, task)
}

export const updateTask = (
  dir: string,
  id: string,
  updater: (task: Task) => Task,
): Promise<Task | null> => {
  const path = taskPath(dir, id)
  return withStoreLock(path, async () => {
    const current = await readTask(dir, id)
    if (!current) return null
    const next = updater(current)
    await writeJson(path, next)
    return next
  })
}

export const listTasks = async (dir: string): Promise<Task[]> => {
  const paths = await listJsonPaths(dir)
  if (paths.length === 0) return []
  const items = await Promise.all(
    paths.map(async (path) => {
      const task = await safe(
        'listTasks: readJson',
        () => readJson<Task | null>(path, null),
        {
          fallback: null,
          meta: { path },
        },
      )
      return task
    }),
  )
  return items.filter((task): task is Task => Boolean(task))
}
