import { dirname } from 'node:path'

import { readJson, writeJson } from '../fs/json.js'
import { ensureDir } from '../fs/paths.js'
import { nowIso } from '../shared/utils.js'
import { appendJsonl, readJsonl } from '../storage/jsonl.js'

import { appendFeedbackArchive } from './feedback-archive.js'
import {
  buildIssueQueue,
  persistIssueQueue,
  selectActionableIssues,
} from './feedback-issue-queue.js'
import { normalizeIssue } from './feedback-normalize.js'
import {
  feedbackArchivePath,
  feedbackPath,
  feedbackStatePath,
  getFeedbackStoragePaths,
  issueQueuePath,
} from './feedback-storage.js'

import type {
  EvolveFeedback,
  EvolveFeedbackIssue,
  EvolveFeedbackState,
  ExtractIssueResult,
  FeedbackIssueCategory,
} from './feedback-types.js'
import type { TokenUsage } from '../types/index.js'

export type {
  EvolveFeedback,
  EvolveFeedbackIssue,
  EvolveFeedbackState,
  ExtractIssueResult,
  FeedbackIssueCategory,
}

export const appendEvolveFeedback = async (
  stateDir: string,
  feedback: EvolveFeedback,
): Promise<void> => {
  const path = feedbackPath(stateDir)
  await ensureDir(dirname(path))
  await appendJsonl(path, [feedback])
  await appendFeedbackArchive(stateDir, feedback)
}

export const appendStructuredFeedback = async (params: {
  stateDir: string
  feedback: Omit<EvolveFeedback, 'issue'>
  extractedIssue?: ExtractIssueResult
}): Promise<EvolveFeedback> => {
  const normalized = normalizeIssue(params.feedback, params.extractedIssue)
  await appendEvolveFeedback(params.stateDir, normalized)
  return normalized
}

export const readEvolveFeedback = (
  stateDir: string,
): Promise<EvolveFeedback[]> =>
  readJsonl<EvolveFeedback>(feedbackPath(stateDir))

export const readEvolveFeedbackState = (
  stateDir: string,
): Promise<EvolveFeedbackState> =>
  readJson<EvolveFeedbackState>(feedbackStatePath(stateDir), {
    processedCount: 0,
  })

export const writeEvolveFeedbackState = async (
  stateDir: string,
  state: EvolveFeedbackState,
): Promise<void> => {
  const path = feedbackStatePath(stateDir)
  await ensureDir(dirname(path))
  await writeJson(path, state)
}

export const resetEvolveFeedbackState = async (
  stateDir: string,
): Promise<void> => {
  await writeEvolveFeedbackState(stateDir, { processedCount: 0 })
}

export const selectPendingFeedback = (params: {
  feedback: EvolveFeedback[]
  processedCount: number
  historyLimit: number
}): EvolveFeedback[] => {
  const start = Math.min(
    Math.max(0, params.processedCount),
    params.feedback.length,
  )
  const pending = params.feedback.slice(start)
  if (pending.length === 0) return []
  const limit = Math.max(0, params.historyLimit)
  if (limit === 0 || pending.length <= limit) return pending
  return pending.slice(Math.max(0, pending.length - limit))
}

export const hasPendingEvolveFeedback = async (params: {
  stateDir: string
  historyLimit: number
}): Promise<boolean> => {
  const feedback = await readEvolveFeedback(params.stateDir)
  const state = await readEvolveFeedbackState(params.stateDir)
  const pending = selectPendingFeedback({
    feedback,
    processedCount: state.processedCount,
    historyLimit: params.historyLimit,
  })
  return pending.length > 0
}

export {
  buildIssueQueue,
  persistIssueQueue,
  selectActionableIssues,
}

export const readIssueQueue = (
  stateDir: string,
): Promise<{
  generatedAt?: string
  count?: number
  issues: EvolveFeedbackIssue[]
}> =>
  readJson<{
    generatedAt?: string
    count?: number
    issues: EvolveFeedbackIssue[]
  }>(issueQueuePath(stateDir), { issues: [] })

const inferSeverityFromMetrics = (params: {
  elapsedMs?: number
  usage?: TokenUsage
  forceHigh?: boolean
}): EvolveFeedback['severity'] => {
  if (params.forceHigh) return 'high'
  const elapsedMs = params.elapsedMs ?? 0
  const usageTotal = params.usage?.total ?? 0
  if (elapsedMs >= 60_000 || usageTotal >= 15_000) return 'high'
  if (elapsedMs >= 20_000 || usageTotal >= 6_000) return 'medium'
  return 'low'
}

export const appendRuntimeSignalFeedback = async (params: {
  stateDir: string
  message: string
  severity?: EvolveFeedback['severity']
  context?: EvolveFeedback['context']
  evidence?: EvolveFeedback['evidence']
  extractedIssue?: ExtractIssueResult
}): Promise<{ id: string; feedback: EvolveFeedback }> => {
  const id = `fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const inferredSeverity = inferSeverityFromMetrics({
    ...(params.evidence?.elapsedMs !== undefined
      ? { elapsedMs: params.evidence.elapsedMs }
      : {}),
    ...(params.evidence?.usageTotal !== undefined
      ? { usage: { total: params.evidence.usageTotal } }
      : {}),
  })
  const feedback = await appendStructuredFeedback({
    stateDir: params.stateDir,
    feedback: {
      id,
      createdAt: nowIso(),
      kind: 'runtime_signal',
      severity: params.severity ?? inferredSeverity,
      message: params.message,
      source: 'runtime',
      ...(params.evidence ? { evidence: params.evidence } : {}),
      ...(params.context ? { context: params.context } : {}),
    },
    ...(params.extractedIssue ? { extractedIssue: params.extractedIssue } : {}),
  })
  return { id, feedback }
}

export const getFeedbackArchivePath = (stateDir: string): string =>
  feedbackArchivePath(stateDir)

export const getIssueQueuePath = (stateDir: string): string =>
  issueQueuePath(stateDir)

export { getFeedbackStoragePaths }
