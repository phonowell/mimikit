import { z } from 'zod'

export const taskContractSchema = z
  .object({
    goal: z.string().trim().min(1),
    scope: z.string().trim().min(1),
    acceptance: z.array(z.string().trim().min(1)).min(1),
    outOfScope: z.string().trim().min(1).optional(),
    contextRefs: z.array(z.string().trim().min(1)).optional(),
  })
  .strict()
