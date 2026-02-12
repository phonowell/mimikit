import { z } from 'zod'

import type { WorkerProfile } from '../types/index.js'

const blockerStageSchema = z.enum(['discover', 'execute', 'verify', 'finalize'])

const blockerTypeSchema = z.enum([
  'auth',
  'permission',
  'network',
  'tooling',
  'data_quality',
  'rate_limit',
  'other',
])

const roiSchema = z.enum(['high', 'medium', 'low'])

const blockerSchema = z
  .object({
    stage: blockerStageSchema,
    type: blockerTypeSchema,
    symptom: z.string().trim().min(1),
    impact: z.string().trim().min(1),
    attempts: z.array(z.string().trim().min(1)),
    resolved: z.boolean(),
    resolution: z.string().trim().min(1),
    suggestion: z.string().trim().min(1),
    suggested_prompt_delta: z.string().trim().min(1),
    expected_roi: roiSchema,
    confidence: z.number().min(0).max(1),
  })
  .strict()

const evidenceSchema = z
  .object({
    ref: z.string().trim().min(1),
    summary: z.string().trim().min(1),
  })
  .strict()

const checkSchema = z
  .object({
    name: z.string().trim().min(1),
    passed: z.boolean(),
    detail: z.string().trim().min(1),
  })
  .strict()

const executionInsightsSchema = z
  .object({
    summary: z.string().trim().min(1),
    blockers: z.array(blockerSchema),
    next_run_hints: z.array(z.string().trim().min(1)),
  })
  .strict()

const workerFinalOutputSchema = z
  .object({
    answer: z.string().trim().min(1),
    evidence: z.array(evidenceSchema).min(1),
    sources: z.array(z.string().trim().min(1)).min(1),
    checks: z.array(checkSchema).min(1),
    confidence: z.number().min(0).max(1),
    execution_insights: executionInsightsSchema,
  })
  .strict()

export type WorkerFinalOutput = z.infer<typeof workerFinalOutputSchema>

export type FinalOutputValidationResult =
  | {
      ok: true
      data: WorkerFinalOutput
      serialized: string
    }
  | {
      ok: false
      errors: string[]
    }

const parseJson = (text: string): unknown | undefined => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

const extractJsonFromCodeFence = (raw: string): string | undefined => {
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (!match?.[1]) return undefined
  return match[1].trim()
}

const extractJsonFromTag = (raw: string): string | undefined => {
  const match = raw.match(
    /<MIMIKIT:final_json>\s*([\s\S]*?)\s*<\/MIMIKIT:final_json>/i,
  )
  if (!match?.[1]) return undefined
  return match[1].trim()
}

const extractJsonByBraces = (raw: string): string | undefined => {
  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  if (first < 0 || last < 0 || last <= first) return undefined
  return raw.slice(first, last + 1).trim()
}

const collectJsonCandidates = (raw: string): string[] => {
  const trimmed = raw.trim()
  const candidates = [
    trimmed,
    extractJsonFromCodeFence(trimmed),
    extractJsonFromTag(trimmed),
    extractJsonByBraces(trimmed),
  ]
  const seen = new Set<string>()
  return candidates.filter((item): item is string => {
    if (!item) return false
    if (seen.has(item)) return false
    seen.add(item)
    return true
  })
}

const parseFinalJson = (raw: string): unknown | undefined => {
  const candidates = collectJsonCandidates(raw)
  for (const candidate of candidates) {
    const parsed = parseJson(candidate)
    if (parsed !== undefined) return parsed
  }
  return undefined
}

const toZodErrors = (error: z.ZodError): string[] =>
  error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'root'
    return `${path}:${issue.message}`
  })

export const validateWorkerFinalOutput = (params: {
  raw: string
  profile: WorkerProfile
  evidenceRefs?: ReadonlySet<string>
}): FinalOutputValidationResult => {
  const parsed = parseFinalJson(params.raw)
  if (parsed === undefined) {
    return {
      ok: false,
      errors: ['final_output_not_json'],
    }
  }
  const validated = workerFinalOutputSchema.safeParse(parsed)
  if (!validated.success) {
    return {
      ok: false,
      errors: toZodErrors(validated.error),
    }
  }
  const { data } = validated
  const failedChecks = data.checks
    .filter((check) => check.passed === false)
    .map((check) => check.name)
  if (failedChecks.length > 0) {
    return {
      ok: false,
      errors: [
        `checks_not_passed:${failedChecks.join(',')}`,
        'final_response_must_only_include_passed_checks',
      ],
    }
  }
  if (params.profile === 'standard' && params.evidenceRefs) {
    const invalidRefs = data.evidence
      .map((item) => item.ref)
      .filter((ref) => !params.evidenceRefs?.has(ref))
    if (invalidRefs.length > 0) {
      return {
        ok: false,
        errors: [`unknown_evidence_refs:${invalidRefs.join(',')}`],
      }
    }
  }
  return {
    ok: true,
    data,
    serialized: JSON.stringify(data, null, 2),
  }
}

export const buildFinalOutputRepairHint = (errors: string[]): string =>
  [
    'final_output_validation_failed:',
    ...errors.map((item, index) => `${index + 1}. ${item}`),
    'return_only_valid_json_following_required_schema.',
  ].join('\n')
