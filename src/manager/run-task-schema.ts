import { z } from 'zod'

import { focusIdSchema } from '../shared/id-schema.js'

const nonEmptyString = z.string().trim().min(1)

export const runTaskSchema = z
  .object({
    worker_prompt: nonEmptyString.optional(),
    prompt: nonEmptyString.optional(),
    title: nonEmptyString,
    cwd: nonEmptyString,
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
    provider: z.enum(['codex', 'opencode']).optional(),
  })
  .strict()
  .transform((value) => ({
    worker_prompt: value.worker_prompt ?? value.prompt,
    title: value.title,
    cwd: value.cwd,
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
    provider: value.provider,
  }))
