import { z } from 'zod'

import type {
  TaskGitExecution,
  TaskResultHandoff,
} from '../../foundation/types/index.js'

const handoffArtifactSchema = z
  .object({
    path: z.string().trim().min(1),
    kind: z.string().trim().min(1).optional(),
    note: z.string().trim().min(1).optional(),
  })
  .strict()

const handoffEvidenceSchema = z
  .object({
    type: z.enum(['task_archive', 'file', 'history']),
    ref: z.string().trim().min(1),
    note: z.string().trim().min(1).optional(),
  })
  .strict()

const handoffGitReviewSchema = z
  .object({
    passed: z.boolean(),
    at: z.string().trim().min(1).optional(),
    sha: z.string().trim().min(1).optional(),
  })
  .strict()

const handoffGitLifecycleSchema = z
  .object({
    review: handoffGitReviewSchema.optional(),
    merged: z.boolean().optional(),
    cleaned: z.boolean().optional(),
  })
  .strict()

export const workerTaskHandoffSchema = z
  .object({
    summary: z.string().trim().min(1).optional(),
    decisions: z.array(z.string().trim().min(1)).max(8).optional(),
    next_steps: z.array(z.string().trim().min(1)).max(8).optional(),
    risks: z.array(z.string().trim().min(1)).max(8).optional(),
    artifacts: z.array(handoffArtifactSchema).max(12).optional(),
    evidence: z.array(handoffEvidenceSchema).max(12).optional(),
    git_lifecycle: handoffGitLifecycleSchema.optional(),
  })
  .strict()

export type StructuredTaskHandoff = z.infer<typeof workerTaskHandoffSchema>

export const buildStructuredTaskHandoff = (params: {
  git?: TaskGitExecution | undefined
  handoff: unknown
}): TaskResultHandoff | undefined => {
  const parsed = workerTaskHandoffSchema.parse(params.handoff)
  const git =
    params.git &&
    ({
      ...params.git,
    } satisfies TaskGitExecution)
  return {
    ...(parsed.summary ? { summary: parsed.summary } : {}),
    ...(parsed.decisions ? { decisions: [...parsed.decisions] } : {}),
    ...(parsed.next_steps ? { nextSteps: [...parsed.next_steps] } : {}),
    ...(parsed.risks ? { risks: [...parsed.risks] } : {}),
    ...(parsed.artifacts ? { artifacts: [...parsed.artifacts] } : {}),
    ...(parsed.evidence ? { evidence: [...parsed.evidence] } : {}),
    ...(git ? { git } : {}),
  }
}
