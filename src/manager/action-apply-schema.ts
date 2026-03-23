import { z } from 'zod'

import { focusIdSchema } from '../shared/id-schema.js'
import { normalizeInlineWhitespace } from '../shared/text.js'

import {
  createPlanSchema,
  deletePlanSchema,
  updatePlanSchema,
} from './action-plan-schema.js'
export {
  askUserChoiceSchema,
  parseAskUserChoiceAttrs,
  parseUpsertFocusAttrs,
  upsertFocusSchema,
} from './action-apply-dynamic-attrs.js'

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

export { createPlanSchema, deletePlanSchema, updatePlanSchema }

export const runTaskSchema = z
  .object({
    worker_prompt: nonEmptyString.optional(),
    prompt: nonEmptyString.optional(),
    title: nonEmptyString,
    cwd: nonEmptyString,
    branch: nonEmptyString.optional(),
    goal: nonEmptyString.optional(),
    in_scope: nonEmptyString.optional(),
    scope: nonEmptyString.optional(),
    done_when_1: nonEmptyString.optional(),
    acceptance_1: nonEmptyString.optional(),
    done_when_2: nonEmptyString.optional(),
    acceptance_2: nonEmptyString.optional(),
    done_when_3: nonEmptyString.optional(),
    acceptance_3: nonEmptyString.optional(),
    done_when_4: nonEmptyString.optional(),
    acceptance_4: nonEmptyString.optional(),
    done_when_5: nonEmptyString.optional(),
    acceptance_5: nonEmptyString.optional(),
    out_of_scope: nonEmptyString.optional(),
    context_ref_1: nonEmptyString.optional(),
    context_ref_2: nonEmptyString.optional(),
    context_ref_3: nonEmptyString.optional(),
    focus_id: focusIdSchema.optional(),
  })
  .strict()
  .transform((value) => ({
    worker_prompt: value.worker_prompt ?? value.prompt,
    title: value.title,
    cwd: value.cwd,
    branch: value.branch,
    goal: value.goal,
    in_scope: value.in_scope ?? value.scope,
    done_when_1: value.done_when_1 ?? value.acceptance_1,
    done_when_2: value.done_when_2 ?? value.acceptance_2,
    done_when_3: value.done_when_3 ?? value.acceptance_3,
    done_when_4: value.done_when_4 ?? value.acceptance_4,
    done_when_5: value.done_when_5 ?? value.acceptance_5,
    out_of_scope: value.out_of_scope,
    context_ref_1: value.context_ref_1,
    context_ref_2: value.context_ref_2,
    context_ref_3: value.context_ref_3,
    focus_id: value.focus_id,
  }))

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
