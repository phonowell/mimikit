import { z } from 'zod'

import { queryTaskResultArchives } from '../storage/task-results.js'

import type { Parsed } from '../actions/model/spec.js'
import type { TaskArchiveLookupMessage } from '../types/index.js'

const QUERY_TASK_ARCHIVE_LIMIT_DEFAULT = 6
const QUERY_TASK_ARCHIVE_LIMIT_MAX = 12
const QUERY_TASK_ARCHIVE_MAX_FILES_DEFAULT = 240
const QUERY_TASK_ARCHIVE_MAX_FILES_MAX = 1200

export const queryTaskArchiveSchema = z
  .object({
    query: z.string().trim().min(1),
    limit: z.coerce.number().int().min(1).max(QUERY_TASK_ARCHIVE_LIMIT_MAX).optional(),
    max_files: z.coerce
      .number()
      .int()
      .min(20)
      .max(QUERY_TASK_ARCHIVE_MAX_FILES_MAX)
      .optional(),
  })
  .strict()

export type QueryTaskArchiveRequest = {
  query: string
  limit: number
  maxFiles: number
}

export const pickQueryTaskArchiveRequest = (
  items: Parsed[],
): QueryTaskArchiveRequest | undefined => {
  let picked: QueryTaskArchiveRequest | undefined
  for (const item of items) {
    if (item.name !== 'query_task_archive') continue
    const parsed = queryTaskArchiveSchema.safeParse(item.attrs)
    if (!parsed.success) continue
    picked = {
      query: parsed.data.query,
      limit: parsed.data.limit ?? QUERY_TASK_ARCHIVE_LIMIT_DEFAULT,
      maxFiles: parsed.data.max_files ?? QUERY_TASK_ARCHIVE_MAX_FILES_DEFAULT,
    }
  }
  return picked
}

export const buildTaskArchiveLookupKey = (
  request?: QueryTaskArchiveRequest,
): string | undefined => {
  if (!request) return undefined
  return [request.query, String(request.limit), String(request.maxFiles)].join('\n')
}

export const runQueryTaskArchiveTool = async (params: {
  stateDir: string
  request: QueryTaskArchiveRequest
}): Promise<TaskArchiveLookupMessage[]> =>
  queryTaskResultArchives(params.stateDir, params.request.query, {
    limit: params.request.limit,
    maxFiles: params.request.maxFiles,
  })
