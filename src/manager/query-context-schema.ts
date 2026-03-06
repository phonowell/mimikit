import { z } from 'zod'

import { normalizeMsRange } from '../shared/query-params.js'
import { parseIsoMs } from '../shared/time.js'

import {
  isInteger,
  normalizeOptionalString,
  parseCsvEnumSet,
  QUERY_CONTEXT_ARCHIVE_MAX_FILES_DEFAULT,
  QUERY_CONTEXT_ARCHIVE_MAX_FILES_MAX,
  QUERY_CONTEXT_ARCHIVE_MAX_FILES_MIN,
  QUERY_CONTEXT_DEFAULT_SCOPES,
  QUERY_CONTEXT_LIMIT_DEFAULT,
  QUERY_CONTEXT_LIMIT_MAX,
  QUERY_CONTEXT_LIMIT_MIN,
  QUERY_CONTEXT_MAX_BYTES_DEFAULT,
  QUERY_CONTEXT_MAX_BYTES_MAX,
  QUERY_CONTEXT_MAX_BYTES_MIN,
  QUERY_CONTEXT_MAX_ITEM_CHARS_DEFAULT,
  QUERY_CONTEXT_MAX_ITEM_CHARS_MAX,
  QUERY_CONTEXT_MAX_ITEM_CHARS_MIN,
  QUERY_CONTEXT_PLAN_STATUS_VALUES,
  QUERY_CONTEXT_SCOPES,
  QUERY_CONTEXT_TASK_STATUS_VALUES,
} from './query-context-params.js'

import type { Parsed } from '../actions/model/spec.js'
import type {
  FocusId,
  QueryContextScope,
  TaskPlanStatus,
  TaskStatus,
} from '../types/index.js'

const limitField = z.coerce
  .number()
  .refine((value) => isInteger(value), 'must be an integer')
  .min(QUERY_CONTEXT_LIMIT_MIN)
  .max(QUERY_CONTEXT_LIMIT_MAX)

export const queryContextSchema = z
  .object({
    query: z.string().trim().min(1),
    scopes: z.preprocess(
      normalizeOptionalString,
      z
        .string()
        .trim()
        .refine(
          (value) => parseCsvEnumSet(value, QUERY_CONTEXT_SCOPES) !== undefined,
          `scopes must be a comma-separated list of ${QUERY_CONTEXT_SCOPES.join('|')}`,
        )
        .optional(),
    ),
    limit: limitField.optional(),
    limit_history: limitField.optional(),
    limit_tasks: limitField.optional(),
    limit_focus: limitField.optional(),
    limit_plans: limitField.optional(),
    limit_memory: limitField.optional(),
    limit_task_archives: limitField.optional(),
    from: z.string().trim().min(1).optional(),
    to: z.string().trim().min(1).optional(),
    focus_id: z
      .string()
      .trim()
      .regex(/^focus-[a-zA-Z0-9._-]+$/)
      .optional(),
    task_status: z.preprocess(
      normalizeOptionalString,
      z
        .string()
        .trim()
        .refine(
          (value) =>
            parseCsvEnumSet(value, QUERY_CONTEXT_TASK_STATUS_VALUES) !==
            undefined,
          `task_status must be a comma-separated list of ${QUERY_CONTEXT_TASK_STATUS_VALUES.join('|')}`,
        )
        .optional(),
    ),
    plan_status: z.preprocess(
      normalizeOptionalString,
      z
        .string()
        .trim()
        .refine(
          (value) =>
            parseCsvEnumSet(value, QUERY_CONTEXT_PLAN_STATUS_VALUES) !==
            undefined,
          `plan_status must be a comma-separated list of ${QUERY_CONTEXT_PLAN_STATUS_VALUES.join('|')}`,
        )
        .optional(),
    ),
    max_bytes: z.coerce
      .number()
      .refine((value) => isInteger(value), 'max_bytes must be an integer')
      .min(QUERY_CONTEXT_MAX_BYTES_MIN)
      .max(QUERY_CONTEXT_MAX_BYTES_MAX)
      .optional(),
    max_item_chars: z.coerce
      .number()
      .refine((value) => isInteger(value), 'max_item_chars must be an integer')
      .min(QUERY_CONTEXT_MAX_ITEM_CHARS_MIN)
      .max(QUERY_CONTEXT_MAX_ITEM_CHARS_MAX)
      .optional(),
    archive_max_files: z.coerce
      .number()
      .refine(
        (value) => isInteger(value),
        'archive_max_files must be an integer',
      )
      .min(QUERY_CONTEXT_ARCHIVE_MAX_FILES_MIN)
      .max(QUERY_CONTEXT_ARCHIVE_MAX_FILES_MAX)
      .optional(),
  })
  .strict()

