import type {
  QueryContextScope,
  TaskPlanStatus,
  TaskStatus,
} from '../types/index.js'

export const QUERY_CONTEXT_LIMIT_DEFAULT = 12
export const QUERY_CONTEXT_LIMIT_MIN = 1
export const QUERY_CONTEXT_LIMIT_MAX = 60
export const QUERY_CONTEXT_MAX_BYTES_DEFAULT = 12_288
export const QUERY_CONTEXT_MAX_BYTES_MIN = 1_024
export const QUERY_CONTEXT_MAX_BYTES_MAX = 65_536
export const QUERY_CONTEXT_MAX_ITEM_CHARS_DEFAULT = 320
export const QUERY_CONTEXT_MAX_ITEM_CHARS_MIN = 80
export const QUERY_CONTEXT_MAX_ITEM_CHARS_MAX = 1_200
export const QUERY_CONTEXT_ARCHIVE_MAX_FILES_DEFAULT = 240
export const QUERY_CONTEXT_ARCHIVE_MAX_FILES_MIN = 20
export const QUERY_CONTEXT_ARCHIVE_MAX_FILES_MAX = 1_200

export const QUERY_CONTEXT_SCOPES = [
  'history',
  'tasks',
  'focus',
  'plans',
  'memory',
  'task_archives',
] as const satisfies QueryContextScope[]

export const QUERY_CONTEXT_DEFAULT_SCOPES = [
  'history',
  'tasks',
  'focus',
  'plans',
  'memory',
] as const satisfies QueryContextScope[]

export const QUERY_CONTEXT_TASK_STATUS_VALUES = [
  'pending',
  'paused',
  'running',
  'succeeded',
  'failed',
  'canceled',
] as const satisfies TaskStatus[]

export const QUERY_CONTEXT_PLAN_STATUS_VALUES = [
  'active',
  'blocked',
  'done',
] as const satisfies TaskPlanStatus[]

export const normalizeOptionalString = (value: unknown): unknown =>
  typeof value === 'string' && value.trim().length === 0 ? undefined : value

export const parseCsvEnumSet = <TValue extends string>(
  raw: string,
  allowed: readonly TValue[],
): TValue[] | undefined => {
  const allowedSet = new Set(allowed)
  const values = new Set<TValue>()
  for (const part of raw.split(',')) {
    const normalized = part.trim()
    if (!normalized) continue
    if (!allowedSet.has(normalized as TValue)) return undefined
    values.add(normalized as TValue)
  }
  return values.size > 0 ? Array.from(values) : undefined
}

export const isInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value)
