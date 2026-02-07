import type {
  EvolveFeedback,
  EvolveFeedbackIssue,
  ExtractIssueResult,
  FeedbackIssueCategory,
} from './feedback-types.js'

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

export const normalizeArchiveField = (text: string): string =>
  text.replace(/\s*\r?\n\s*/g, ' / ').trim()

export const normalizeFingerprint = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 120)

const buildDefaultFingerprint = (
  feedback: Pick<EvolveFeedback, 'kind' | 'message' | 'context'>,
): string =>
  normalizeFingerprint(
    [feedback.kind, feedback.context?.note, feedback.message]
      .filter(Boolean)
      .join(': '),
  )

const severityWeight = (severity: EvolveFeedback['severity']): number => {
  if (severity === 'high') return 1
  if (severity === 'medium') return 0.6
  return 0.3
}

const usagePenaltyScore = (usageTotal?: number): number => {
  if (!usageTotal || usageTotal <= 0) return 0
  if (usageTotal >= 20_000) return 1
  if (usageTotal >= 8_000) return 0.7
  if (usageTotal >= 2_000) return 0.4
  return 0.15
}

const latencyPenaltyScore = (elapsedMs?: number): number => {
  if (!elapsedMs || elapsedMs <= 0) return 0
  if (elapsedMs >= 120_000) return 1
  if (elapsedMs >= 45_000) return 0.75
  if (elapsedMs >= 12_000) return 0.45
  return 0.2
}

const categoryValueScore = (category: FeedbackIssueCategory): number => {
  if (category === 'failure') return 1
  if (category === 'cost') return 0.85
  if (category === 'latency') return 0.8
  if (category === 'quality') return 0.65
  if (category === 'ux') return 0.45
  return 0.3
}

export const normalizeIssue = (
  feedback: EvolveFeedback,
  extracted?: ExtractIssueResult,
): EvolveFeedback => {
  if (!extracted || extracted.kind === 'non_issue') {
    const action: EvolveFeedbackIssue['action'] =
      extracted?.kind === 'non_issue' ? 'ignore' : 'defer'
    const rationale =
      extracted?.kind === 'non_issue' ? extracted.rationale : undefined
    return {
      ...feedback,
      issue: {
        category: 'other',
        fingerprint: buildDefaultFingerprint(feedback),
        roiScore: 0,
        confidence: 0,
        action,
        ...(rationale ? { rationale } : {}),
      },
    }
  }

  const fingerprint = normalizeFingerprint(
    extracted.issue.fingerprint && extracted.issue.fingerprint.length > 0
      ? extracted.issue.fingerprint
      : buildDefaultFingerprint(feedback),
  )
  const confidence = clamp(extracted.issue.confidence ?? 0.6, 0, 1)
  const severity = severityWeight(feedback.severity)
  const categoryValue = categoryValueScore(extracted.issue.category)
  const usageScore = usagePenaltyScore(feedback.evidence?.usageTotal)
  const latencyScore = latencyPenaltyScore(feedback.evidence?.elapsedMs)
  const baseRoi =
    severity * 45 + categoryValue * 30 + usageScore * 15 + latencyScore * 10
  const roiScore = clamp(
    Math.round((extracted.issue.roiScore ?? baseRoi) * confidence),
    0,
    100,
  )
  return {
    ...feedback,
    issue: {
      category: extracted.issue.category,
      fingerprint,
      roiScore,
      confidence,
      action: extracted.issue.action ?? (roiScore < 30 ? 'defer' : 'fix'),
      ...(extracted.issue.rationale
        ? { rationale: extracted.issue.rationale }
        : {}),
    },
  }
}
