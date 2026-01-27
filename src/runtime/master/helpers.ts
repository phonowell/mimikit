const sanitizeCommand = (
  value: string | undefined,
  label: string,
): string | undefined => {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (trimmed.includes('\n') || trimmed.includes('\r'))
    throw new Error(`${label} must be a single line`)
  return trimmed
}

export const sanitizeVerifyCommand = (
  value: string | undefined,
): string | undefined => sanitizeCommand(value, 'verifyCommand')

export const sanitizeScoreCommand = (
  value: string | undefined,
): string | undefined => sanitizeCommand(value, 'scoreCommand')

export const normalizeMaxIterations = (
  value: number | undefined,
  fallback: number,
): number => {
  const candidate = Number.isFinite(value) ? (value as number) : fallback
  const rounded = Math.floor(candidate)
  return rounded >= 1 ? rounded : 1
}

export const normalizeMinScore = (
  value: number | undefined,
): number | undefined => {
  if (value === undefined) return undefined
  if (!Number.isFinite(value)) throw new Error('minScore must be a number')
  return value
}

export const normalizeGuardLimit = (
  value: number | undefined,
  label: string,
): number | undefined => {
  if (value === undefined) return undefined
  if (!Number.isFinite(value) || value < 0)
    throw new Error(`${label} must be a non-negative number`)
  return Math.floor(value)
}

export const normalizeObjective = (
  value: string | undefined,
): string | undefined => {
  if (!value) return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export const trimForEnv = (value: string, limit: number): string =>
  value.length > limit ? value.slice(0, limit) : value

export const trimText = (value: string, limit: number): string =>
  value.length > limit ? value.slice(0, limit) : value

export const buildRetryMessage = (params: {
  prompt: string
  output: string
  attempt: number
  maxIterations: number
  issues: string[]
}): string =>
  [
    params.prompt.trim(),
    '',
    `Previous output (attempt ${params.attempt} of ${params.maxIterations}):`,
    params.output.trim(),
    '',
    'Issues:',
    ...params.issues.map((issue) => `- ${issue.trim()}`),
    '',
    'Fix the issues and respond with the corrected output only.',
  ].join('\n')

export const parseScoreOutput = (
  value: string,
): { score?: number; summary?: string } => {
  const trimmed = value.trim()
  if (!trimmed) return {}
  const match = trimmed.match(/-?\d+(?:\.\d+)?/)
  const score = match ? Number(match[0]) : undefined
  if (score !== undefined && Number.isFinite(score))
    return { score, summary: trimText(trimmed, 800) }

  return { summary: trimText(trimmed, 800) }
}
