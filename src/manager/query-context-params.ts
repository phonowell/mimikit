import type { QueryContextScope } from '../types/index.js'

export const QUERY_CONTEXT_SCOPE_ORDER = [
  'history',
  'tasks',
  'focus',
  'plans',
  'generated_index',
  'task_archives',
] as const satisfies QueryContextScope[]

export const QUERY_CONTEXT_SCOPE_LIMIT = 12
export const QUERY_CONTEXT_MAX_BYTES = 12_288
export const QUERY_CONTEXT_MAX_ITEM_CHARS = 320
export const QUERY_CONTEXT_ARCHIVE_MAX_FILES = 240
export const QUERY_CONTEXT_GENERATED_SCOPE_LIMIT = 6
export const QUERY_CONTEXT_GENERATED_SCAN_MAX_FILES = 120
export const QUERY_CONTEXT_GENERATED_WALK_MAX_FILES = 360
export const QUERY_CONTEXT_GENERATED_MAX_READ_BYTES = 16 * 1_024
