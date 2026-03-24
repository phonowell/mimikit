import { join } from 'node:path'

import { listFiles } from '../fs/paths.js'
import { readTextFile } from '../fs/read-text.js'
import { safe } from '../log/safe.js'
import { parseIsoToMs } from '../shared/time.js'

import { parseTaskResultArchive } from './task-results-parse.js'

import type { TaskResult } from '../types/index.js'

export type ReadTaskResultsOptions = {
  maxFiles?: number
  dateHints?: Record<string, string>
}

export const readTaskResultArchive = (
  path: string,
): Promise<TaskResult | null> =>
  safe(
    'readTaskResultArchive',
    async () => {
      const content = await readTextFile(path)
      if (!content) return null
      return parseTaskResultArchive(content, path)
    },
    { fallback: null, meta: { path }, ignoreCodes: ['ENOENT'] },
  )

const compareTaskResultRecency = (
  left: TaskResult,
  right: TaskResult,
): number => {
  const timeDiff =
    parseIsoToMs(right.completedAt) - parseIsoToMs(left.completedAt)
  if (timeDiff !== 0) return timeDiff
  return (right.archivePath ?? '').localeCompare(left.archivePath ?? '')
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
  const resultLimit = Math.min(idSet.size, maxFiles)
  const found = new Map<string, TaskResult>()
  const archiveRoot = join(stateDir, 'tasks')
  const allDateDirs = sortedDirNames(
    (await listFiles(archiveRoot))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
  )

  for (const dateDir of resolveDateDirs(ids, allDateDirs, options.dateHints)) {
    if (found.size >= resultLimit) break
    const entries = await listFiles(join(archiveRoot, dateDir))
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const underscore = entry.name.indexOf('_')
      if (underscore <= 0) continue
      const taskId = entry.name.slice(0, underscore)
      if (!idSet.has(taskId)) continue
      const result = await readTaskResultArchive(
        join(archiveRoot, dateDir, entry.name),
      )
      if (!result) continue
      const existing = found.get(taskId)
      if (!existing || compareTaskResultRecency(result, existing) < 0)
        found.set(taskId, result)
    }
  }

  return Array.from(found.values())
    .sort(compareTaskResultRecency)
    .slice(0, resultLimit)
}
