import { dirname } from 'node:path'

import { writeJson } from '../fs/json.js'
import { ensureDir } from '../fs/paths.js'
import { nowIso } from '../shared/utils.js'

import { normalizeFingerprint } from './feedback-normalize.js'
import { issueQueuePath } from './feedback-storage.js'

import type { EvolveFeedback, EvolveFeedbackIssue } from './feedback-types.js'

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const mergeIssueIntoMap = (
  map: Map<string, EvolveFeedbackIssue>,
  feedback: EvolveFeedback,
): void => {
  const fingerprint = feedback.issue?.fingerprint
    ? normalizeFingerprint(feedback.issue.fingerprint)
    : undefined
  if (!fingerprint) return
  const category = feedback.issue?.category ?? 'other'
  const confidence = clamp(feedback.issue?.confidence ?? 0, 0, 1)
  const roiScore = clamp(Math.round(feedback.issue?.roiScore ?? 0), 0, 100)
  const action = feedback.issue?.action ?? (roiScore < 30 ? 'defer' : 'fix')
  const existing = map.get(fingerprint)
  const mustContain = feedback.context?.note
    ? [feedback.context.note]
    : undefined
  const evidenceEntry = {
    feedbackId: feedback.id,
    kind: feedback.kind,
    severity: feedback.severity,
    message: feedback.message,
    createdAt: feedback.createdAt,
    ...(feedback.source ? { source: feedback.source } : {}),
  }
  if (!existing) {
    map.set(fingerprint, {
      fingerprint,
      category,
      title: feedback.message,
      roiScore,
      confidence,
      count: 1,
      firstSeenAt: feedback.createdAt,
      lastSeenAt: feedback.createdAt,
      status:
        action === 'ignore'
          ? 'ignored'
          : action === 'defer'
            ? 'deferred'
            : 'open',
      evidence: [evidenceEntry],
      action,
      ...(mustContain ? { mustContain } : {}),
      ...(feedback.issue?.rationale
        ? { rationale: feedback.issue.rationale }
        : {}),
    })
    return
  }
  existing.count += 1
  existing.lastSeenAt = feedback.createdAt
  const blendedRoi =
    Math.round((existing.roiScore * 0.7 + roiScore * 0.3) * 100) / 100
  existing.roiScore = clamp(Math.round(blendedRoi), 0, 100)
  existing.confidence =
    Math.round(clamp((existing.confidence + confidence) / 2, 0, 1) * 100) / 100
  existing.evidence.push(evidenceEntry)
  if (existing.evidence.length > 8)
    existing.evidence = existing.evidence.slice(existing.evidence.length - 8)
  if (existing.status !== 'resolved') {
    existing.status =
      action === 'ignore' ? 'ignored' : action === 'defer' ? 'deferred' : 'open'
  }
  if (mustContain) existing.mustContain = mustContain
}

export const buildIssueQueue = (
  feedback: EvolveFeedback[],
): EvolveFeedbackIssue[] => {
  const issueMap = new Map<string, EvolveFeedbackIssue>()
  for (const item of feedback) mergeIssueIntoMap(issueMap, item)
  return Array.from(issueMap.values()).sort((left, right) => {
    if (right.roiScore !== left.roiScore) return right.roiScore - left.roiScore
    if (right.count !== left.count) return right.count - left.count
    return Date.parse(right.lastSeenAt) - Date.parse(left.lastSeenAt)
  })
}

export const persistIssueQueue = async (
  stateDir: string,
  issues: EvolveFeedbackIssue[],
): Promise<void> => {
  const path = issueQueuePath(stateDir)
  await ensureDir(dirname(path))
  await writeJson(path, {
    generatedAt: nowIso(),
    count: issues.length,
    issues,
  })
}

export const selectActionableIssues = (params: {
  issues: EvolveFeedbackIssue[]
  minRoiScore: number
  maxCount: number
}): EvolveFeedbackIssue[] => {
  const selected = params.issues.filter(
    (issue) =>
      issue.status === 'open' &&
      issue.roiScore >= params.minRoiScore &&
      issue.confidence >= 0.4,
  )
  return selected.slice(0, Math.max(1, params.maxCount))
}
