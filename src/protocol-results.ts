import { readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { trimTaskResult, withLock } from './protocol-utils.js'

import type { ProtocolPaths } from './protocol-paths.js'
import type { TaskResult } from './protocol-types.js'

export const writeTaskResult = async (
  paths: ProtocolPaths,
  result: TaskResult,
): Promise<void> => {
  const path = join(paths.taskResultsDir, `${result.id}.json`)
  await writeFile(path, JSON.stringify(result, null, 2))
  await appendTaskHistory(paths, result)
}

export const getTaskResults = async (
  paths: ProtocolPaths,
): Promise<TaskResult[]> => {
  let files: string[]
  try {
    files = await readdir(paths.taskResultsDir)
  } catch {
    return []
  }
  const results: TaskResult[] = []
  for (const file of files) {
    if (!file.endsWith('.json')) continue
    try {
      const data = await readFile(join(paths.taskResultsDir, file), 'utf-8')
      results.push(JSON.parse(data) as TaskResult)
    } catch {
      // ignore corrupted files
    }
  }
  return results
}

export const clearTaskResult = async (
  paths: ProtocolPaths,
  taskId: string,
): Promise<void> => {
  const path = join(paths.taskResultsDir, `${taskId}.json`)
  try {
    await unlink(path)
  } catch {
    // ignore
  }
}

export const getTaskHistory = async (
  paths: ProtocolPaths,
  limit = 200,
): Promise<TaskResult[]> => {
  try {
    const data = await readFile(paths.taskHistoryPath, 'utf-8')
    const history = JSON.parse(data) as TaskResult[]
    return history.slice(-limit)
  } catch {
    return []
  }
}

export const appendTaskHistory = async (
  paths: ProtocolPaths,
  result: TaskResult,
): Promise<void> => {
  await withLock(paths.taskHistoryPath, async () => {
    const history = await getTaskHistory(paths, 1000)
    history.push(trimTaskResult(result))
    const trimmed = history.slice(-1000)
    await writeFile(paths.taskHistoryPath, JSON.stringify(trimmed, null, 2))
  })
}
