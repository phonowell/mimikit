import { join } from 'node:path'

import read from 'fire-keeper/read'

import { listFiles } from '../fs/paths.js'
import { safe } from '../log/safe.js'

import {
  extractArchiveSection,
  parseArchiveDocument,
} from './archive-format.js'
import { toUtf8Text } from './jsonl.js'
import { parseTokenUsageJson } from './token-usage.js'

import type {
  TaskCancelMeta,
  TaskResult,
  TaskResultStatus,
} from '../types/index.js'

const parseStatus = (value?: string): TaskResultStatus | null => {
  if (value === 'succeeded' || value === 'failed' || value === 'canceled')
    return value

  return null
}

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
  const { header } = parsed
  const taskId = header.task_id ?? fallbackTaskId
  if (!taskId) return null
  const status = parseStatus(header.status)
  if (!status) return null
  const completedAt = header.completed_at ?? header.created_at
  if (!completedAt) return null
  const durationMs = Number(header.duration_ms)
  const normalizedDuration = Number.isFinite(durationMs) ? durationMs : 0
  const output = extractArchiveSection(parsed, '=== RESULT ===')
  const usage = parseTokenUsageJson(header.usage)
  const cancelSource = parseCancelSource(header.cancel_source)
  const cancel: TaskCancelMeta | undefined = cancelSource
    ? {
        source: cancelSource,
        ...(header.cancel_reason ? { reason: header.cancel_reason } : {}),
      }
    : undefined

  return {
    taskId,
    status,
    ok: status === 'succeeded',
    output,
    durationMs: normalizedDuration,
    completedAt,
    ...(usage ? { usage } : {}),
    ...(header.title ? { title: header.title } : {}),
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
      const raw = await read(path, { raw: true, echo: false })
      const content = toUtf8Text(raw)
      if (!content) return null
      return parseTaskResultArchive(content, fallbackTaskId, path)
    },
    { fallback: null, meta: { path }, ignoreCodes: ['ENOENT'] },
  )

export type ReadTaskResultsOptions = {
  maxFiles?: number
  dateHints?: Record<string, string>
}

type SearchPlan = {
  idSet: Set<string>
  hintedDirs: Map<string, Set<string>>
  shouldScanAll: boolean
}

const buildSearchPlan = (
  taskIds: string[],
  dateHints?: Record<string, string>,
): SearchPlan => {
  const trimmedIds = taskIds
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
  const idSet = new Set(trimmedIds)
  const hintedDirs = new Map<string, Set<string>>()
  const unhinted = new Set<string>()

  for (const id of trimmedIds) {
    const hint = dateHints?.[id]
    if (!hint) {
      unhinted.add(id)
      continue
    }
    if (!hintedDirs.has(hint)) hintedDirs.set(hint, new Set())
    hintedDirs.get(hint)?.add(id)
  }

  return {
    idSet,
    hintedDirs,
    shouldScanAll: unhinted.size > 0 || hintedDirs.size === 0,
  }
}

const sortedDirNames = (names: string[]): string[] => names.sort().reverse()

export const readTaskResultsForTasks = async (
  stateDir: string,
  taskIds: string[],
  options: ReadTaskResultsOptions = {},
): Promise<TaskResult[]> => {
  const searchPlan = buildSearchPlan(taskIds, options.dateHints)
  if (searchPlan.idSet.size === 0) return []

  const maxFiles =
    options.maxFiles ??
    (searchPlan.shouldScanAll ? 500 : Number.POSITIVE_INFINITY)
  const found = new Map<string, TaskResult>()
  let scanned = 0
  const archiveRoot = join(stateDir, 'tasks')

  const allDateDirs = sortedDirNames(
    (await listFiles(archiveRoot))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
  )
  const dateDirs = searchPlan.shouldScanAll
    ? allDateDirs
    : sortedDirNames(Array.from(searchPlan.hintedDirs.keys()))

  for (const dateDir of dateDirs) {
    if (found.size >= searchPlan.idSet.size) break

    const targetIds = searchPlan.shouldScanAll
      ? searchPlan.idSet
      : searchPlan.hintedDirs.get(dateDir)
    if (!targetIds || targetIds.size === 0) continue

    const dirPath = join(archiveRoot, dateDir)
    const entries = await listFiles(dirPath)

    for (const entry of entries) {
      if (found.size >= searchPlan.idSet.size) break
      if (!entry.isFile()) continue

      scanned += 1
      if (scanned > maxFiles) break

      const underscore = entry.name.indexOf('_')
      if (underscore <= 0) continue
      const taskId = entry.name.slice(0, underscore)
      if (!targetIds.has(taskId) || found.has(taskId)) continue

      const path = join(dirPath, entry.name)
      const result = await readTaskResultArchive(path, taskId)
      if (result) found.set(taskId, result)
    }

    if (scanned > maxFiles) break
  }

  return Array.from(found.values())
}
