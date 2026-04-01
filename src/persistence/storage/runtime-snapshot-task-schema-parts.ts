import { z } from 'zod'

export const taskResultHandoffArtifactSchema = z
  .object({
    path: z.string().trim().min(1),
    kind: z.string().trim().min(1).optional(),
    note: z.string().trim().min(1).optional(),
  })
  .strict()

export const taskResultHandoffEvidenceSchema = z
  .object({
    type: z.enum(['task_archive', 'file', 'history']),
    ref: z.string().trim().min(1),
    note: z.string().trim().min(1).optional(),
  })
  .strict()

export const taskGitLifecycleSchema = z
  .object({
    review: z
      .object({
        passed: z.boolean(),
        at: z.string().optional(),
        sha: z.string().trim().min(1).optional(),
      })
      .strict(),
    merged: z.boolean(),
    mergedAt: z.string().optional(),
    cleaned: z.boolean(),
    cleanedAt: z.string().optional(),
  })
  .strict()

export const taskGitExecutionSchema = z
  .object({
    worktreePath: z.string().trim().min(1),
    branch: z.string().trim().min(1),
    closureRequired: z.boolean(),
    lifecycle: taskGitLifecycleSchema.optional(),
  })
  .strict()

export const taskPlanRuntimeSchema = z
  .object({
    runCount: z.number().int().nonnegative(),
    lastTriggeredAt: z.string().optional(),
    lastTaskId: z.string().trim().min(1).optional(),
    closedAt: z.string().optional(),
    doneReason: z.enum(['canceled', 'completed', 'exhausted']).optional(),
  })
  .strict()
