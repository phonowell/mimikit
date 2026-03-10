import { rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { checkExistingPathBoundary } from '../fs/path-safety.js'
import { listFiles } from '../fs/paths.js'
import { filterHistory } from '../history/store.js'
import { readErrorCode } from '../shared/error-code.js'
import { resolveSystemEvent } from '../shared/system-event.js'

type RemoveFileWithinRootResult = 'deleted' | 'missing' | 'outside' | 'skipped'

const TASK_PROGRESS_DIR = 'task-progress'
const WORKER_TASK_PROMPT_DIR = 'generated/worker-task-prompts'

const removeTaskNamedFiles = async (params: {
  workDir: string
  rootDir: string
  targetName: string
  nestedDirectoriesOnly: boolean
}): Promise<number> => {
  const rootPath = join(params.workDir, params.rootDir)
  const entries = await listFiles(rootPath)
  let deleted = 0
  for (const entry of entries) {
    if (!params.nestedDirectoriesOnly && entry.isFile()) {
      if (entry.name !== params.targetName) continue
      await rm(join(rootPath, entry.name), { force: true })
      deleted += 1
      continue
    }
    if (!entry.isDirectory()) continue
    const dirPath = join(rootPath, entry.name)
    const files = await listFiles(dirPath)
    const target = files.find(
      (item) => item.isFile() && item.name === params.targetName,
    )
    if (!target) continue
    await rm(join(dirPath, target.name), { force: true })
    deleted += 1
  }
  return deleted
}

export const removeFileWithinRoot = async (params: {
  rootPath: string
  targetPath?: string
}): Promise<RemoveFileWithinRootResult> => {
  const raw = params.targetPath?.trim()
  if (!raw) return 'skipped'
  const rootPath = resolve(params.rootPath)
  const targetPath = resolve(rootPath, raw)
  const boundary = await checkExistingPathBoundary({ rootPath, targetPath })
  if (boundary === 'outside') return 'outside'
  if (boundary === 'missing') return 'missing'
  try {
    await rm(targetPath, { force: true })
    return 'deleted'
  } catch (error) {
    if (readErrorCode(error) === 'ENOENT') return 'missing'
    throw error
  }
}

export const removeTaskSystemHistoryEntries = async (
  historyPath: string,
  taskId: string,
): Promise<number> => {
  const { beforeCount, afterCount } = await filterHistory(
    historyPath,
    (item) => {
      if (item.role !== 'system') return true
      const parsed = resolveSystemEvent(item)
      const eventTaskId =
        typeof parsed.payload?.task_id === 'string'
          ? parsed.payload.task_id.trim()
          : ''
      return eventTaskId !== taskId
    },
  )
  return beforeCount - afterCount
}

export const removeTaskProgressFiles = (
  workDir: string,
  taskId: string,
): Promise<number> =>
  removeTaskNamedFiles({
    workDir,
    rootDir: TASK_PROGRESS_DIR,
    targetName: `${taskId}.jsonl`,
    nestedDirectoriesOnly: true,
  })

export const removeWorkerTaskPromptFiles = (
  workDir: string,
  taskId: string,
): Promise<number> =>
  removeTaskNamedFiles({
    workDir,
    rootDir: WORKER_TASK_PROMPT_DIR,
    targetName: `${taskId}.md`,
    nestedDirectoriesOnly: false,
  })
