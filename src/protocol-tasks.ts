import { readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { ProtocolPaths } from './protocol-paths.js'
import type { PendingTask } from './protocol-types.js'

const readTasksFromDir = async (dir: string): Promise<PendingTask[]> => {
  let files: string[]
  try {
    files = await readdir(dir)
  } catch {
    return []
  }
  const tasks: PendingTask[] = []
  for (const file of files) {
    if (!file.endsWith('.json')) continue
    try {
      const data = await readFile(join(dir, file), 'utf-8')
      tasks.push(JSON.parse(data) as PendingTask)
    } catch {
      // ignore corrupted files
    }
  }
  return tasks.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )
}

export const getPendingTasks = (paths: ProtocolPaths): Promise<PendingTask[]> =>
  readTasksFromDir(paths.pendingTasksDir)

export const getInflightTasks = (
  paths: ProtocolPaths,
): Promise<PendingTask[]> => readTasksFromDir(paths.inflightTasksDir)

export const addPendingTask = async (
  paths: ProtocolPaths,
  task: PendingTask,
): Promise<void> => {
  const path = join(paths.pendingTasksDir, `${task.id}.json`)
  await writeFile(path, JSON.stringify(task, null, 2))
}

export const claimPendingTasks = async (
  paths: ProtocolPaths,
): Promise<PendingTask[]> => {
  let files: string[]
  try {
    files = await readdir(paths.pendingTasksDir)
  } catch {
    return []
  }
  const tasks: PendingTask[] = []
  for (const file of files) {
    if (!file.endsWith('.json')) continue
    const fromPath = join(paths.pendingTasksDir, file)
    const inflightPath = join(paths.inflightTasksDir, file)
    try {
      await rename(fromPath, inflightPath)
      const data = await readFile(inflightPath, 'utf-8')
      tasks.push(JSON.parse(data) as PendingTask)
    } catch {
      // ignore corrupted files
    }
  }
  return tasks.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )
}

export const returnPendingTask = async (
  paths: ProtocolPaths,
  task: PendingTask,
): Promise<void> => {
  const inflightPath = join(paths.inflightTasksDir, `${task.id}.json`)
  const pendingPath = join(paths.pendingTasksDir, `${task.id}.json`)
  try {
    await rename(inflightPath, pendingPath)
  } catch {
    await writeFile(pendingPath, JSON.stringify(task, null, 2))
    try {
      await unlink(inflightPath)
    } catch {
      // ignore
    }
  }
}

export const clearInflightTask = async (
  paths: ProtocolPaths,
  taskId: string,
): Promise<void> => {
  const inflightPath = join(paths.inflightTasksDir, `${taskId}.json`)
  try {
    await unlink(inflightPath)
  } catch {
    // ignore
  }
}

export const restoreInflightTasks = async (
  paths: ProtocolPaths,
): Promise<void> => {
  let files: string[]
  try {
    files = await readdir(paths.inflightTasksDir)
  } catch {
    return
  }
  for (const file of files) {
    if (!file.endsWith('.json')) continue
    const inflightPath = join(paths.inflightTasksDir, file)
    const pendingPath = join(paths.pendingTasksDir, file)
    try {
      await rename(inflightPath, pendingPath)
    } catch {
      // ignore
    }
  }
}
