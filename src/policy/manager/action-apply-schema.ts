import { z } from 'zod'

import { focusIdSchema } from '../../foundation/shared/id-schema.js'
import { normalizeInlineWhitespace } from '../../foundation/shared/text.js'

import {
  askUserChoiceSchema,
  parseAskUserChoiceAttrs,
} from './action-apply-choice-attrs.js'
import {
  parseUpsertFocusAttrs,
  upsertFocusSchema,
} from './action-apply-focus-attrs.js'
import {
  createPlanSchema,
  deletePlanSchema,
  updatePlanSchema,
} from './action-plan-schema.js'

const nonEmptyString = z.string().trim().min(1)
const REMEMBER_MEMORY_PROTOCOL_TAG_RE = /<M:[^>]+>/i
const REMEMBER_MEMORY_CODE_FENCE_RE = /```|~~~/
const REMEMBER_MEMORY_LIST_RE = /^\s*(?:[-*+]|\d+[.)])\s+/m
const REMEMBER_MEMORY_RUNTIME_ID_RE =
  /\b(?:task|plan|input|focus|runtime|packet|sys|agent)-[a-zA-Z0-9._-]+\b/

export const REMEMBER_MEMORY_MAX_CHARS = 240

export type RememberMemoryContentIssue =
  | 'multiline'
  | 'checklist'
  | 'protocol'
  | 'runtime_ref'
  | 'too_long'

export {
  askUserChoiceSchema,
  parseAskUserChoiceAttrs,
  parseUpsertFocusAttrs,
  upsertFocusSchema,
}
export { createPlanSchema, deletePlanSchema, updatePlanSchema }

export const runTaskSchema = z
  .object({
    worker_prompt: nonEmptyString.optional(),
    title: nonEmptyString,
    cwd: nonEmptyString,
    branch: nonEmptyString.optional(),
    goal: nonEmptyString.optional(),
    in_scope: nonEmptyString.optional(),
    done_when_1: nonEmptyString.optional(),
    done_when_2: nonEmptyString.optional(),
    done_when_3: nonEmptyString.optional(),
    done_when_4: nonEmptyString.optional(),
    done_when_5: nonEmptyString.optional(),
    out_of_scope: nonEmptyString.optional(),
    context_ref_1: nonEmptyString.optional(),
    context_ref_2: nonEmptyString.optional(),
    context_ref_3: nonEmptyString.optional(),
    focus_id: focusIdSchema.optional(),
  })
  .strict()

export const summarizeSchema = z
  .object({
    task_id: nonEmptyString,
    summary: nonEmptyString,
  })
  .strict()

export const mutateTaskSchema = z
  .object({
    id: nonEmptyString,
    op: z.enum([
      'pause',
      'resume',
      'cancel',
      'review_passed',
      'merged',
      'cleaned',
    ]),
    reason: nonEmptyString.optional(),
    sha: nonEmptyString.optional(),
  })
  .strict()

export const restartRuntimeSchema = z
  .object({
    reason: nonEmptyString,
  })
  .strict()

export const rememberMemorySchema = z
  .object({
    content: nonEmptyString,
  })
  .strict()

export const normalizeRememberMemoryContent = (value: string): string =>
  normalizeInlineWhitespace(value)

export const resolveRememberMemoryContentIssue = (
  value: string,
): RememberMemoryContentIssue | undefined => {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (
    REMEMBER_MEMORY_PROTOCOL_TAG_RE.test(trimmed) ||
    REMEMBER_MEMORY_CODE_FENCE_RE.test(trimmed)
  )
    return 'protocol'
  if (REMEMBER_MEMORY_LIST_RE.test(trimmed)) return 'checklist'
  if (/\r?\n/.test(trimmed)) return 'multiline'
  if (REMEMBER_MEMORY_RUNTIME_ID_RE.test(trimmed)) return 'runtime_ref'
  if (
    normalizeRememberMemoryContent(trimmed).length > REMEMBER_MEMORY_MAX_CHARS
  )
    return 'too_long'
  return undefined
}

export const assignFocusSchema = z
  .object({
    target_type: z.enum(['task', 'plan', 'history']),
    target_id: nonEmptyString,
    focus_id: focusIdSchema,
  })
  .strict()
