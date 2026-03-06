import { parseIsoToMs } from '../shared/time.js'
import {
  queryTaskResultArchives,
  readTaskResultsForTasks,
} from '../storage/task-results.js'

import {
  inRange,
  isWildcardQuery,
  toDisplayPath,
} from './query-context-scope-shared.js'
import {
  scoreQueryCandidate,
  sortByScoreTimeId,
  truncatePreview,
} from './query-context-score.js'

import type { QueryContextRequest } from './query-context-schema.js'
import type { RuntimeState } from './runtime-adapter.js'
import type { QueryLookupTaskArchiveItem, TaskStatus } from '../types/index.js'

const isArchiveStatusMatch = (
  status: TaskStatus,
  allowed?: TaskStatus[],
): boolean => !allowed || allowed.includes(status)

export const queryTaskArchivesScope = async (
  runtime: RuntimeState,
  request: QueryContextRequest,
  scopeLimit: number,
): Promise<QueryLookupTaskArchiveItem[]> => {
  const wildcard = isWildcardQuery(request.query)
  if (wildcard) {
    const results = await readTaskResultsForTasks(
      runtime.config.workDir,
      runtime.tasks.map((task) => task.id),
      { maxFiles: request.archiveMaxFiles },
    )
    const filtered = results.filter(
      (item) =>
        inRange(item.completedAt, request) &&
        isArchiveStatusMatch(item.status, request.taskStatus),
    )
    const times = filtered.map((item) => parseIsoToMs(item.completedAt))
    const oldest = times.length > 0 ? Math.min(...times) : 0
    const newest = times.length > 0 ? Math.max(...times) : 0
    const ranked = filtered
      .map((item) => {
        const timeMs = parseIsoToMs(item.completedAt)
        return {
          id: item.taskId,
          timeMs,
          ref: `task_archive:${item.taskId}`,
          taskId: item.taskId,
          status: item.status,
          completedAt: item.completedAt,
          archivePath: toDisplayPath(
            item.archivePath ?? '',
            runtime.config.workDir,
          ),
          score: scoreQueryCandidate({
            query: request.query,
            isWildcard: true,
            haystack: [item.taskId, item.title ?? '', item.output].join('\n'),
            timeMs,
            oldestMs: oldest,
            newestMs: newest,
          }),
          ...(item.title ? { title: item.title } : {}),
          snippet: truncatePreview(item.output, request.maxItemChars),
        }
      })
      .filter((item) => item.archivePath)
    return sortByScoreTimeId(ranked)
  }

  const hits = await queryTaskResultArchives(
    runtime.config.workDir,
    request.query,
    {
      limit: scopeLimit + 1,
      maxFiles: request.archiveMaxFiles,
    },
  )
  const ranked = hits
    .filter(
      (item) =>
        inRange(item.completedAt, request) &&
        isArchiveStatusMatch(item.status, request.taskStatus),
    )
    .map((item) => ({
      id: item.taskId,
      timeMs: parseIsoToMs(item.completedAt),
      ref: `task_archive:${item.taskId}`,
      taskId: item.taskId,
      status: item.status,
      completedAt: item.completedAt,
      archivePath: toDisplayPath(item.archivePath, runtime.config.workDir),
      score: item.score,
      ...(item.title ? { title: item.title } : {}),
      ...(item.snippet
        ? { snippet: truncatePreview(item.snippet, request.maxItemChars) }
        : {}),
    }))
    .filter((item) => item.archivePath)
  return sortByScoreTimeId(ranked)
}
