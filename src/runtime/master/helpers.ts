export const sanitizeVerifyCommand = (
  value: string | undefined,
): string | undefined => {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (trimmed.includes('\n') || trimmed.includes('\r'))
    throw new Error('verifyCommand must be a single line')
  return trimmed
}

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

export const buildRetryMessage = (params: {
  prompt: string
  output: string
  verifyError: string
  attempt: number
  maxIterations: number
}): string =>
  [
    params.prompt.trim(),
    '',
    `Previous output (attempt ${params.attempt} of ${params.maxIterations}):`,
    params.output.trim(),
    '',
    'Verification failed:',
    params.verifyError.trim(),
    '',
    'Fix the issues and respond with the corrected output only.',
  ].join('\n')
