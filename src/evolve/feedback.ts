import { appendFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

import { readJson, writeJson } from '../fs/json.js'
import { ensureDir } from '../fs/paths.js'
import { nowIso } from '../shared/utils.js'
import { appendJsonl, readJsonl } from '../storage/jsonl.js'

import type { ReplaySuite } from '../eval/replay-types.js'
import type { TokenUsage } from '../types/index.js'

export type FeedbackIssueCategory =
  | 'quality'
  | 'latency'
  | 'cost'
  | 'failure'
  | 'ux'
  | 'other'

export type EvolveFeedback = {
  id: string
  createdAt: string
  kind: 'user_feedback' | 'runtime_signal'
  severity: 'low' | 'medium' | 'high'
  message: string
  source?: 'api_feedback' | 'manager_tool' | 'idle_review' | 'runtime'
  evidence?: {
    fromMessageId?: string
    taskId?: string
    elapsedMs?: number
    usageTotal?: number
    event?: string
  }
  issue?: {
    category?: FeedbackIssueCategory
    fingerprint?: string
    roiScore?: number
    confidence?: number
    action?: 'ignore' | 'defer' | 'fix'
    rationale?: string
  }
  context?: {
    input?: string
    response?: string
    note?: string
  }
}

export type EvolveFeedbackIssue = {
  fingerprint: string
  category: FeedbackIssueCategory
  title: string
  roiScore: number
  confidence: number
  count: number
  firstSeenAt: string
  lastSeenAt: string
  status: 'open' | 'deferred' | 'ignored' | 'resolved'
  evidence: Array<{
    feedbackId: string
    kind: EvolveFeedback['kind']
    severity: EvolveFeedback['severity']
    message: string
    createdAt: string
    source?: EvolveFeedback['source']
  }>
  action?: 'ignore' | 'defer' | 'fix'
  mustContain?: string[]
  rationale?: string
}

export type ExtractIssueResult =
  | {
      kind: 'issue'
      issue: {
        title: string
        category: FeedbackIssueCategory
        fingerprint?: string
        roiScore?: number
        confidence?: number
        action?: 'ignore' | 'defer' | 'fix'
        rationale?: string
      }
    }
  | {
      kind: 'non_issue'
      rationale?: string
    }

const feedbackPath = (stateDir: string): string =>
  resolve(join(stateDir, 'evolve', 'feedback.jsonl'))

const feedbackArchivePath = (stateDir: string): string =>
  resolve(join(stateDir, 'evolve', 'feedback-archive.md'))

const suitePath = (stateDir: string): string =>
  resolve(join(stateDir, 'evolve', 'feedback-suite.json'))

const feedbackStatePath = (stateDir: string): string =>
  resolve(join(stateDir, 'evolve', 'feedback-state.json'))

const issueQueuePath = (stateDir: string): string =>
  resolve(join(stateDir, 'evolve', 'issue-queue.json'))

export type EvolveFeedbackState = {
  processedCount: number
  lastRunAt?: string
  lastIdleReviewAt?: string
}

const normalizeArchiveField = (text: string): string =>
  text.replace(/\s*\r?\n\s*/g, ' / ').trim()

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const normalizeFingerprint = (value: string): string =>
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

const normalizeIssue = (
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

const appendFeedbackArchive = async (
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

const mergeIssueIntoMap = (
  map: Map<string, EvolveFeedbackIssue>,
  feedback: EvolveFeedback,
): void => {
  const fingerprint = feedback.issue?.fingerprint
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

const toReplayCase = (
  issue: EvolveFeedbackIssue,
  index: number,
): ReplaySuite['cases'][number] => {
  const input = issue.evidence.at(-1)?.message ?? issue.title
  const mustContain =
    issue.mustContain ?? (issue.category === 'quality' ? ['具体'] : undefined)
  return {
    id: `issue-${index + 1}`,
    description: issue.title,
    history: [],
    inputs: [
      {
        id: `issue-input-${index + 1}`,
        text: input,
        createdAt: issue.lastSeenAt,
      },
    ],
    tasks: [],
    results: [],
    ...(mustContain
      ? {
          expect: {
            output: { mustContain },
          },
        }
      : {}),
  }
}

export const writeFeedbackReplaySuite = async (params: {
  stateDir: string
  issues: EvolveFeedbackIssue[]
  maxCases: number
}): Promise<ReplaySuite | null> => {
  const items = params.issues
    .slice(0, Math.max(0, params.maxCases))
    .map((item, index) => toReplayCase(item, index))
  if (items.length === 0) return null
  const suite: ReplaySuite = {
    suite: 'feedback-derived-suite',
    version: 1,
    cases: items,
  }
  const path = suitePath(params.stateDir)
  await ensureDir(dirname(path))
  await writeFile(path, `${JSON.stringify(suite, null, 2)}\n`, 'utf8')
  return suite
}

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

export const getFeedbackReplaySuitePath = (stateDir: string): string =>
  suitePath(stateDir)

export const getFeedbackArchivePath = (stateDir: string): string =>
  feedbackArchivePath(stateDir)

export const getIssueQueuePath = (stateDir: string): string =>
  issueQueuePath(stateDir)
