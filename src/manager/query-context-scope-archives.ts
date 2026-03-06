import { parseIsoToMs } from '../shared/time.js'
import {
  queryTaskResultArchives,
  readTaskResultsForTasks,
} from '../storage/task-results.js'

import { isWildcardQuery, toDisplayPath } from './query-context-scope-shared.js'
import {
  scoreQueryCandidate,
  sortByScoreTimeId,
  truncatePreview,
} from './query-context-score.js'

import type { RuntimeState } from './runtime-adapter.js'
import type { QueryLookupTaskArchiveItem } from '../types/index.js'

export const queryTaskArchivesScope = async (
  runtime: RuntimeState,
  query: string,
  scopeLimit: number,
  maxItemChars: number,
  archiveMaxFiles: number,
): Promise<QueryLookupTaskArchiveItem[]> => {
  const wildcard = isWildcardQuery(query)
  if (wildcard) {
    const results = await readTaskResultsForTasks(
      runtime.config.workDir,
      runtime.tasks.map((task) => task.id),
      { maxFiles: archiveMaxFiles },
    )
    const filtered = results
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
            query,
            isWildcard: true,
            haystack: [item.taskId, item.title ?? '', item.output].join('\n'),
            timeMs,
            oldestMs: oldest,
            newestMs: newest,
          }),
          ...(item.title ? { title: item.title } : {}),
          snippet: truncatePreview(item.output, maxItemChars),
        }
      })
      .filter((item) => item.archivePath)
    return sortByScoreTimeId(ranked)
  }

  const hits = await queryTaskResultArchives(runtime.config.workDir, query, {
    limit: scopeLimit + 1,
    maxFiles: archiveMaxFiles,
  })
  const ranked = hits
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
        ? { snippet: truncatePreview(item.snippet, maxItemChars) }
        : {}),
    }))
    .filter((item) => item.archivePath)
  return sortByScoreTimeId(ranked)
}
