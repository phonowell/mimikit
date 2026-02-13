import { extname, join } from 'node:path'

import isExist from 'fire-keeper/isExist'
import write from 'fire-keeper/write'

import { ensureDir } from '../fs/paths.js'

import { buildArchiveDocument, dateStamp } from './archive-format.js'
import {
  readTaskResultArchive,
  readTaskResultsForTasks,
  type ReadTaskResultsOptions,
} from './task-results-read.js'

import type {
  TaskCancelMeta,
  TaskResultStatus,
  TokenUsage,
} from '../types/index.js'

export type TaskArchiveEntry = {
  taskId?: string
  title: string
  status: TaskResultStatus
  prompt: string
  output: string
  createdAt: string
  completedAt: string
  durationMs: number
  usage?: TokenUsage
  cancel?: TaskCancelMeta
}

const TASK_ARCHIVE_DIR = 'tasks'

const compactTimestamp = (iso: string): string => {
  const date = iso.slice(0, 10).replace(/-/g, '')
  const time = iso.slice(11, 19).replace(/:/g, '')
  return `${date}_${time}`
}

const sanitizePart = (value: string, limit = 60): string => {
  const ascii = value.normalize('NFKD').replace(/[^\x20-\x7E]/g, '')
  const dashed = ascii
    .replace(/['"]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const trimmed = dashed.slice(0, Math.max(0, limit))
  return trimmed.replace(/-+$/g, '')
}

const buildFilename = (entry: TaskArchiveEntry): string => {
  const trimmedId = entry.taskId?.trim()
  const id =
    trimmedId && trimmedId.length > 0
      ? trimmedId
      : compactTimestamp(entry.completedAt)
  const safeTitle = sanitizePart(entry.title) || 'task'
  return `${id}_${safeTitle}.md`
}

const pathExists = (path: string): Promise<boolean> => isExist(path)

const ensureUniquePath = async (basePath: string): Promise<string> => {
  if (!(await pathExists(basePath))) return basePath
  const ext = extname(basePath)
  const head = basePath.slice(0, basePath.length - ext.length)
  for (let i = 1; i < 1000; i += 1) {
    const suffix = String(i).padStart(2, '0')
    const candidate = `${head}_${suffix}${ext}`
    if (!(await pathExists(candidate))) return candidate
  }
  return `${head}_${Date.now()}${ext}`
}

const buildArchiveContent = (entry: TaskArchiveEntry): string =>
  buildArchiveDocument(
    [
      ['task_id', entry.taskId ?? ''],
      ['title', entry.title],
      ['status', entry.status],
      ['created_at', entry.createdAt],
      ['completed_at', entry.completedAt],
      ['duration_ms', entry.durationMs],
      ['usage', entry.usage ? JSON.stringify(entry.usage) : undefined],
      ['cancel_source', entry.cancel?.source],
      ['cancel_reason', entry.cancel?.reason],
    ],
    [
      { marker: '=== PROMPT ===', content: entry.prompt },
      { marker: '=== RESULT ===', content: entry.output },
    ],
  )

export const appendTaskResultArchive = async (
  stateDir: string,
  entry: TaskArchiveEntry,
): Promise<string> => {
  const dateDir = dateStamp(entry.completedAt)
  const dir = join(stateDir, TASK_ARCHIVE_DIR, dateDir)
  await ensureDir(dir)
  const filename = buildFilename(entry)
  const path = await ensureUniquePath(join(dir, filename))
  const content = buildArchiveContent(entry)
  await write(path, content, { encoding: 'utf8' }, { echo: false })
  return path
}

export { readTaskResultArchive, readTaskResultsForTasks }
export type { ReadTaskResultsOptions }