const parseScopes = (raw?: string): QueryContextScope[] =>
  raw
    ? (parseCsvEnumSet(raw, QUERY_CONTEXT_SCOPES) ?? [
        ...QUERY_CONTEXT_DEFAULT_SCOPES,
      ])
    : [...QUERY_CONTEXT_DEFAULT_SCOPES]

export type QueryContextRequest = {
  query: string
  scopes: QueryContextScope[]
  limit: number
  scopeLimits: Partial<Record<QueryContextScope, number>>
  maxBytes: number
  maxItemChars: number
  archiveMaxFiles: number
  from?: string
  to?: string
  fromMs?: number
  toMs?: number
  focusId?: FocusId
  taskStatus?: TaskStatus[]
  planStatus?: TaskPlanStatus[]
}

const resolveScopeLimits = (
  data: z.infer<typeof queryContextSchema>,
): Partial<Record<QueryContextScope, number>> => {
  const limits: Partial<Record<QueryContextScope, number>> = {}
  if (data.limit_history !== undefined) limits.history = data.limit_history
  if (data.limit_tasks !== undefined) limits.tasks = data.limit_tasks
  if (data.limit_focus !== undefined) limits.focus = data.limit_focus
  if (data.limit_plans !== undefined) limits.plans = data.limit_plans
  if (data.limit_memory !== undefined) limits.memory = data.limit_memory
  if (data.limit_task_archives !== undefined)
    limits.task_archives = data.limit_task_archives
  return limits
}

export const pickQueryContextRequest = (
  items: Parsed[],
): QueryContextRequest | undefined => {
  let picked: QueryContextRequest | undefined
  for (const item of items) {
    if (item.name !== 'query_context') continue
    const parsed = queryContextSchema.safeParse(item.attrs)
    if (!parsed.success) continue
    const fromMs = parsed.data.from ? parseIsoMs(parsed.data.from) : undefined
    const toMs = parsed.data.to ? parseIsoMs(parsed.data.to) : undefined
    const taskStatus = parsed.data.task_status
      ? parseCsvEnumSet(
          parsed.data.task_status,
          QUERY_CONTEXT_TASK_STATUS_VALUES,
        )
      : undefined
    const planStatus = parsed.data.plan_status
      ? parseCsvEnumSet(
          parsed.data.plan_status,
          QUERY_CONTEXT_PLAN_STATUS_VALUES,
        )
      : undefined
    picked = {
      query: parsed.data.query,
      scopes: parseScopes(parsed.data.scopes),
      limit: parsed.data.limit ?? QUERY_CONTEXT_LIMIT_DEFAULT,
      scopeLimits: resolveScopeLimits(parsed.data),
      maxBytes: parsed.data.max_bytes ?? QUERY_CONTEXT_MAX_BYTES_DEFAULT,
      maxItemChars:
        parsed.data.max_item_chars ?? QUERY_CONTEXT_MAX_ITEM_CHARS_DEFAULT,
      archiveMaxFiles:
        parsed.data.archive_max_files ??
        QUERY_CONTEXT_ARCHIVE_MAX_FILES_DEFAULT,
      ...(parsed.data.from ? { from: parsed.data.from } : {}),
      ...(parsed.data.to ? { to: parsed.data.to } : {}),
      ...normalizeMsRange(fromMs, toMs),
      ...(parsed.data.focus_id ? { focusId: parsed.data.focus_id } : {}),
      ...(taskStatus ? { taskStatus } : {}),
      ...(planStatus ? { planStatus } : {}),
    }
  }
  return picked
}
