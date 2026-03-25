import { access, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'

import { readErrorCode } from '../../foundation/shared/error-code.js'
import { ensureDir } from '../fs/paths.js'

import { buildArchiveDocument, dateStamp } from './archive-format.js'
import {
  readTaskResultArchive,
  readTaskResultsForTasks,
  type ReadTaskResultsOptions,
} from './task-results-read.js'

import type {
  TaskCancelMeta,
  TaskResultHandoff,
  TaskResultOutcome,
  TaskResultStatus,
  TaskResultStopReason,
  TaskStatus,
  TokenUsage,
  WorkerProvider,
} from '../../foundation/types/index.js'

export type TaskArchiveEntry = {
  taskId: string
  focusId?: string
  title: string
  status: TaskResultStatus
  taskStatus?: TaskStatus
  outcome?: TaskResultOutcome
  stopReason?: TaskResultStopReason
  prompt: string
  output: string
  createdAt: string
  completedAt: string
  durationMs: number
  provider?: WorkerProvider
  usage?: TokenUsage
  cancel?: TaskCancelMeta
  handoff?: TaskResultHandoff
  evidence?: Record<string, unknown>
}

const TASK_ARCHIVE_DIR = 'tasks'

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
  const id = entry.taskId.trim()
  if (!id) throw new Error('task archive taskId is required')
  const safeTitle = sanitizePart(entry.title) || 'task'
  return `${id}_${safeTitle}.md`
}

const pathExists = async (path: string): Promise<boolean> => {
  try {
    await access(path)
    return true
  } catch (error) {
    if (readErrorCode(error) === 'ENOENT') return false
    throw error
  }
}

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
      ['task_id', entry.taskId],
      ['focus_id', entry.focusId ?? ''],
      ['title', entry.title],
      ['status', entry.status],
      ['task_status', entry.taskStatus],
      ['outcome', entry.outcome],
      ['stop_reason', entry.stopReason],
      ['provider', entry.provider],
      ['created_at', entry.createdAt],
      ['completed_at', entry.completedAt],
      ['duration_ms', entry.durationMs],
      ['usage', entry.usage ? JSON.stringify(entry.usage) : undefined],
      ['cancel_source', entry.cancel?.source],
      ['cancel_reason', entry.cancel?.reason],
      ['handoff', entry.handoff ? JSON.stringify(entry.handoff) : undefined],
      ['evidence', entry.evidence ? JSON.stringify(entry.evidence) : undefined],
    ],
    [
      { marker: '=== PROMPT ===', content: entry.prompt },
      { marker: '=== RESULT ===', content: entry.output },
    ],
  )

export const resolveTaskResultArchivePath = async (
  stateDir: string,
  entry: TaskArchiveEntry,
): Promise<string> => {
  const dateDir = dateStamp(entry.completedAt)
  const dir = join(stateDir, TASK_ARCHIVE_DIR, dateDir)
  await ensureDir(dir)
  const basePath = join(dir, buildFilename(entry))
  return ensureUniquePath(basePath)
}

export const writeTaskResultArchiveAtPath = async (
  path: string,
  entry: TaskArchiveEntry,
): Promise<string> => {
  await writeFile(path, buildArchiveContent(entry), { encoding: 'utf8' })
  return path
}

export const appendTaskResultArchive = (
  stateDir: string,
  entry: TaskArchiveEntry,
): Promise<string> =>
  resolveTaskResultArchivePath(stateDir, entry).then((path) =>
    writeTaskResultArchiveAtPath(path, entry),
  )

export { readTaskResultArchive, readTaskResultsForTasks }
export type { ReadTaskResultsOptions }
