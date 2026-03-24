import { z } from 'zod'

import { mergeTaskGitLifecycle } from '../../work/shared/task-git-lifecycle.js'

import type {
  TaskGitExecution,
  TaskResultHandoff,
} from '../../foundation/types/index.js'

export const TASK_HANDOFF_TAG_PATTERN =
  // prompt-guard-exempt: protocol handoff-tag contract constant, not an LLM prompt template.
  '<M:task_handoff>{"summary":"done","next_steps":["..."]}</M:task_handoff>'

const TASK_HANDOFF_TAG_TEST_RE = /<M:task_handoff>([\s\S]*?)<\/M:task_handoff>/i
const TASK_HANDOFF_TAG_STRIP_RE = /<M:task_handoff>[\s\S]*?<\/M:task_handoff>/gi

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

const structuredTaskHandoffSchema = z
  .object({
    summary: z.string().trim().min(1),
    decisions: z.array(z.string().trim().min(1)).max(8).optional(),
    next_steps: z.array(z.string().trim().min(1)).max(8).optional(),
    risks: z.array(z.string().trim().min(1)).max(8).optional(),
    artifacts: z.array(handoffArtifactSchema).max(12).optional(),
    evidence: z.array(handoffEvidenceSchema).max(12).optional(),
    git_lifecycle: handoffGitLifecycleSchema.optional(),
  })
  .strict()

export type StructuredTaskHandoff = z.infer<typeof structuredTaskHandoffSchema>

const extractTaskHandoffJson = (output: string): string | undefined => {
  const match = output.match(TASK_HANDOFF_TAG_TEST_RE)
  const json = match?.[1]?.trim()
  return json && json.length > 0 ? json : undefined
}

export const parseStructuredTaskHandoff = (
  output: string,
): StructuredTaskHandoff | undefined => {
  const json = extractTaskHandoffJson(output)
  if (!json) return undefined
  try {
    return structuredTaskHandoffSchema.parse(JSON.parse(json))
  } catch {
    return undefined
  }
}

export const hasStructuredTaskHandoff = (output: string): boolean =>
  parseStructuredTaskHandoff(output) !== undefined

export const stripTaskHandoffTag = (output: string): string =>
  output.replace(TASK_HANDOFF_TAG_STRIP_RE, '').trim()

export const buildStructuredTaskHandoff = (params: {
  git?: TaskGitExecution | undefined
  output: string
}): TaskResultHandoff | undefined => {
  const parsed = parseStructuredTaskHandoff(params.output)
  if (!parsed) return undefined
  const lifecycle = mergeTaskGitLifecycle({
    current: params.git?.lifecycle,
    patch: parsed.git_lifecycle,
  })
  const git =
    params.git &&
    ({
      ...params.git,
      ...(lifecycle ? { lifecycle } : {}),
    } satisfies TaskGitExecution)
  return {
    summary: parsed.summary,
    ...(parsed.decisions ? { decisions: [...parsed.decisions] } : {}),
    ...(parsed.next_steps ? { nextSteps: [...parsed.next_steps] } : {}),
    ...(parsed.risks ? { risks: [...parsed.risks] } : {}),
    ...(parsed.artifacts ? { artifacts: [...parsed.artifacts] } : {}),
    ...(parsed.evidence ? { evidence: [...parsed.evidence] } : {}),
    ...(git ? { git } : {}),
  }
}
