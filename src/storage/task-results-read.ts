import { join } from 'node:path'

import { listFiles } from '../fs/paths.js'
import { readTextFile } from '../fs/read-text.js'
import { safe } from '../log/safe.js'

import {
  extractArchiveSection,
  parseArchiveDocument,
} from './archive-format.js'
import { parseTokenUsageJson } from './token-usage.js'

import type {
  TaskCancelMeta,
  TaskResult,
  TaskResultStatus,
} from '../types/index.js'

const parseStatus = (value?: string): TaskResultStatus | null =>
  value === 'succeeded' || value === 'failed' || value === 'canceled'
    ? value
    : null

const parseCancelSource = (
  value?: string,
): TaskCancelMeta['source'] | undefined => {
  if (value === 'user' || value === 'http') return 'user'
  if (value === 'deferred') return 'deferred'
  if (value === 'system') return 'system'
  return undefined
}

const parseTaskResultArchive = (
  content: string,
  fallbackTaskId?: string,
  archivePath?: string,
): TaskResult | null => {
  const parsed = parseArchiveDocument(content)
  const taskId = parsed.header.task_id ?? fallbackTaskId
  const status = parseStatus(parsed.header.status)
  const completedAt = parsed.header.completed_at ?? parsed.header.created_at
  if (!taskId || !status || !completedAt) return null

  const durationMs = Number(parsed.header.duration_ms)
  const usage = parseTokenUsageJson(parsed.header.usage)
  const cancelSource = parseCancelSource(parsed.header.cancel_source)
  const cancel: TaskCancelMeta | undefined = cancelSource
    ? { source: cancelSource, ...(parsed.header.cancel_reason ? { reason: parsed.header.cancel_reason } : {}) }
    : undefined

  return {
    taskId,
    status,
    ok: status === 'succeeded',
    output: extractArchiveSection(parsed, '=== RESULT ==='),
    durationMs: Number.isFinite(durationMs) ? durationMs : 0,
    completedAt,
    ...(usage ? { usage } : {}),
    ...(parsed.header.title ? { title: parsed.header.title } : {}),
    ...(archivePath ? { archivePath } : {}),
    ...(cancel ? { cancel } : {}),
  }
}

export const readTaskResultArchive = (
  path: string,
  fallbackTaskId?: string,
): Promise<TaskResult | null> =>
  safe(
    'readTaskResultArchive',
    async () => {
      const content = await readTextFile(path)
      if (!content) return null
      return parseTaskResultArchive(content, fallbackTaskId, path)
    },
    { fallback: null, meta: { path }, ignoreCodes: ['ENOENT'] },
  )

export type ReadTaskResultsOptions = {
  maxFiles?: number
  dateHints?: Record<string, string>
}

const sortedDirNames = (names: string[]): string[] =>
  [...names].sort().reverse()

const resolveDateDirs = (
  taskIds: string[],
  allDirs: string[],
  dateHints?: Record<string, string>,
): string[] => {
  if (!dateHints) return allDirs
  const hinted = new Set<string>()
  let missingHint = false
  for (const id of taskIds) {
    const hint = dateHints[id]
    if (!hint) {
      missingHint = true
      break
    }
    hinted.add(hint)
  }
  return missingHint ? allDirs : sortedDirNames(Array.from(hinted))
}

export const readTaskResultsForTasks = async (
  stateDir: string,
  taskIds: string[],
  options: ReadTaskResultsOptions = {},
): Promise<TaskResult[]> => {
  const ids = taskIds.map((id) => id.trim()).filter(Boolean)
  const idSet = new Set(ids)
  if (idSet.size === 0) return []

  const maxFiles = options.maxFiles ?? Number.POSITIVE_INFINITY
  const found = new Map<string, TaskResult>()
  const archiveRoot = join(stateDir, 'tasks')
  const allDateDirs = sortedDirNames(
    (await listFiles(archiveRoot))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
  )

  for (const dateDir of resolveDateDirs(ids, allDateDirs, options.dateHints)) {
    if (found.size >= idSet.size) break
    const entries = await listFiles(join(archiveRoot, dateDir))
    for (const entry of entries) {
      if (!entry.isFile()) continue
      if (found.size >= idSet.size || found.size >= maxFiles) break
      const underscore = entry.name.indexOf('_')
      if (underscore <= 0) continue
      const taskId = entry.name.slice(0, underscore)
      if (!idSet.has(taskId) || found.has(taskId)) continue
      const result = await readTaskResultArchive(
        join(archiveRoot, dateDir, entry.name),
        taskId,
      )
      if (result) found.set(taskId, result)
    }
  }

  return Array.from(found.values())
}
