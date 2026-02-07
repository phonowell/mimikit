import { appendFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { ensureDir } from '../fs/paths.js'

import { normalizeArchiveField } from './feedback-normalize.js'
import { feedbackArchivePath } from './feedback-storage.js'

import type { EvolveFeedback } from './feedback-types.js'

export const appendFeedbackArchive = async (
  stateDir: string,
  feedback: EvolveFeedback,
): Promise<void> => {
  const archivePath = feedbackArchivePath(stateDir)
  await ensureDir(dirname(archivePath))
  const archiveLines = [
    `## ${feedback.createdAt} ${feedback.id}`,
    `- kind: ${feedback.kind}`,
    `- severity: ${feedback.severity}`,
    `- message: ${normalizeArchiveField(feedback.message)}`,
  ]
  if (feedback.source) archiveLines.push(`- source: ${feedback.source}`)
  if (feedback.issue?.category)
    archiveLines.push(`- issue.category: ${feedback.issue.category}`)
  if (feedback.issue?.fingerprint)
    archiveLines.push(`- issue.fingerprint: ${feedback.issue.fingerprint}`)
  if (feedback.issue?.roiScore !== undefined)
    archiveLines.push(`- issue.roi: ${feedback.issue.roiScore}`)
  if (feedback.issue?.confidence !== undefined)
    archiveLines.push(`- issue.confidence: ${feedback.issue.confidence}`)
  if (feedback.issue?.action)
    archiveLines.push(`- issue.action: ${feedback.issue.action}`)
  if (feedback.issue?.rationale) {
    archiveLines.push(
      `- issue.rationale: ${normalizeArchiveField(feedback.issue.rationale)}`,
    )
  }
  if (feedback.evidence?.event)
    archiveLines.push(`- evidence.event: ${feedback.evidence.event}`)
  if (feedback.evidence?.taskId)
    archiveLines.push(`- evidence.taskId: ${feedback.evidence.taskId}`)
  if (feedback.evidence?.elapsedMs !== undefined)
    archiveLines.push(`- evidence.elapsedMs: ${feedback.evidence.elapsedMs}`)
  if (feedback.evidence?.usageTotal !== undefined)
    archiveLines.push(`- evidence.usageTotal: ${feedback.evidence.usageTotal}`)
  if (feedback.context?.input) {
    archiveLines.push(
      `- context.input: ${normalizeArchiveField(feedback.context.input)}`,
    )
  }
  if (feedback.context?.response) {
    archiveLines.push(
      `- context.response: ${normalizeArchiveField(feedback.context.response)}`,
    )
  }
  if (feedback.context?.note) {
    archiveLines.push(
      `- context.note: ${normalizeArchiveField(feedback.context.note)}`,
    )
  }
  await appendFile(archivePath, `${archiveLines.join('\n')}\n\n`, 'utf8')
}
