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

export const normalizeMaxIterations = (
  value: number | undefined,
  fallback: number,
): number => {
  const candidate = Number.isFinite(value) ? (value as number) : fallback
  const rounded = Math.floor(candidate)
  return rounded >= 1 ? rounded : 1
}

export const trimForEnv = (value: string, limit: number): string =>
  value.length > limit ? value.slice(0, limit) : value

export const trimText = (value: string, limit: number): string =>
  value.length > limit ? value.slice(0, limit) : value

export const buildSummary = (value: string, maxLen = 80): string => {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) return ''
  if (normalized.length <= maxLen) return normalized
  return `${normalized.slice(0, maxLen - 3).trimEnd()}...`
}

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
