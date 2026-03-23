import { z } from 'zod'

import { focusIdSchema } from '../shared/id-schema.js'

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
import { readFileToolSchema } from './read-file-tool.js'
export { runTaskSchema } from './run-task-schema.js'

const nonEmptyString = z.string().trim().min(1)

export { createPlanSchema, deletePlanSchema, updatePlanSchema }

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

export const readFileSchema = readFileToolSchema

export const rememberMemorySchema = z
  .object({
    content: nonEmptyString,
  })
  .strict()

export const assignFocusSchema = z
  .object({
    target_type: z.enum(['task', 'plan', 'history']),
    target_id: nonEmptyString,
    focus_id: focusIdSchema,
  })
  .strict()
