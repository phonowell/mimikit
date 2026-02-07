export type PromptGuardResult = {
  ok: boolean
  reason: string
}

const REQUIRED_MARKERS = [
  '<MIMIKIT:commands>',
  '</MIMIKIT:commands>',
  '@add_task',
  '@cancel_task',
]

const isFiniteRatio = (value: number): boolean =>
  Number.isFinite(value) && value > 0

export const validatePromptCandidate = (
  original: string,
  candidate: string,
): PromptGuardResult => {
  const normalizedOriginal = original.trim()
  const normalizedCandidate = candidate.trim()
  if (!normalizedCandidate) return { ok: false, reason: 'candidate_empty' }

  for (const marker of REQUIRED_MARKERS) {
    if (!normalizedCandidate.includes(marker))
      return { ok: false, reason: `missing_marker:${marker}` }
  }

  const originalLength = normalizedOriginal.length
  const candidateLength = normalizedCandidate.length
  if (!isFiniteRatio(originalLength))
    return { ok: false, reason: 'invalid_original_length' }

  const ratio = candidateLength / originalLength
  if (ratio < 0.5) return { ok: false, reason: 'candidate_too_short' }
  if (ratio > 1.8) return { ok: false, reason: 'candidate_too_long' }

  return { ok: true, reason: 'ok' }
}
