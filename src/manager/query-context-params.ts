import type { QueryContextScope } from '../types/index.js'

export const QUERY_CONTEXT_SCOPE_ORDER = [
  'history',
  'tasks',
  'focus',
  'plans',
  'task_archives',
] as const satisfies QueryContextScope[]

export const QUERY_CONTEXT_SCOPE_LIMIT = 12
export const QUERY_CONTEXT_MAX_BYTES = 12_288
export const QUERY_CONTEXT_MAX_ITEM_CHARS = 320
export const QUERY_CONTEXT_ARCHIVE_MAX_FILES = 240
