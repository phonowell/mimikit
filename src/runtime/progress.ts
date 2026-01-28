import fs from 'node:fs/promises'
import path from 'node:path'

import { isErrnoException } from '../utils/error.js'
import { ensureDir } from '../utils/fs.js'

export type ProgressEntry = {
  ts: string
  type: string
  summary?: string
}

export type TaskProgress = {
  taskId: string
  status: 'running' | 'idle'
  lastActivityAt?: string
  lastEventType?: string
  recentEntries: ProgressEntry[]
}

const MAX_ENTRIES = 20
const MAX_FILE_BYTES = 100_000

export const getProgressDir = (stateDir: string): string =>
  path.join(stateDir, 'progress')

export const getProgressPath = (stateDir: string, taskId: string): string =>
  path.join(getProgressDir(stateDir), `${taskId}.jsonl`)

export const appendProgress = async (
  stateDir: string,
  taskId: string,
  entry: ProgressEntry,
): Promise<void> => {
  const progressPath = getProgressPath(stateDir, taskId)
  await ensureDir(path.dirname(progressPath))
  const line = `${JSON.stringify(entry)}\n`
  await fs.appendFile(progressPath, line, 'utf8')
}

export const clearProgress = async (
  stateDir: string,
  taskId: string,
): Promise<void> => {
  const progressPath = getProgressPath(stateDir, taskId)
  try {
    await fs.unlink(progressPath)
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') return
    throw error
  }
}

export const readProgress = async (
  stateDir: string,
  taskId: string,
): Promise<TaskProgress> => {
  const progressPath = getProgressPath(stateDir, taskId)
  const result: TaskProgress = {
    taskId,
    status: 'idle',
    recentEntries: [],
  }

  let content: string
  try {
    const stats = await fs.stat(progressPath)
    if (stats.size === 0) return result
    result.status = 'running'
    const readStart = Math.max(0, stats.size - MAX_FILE_BYTES)
    const handle = await fs.open(progressPath, 'r')
    try {
      const buffer = Buffer.alloc(Math.min(stats.size, MAX_FILE_BYTES))
      await handle.read(buffer, 0, buffer.length, readStart)
      content = buffer.toString('utf8')
    } finally {
      await handle.close()
    }
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') return result
    throw error
  }

  const lines = content.split('\n').filter((line) => line.trim().length > 0)
  const entries: ProgressEntry[] = []
  for (const line of lines.slice(-MAX_ENTRIES)) {
    try {
      entries.push(JSON.parse(line) as ProgressEntry)
    } catch {
      continue
    }
  }

  result.recentEntries = entries
  const last = entries[entries.length - 1]
  if (last) {
    result.lastActivityAt = last.ts
    result.lastEventType = last.type
  }

  return result
}
