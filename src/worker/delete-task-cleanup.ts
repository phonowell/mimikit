import { rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { checkExistingPathBoundary } from '../fs/path-safety.js'
import { listFiles } from '../fs/paths.js'
import { filterHistory } from '../history/store.js'
import { readErrorCode } from '../shared/error-code.js'
import { parseSystemEventText } from '../shared/system-event.js'

type RemoveFileWithinRootResult = 'deleted' | 'missing' | 'outside' | 'skipped'

const TASK_PROGRESS_DIR = 'task-progress'
const WORKER_TASK_PROMPT_DIR = 'generated/worker-task-prompts'

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
      const parsed = parseSystemEventText(item.text)
      const eventTaskId =
        typeof parsed.payload?.task_id === 'string'
          ? parsed.payload.task_id.trim()
          : ''
      return eventTaskId !== taskId
    },
  )
  return beforeCount - afterCount
}

export const removeTaskProgressFiles = async (
  workDir: string,
  taskId: string,
): Promise<number> => {
  const taskProgressRoot = join(workDir, TASK_PROGRESS_DIR)
  const dateDirs = (await listFiles(taskProgressRoot)).filter((entry) =>
    entry.isDirectory(),
  )
  let deleted = 0
  const targetName = `${taskId}.jsonl`
  for (const dateDir of dateDirs) {
    const dirPath = join(taskProgressRoot, dateDir.name)
    const files = await listFiles(dirPath)
    const target = files.find(
      (entry) => entry.isFile() && entry.name === targetName,
    )
    if (!target) continue
    await rm(join(dirPath, target.name), { force: true })
    deleted += 1
  }
  return deleted
}

export const removeWorkerTaskPromptFiles = async (
  workDir: string,
  taskId: string,
): Promise<number> => {
  const promptsRoot = join(workDir, WORKER_TASK_PROMPT_DIR)
  const entries = await listFiles(promptsRoot)
  const targetName = `${taskId}.md`
  let deleted = 0

  for (const entry of entries) {
    if (entry.isFile() && entry.name === targetName) {
      await rm(join(promptsRoot, entry.name), { force: true })
      deleted += 1
      continue
    }
    if (!entry.isDirectory()) continue
    const dirPath = join(promptsRoot, entry.name)
    const files = await listFiles(dirPath)
    const target = files.find(
      (item) => item.isFile() && item.name === targetName,
    )
    if (!target) continue
    await rm(join(dirPath, target.name), { force: true })
    deleted += 1
  }

  return deleted
}
