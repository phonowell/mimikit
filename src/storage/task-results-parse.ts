import {
  parseTaskCancelSource,
  parseTaskResultOutcome,
  parseTaskResultStatus,
  parseTaskResultStopReason,
  parseTaskStatus,
  parseWorkerProvider,
} from '../types/runtime-domain.js'

import {
  extractArchiveSection,
  parseArchiveDocument,
} from './archive-format.js'
import {
  taskEvidenceSchema,
  taskResultHandoffSchema,
} from './runtime-snapshot-schema.js'
import { parseTokenUsageJson } from './token-usage.js'

import type {
  TaskCancelMeta,
  TaskResult,
  TaskResultHandoff,
  TaskResultStatus,
} from '../types/index.js'
import type { z } from 'zod'

export type TaskResultSearchSource = {
  taskId: string
  status: TaskResultStatus
  completedAt: string
  archivePath: string
  title?: string
  prompt: string
  output: string
}

const parseStatus = (value?: string): TaskResultStatus | null =>
  parseTaskResultStatus(value) ?? null

const parseCancelSource = (
  value?: string,
): TaskCancelMeta['source'] | undefined => {
  const normalized = value === 'http' ? 'user' : value
  return parseTaskCancelSource(normalized)
}

const parseArchiveJsonObject = <T extends Record<string, unknown>>(
  raw: string | undefined,
  schema: z.ZodType<T>,
): T | undefined => {
  if (!raw) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return undefined
  }
  const result = schema.safeParse(parsed)
  if (!result.success) return undefined
  return Object.keys(result.data).length > 0 ? result.data : undefined
}

const parseTaskResultHandoff = (raw?: string): TaskResultHandoff | undefined =>
  parseArchiveJsonObject(raw, taskResultHandoffSchema)

const parseTaskEvidence = (raw?: string): TaskResult['evidence'] | undefined =>
  parseArchiveJsonObject(raw, taskEvidenceSchema)

export const parseTaskResultArchive = (
  content: string,
  archivePath?: string,
): TaskResult | null => {
  const parsed = parseArchiveDocument(content)
  const taskId = parsed.header.task_id
  const status = parseStatus(parsed.header.status)
  const completedAt = parsed.header.completed_at ?? parsed.header.created_at
  if (!taskId || !status || !completedAt) return null

  const durationMs = Number(parsed.header.duration_ms)
  const usage = parseTokenUsageJson(parsed.header.usage)
  const provider = parseWorkerProvider(parsed.header.provider)
  const taskStatus = parseTaskStatus(parsed.header.task_status)
  const outcome = parseTaskResultOutcome(parsed.header.outcome)
  const stopReason = parseTaskResultStopReason(parsed.header.stop_reason)
  const cancelSource = parseCancelSource(parsed.header.cancel_source)
  const cancel: TaskCancelMeta | undefined = cancelSource
    ? {
        source: cancelSource,
        ...(parsed.header.cancel_reason
          ? { reason: parsed.header.cancel_reason }
          : {}),
      }
    : undefined
  const handoff = parseTaskResultHandoff(parsed.header.handoff)
  const evidence = parseTaskEvidence(parsed.header.evidence)

  return {
    taskId,
    status,
    ok: status === 'succeeded',
    output: extractArchiveSection(parsed, '=== RESULT ==='),
    durationMs: Number.isFinite(durationMs) ? durationMs : 0,
    completedAt,
    ...(taskStatus ? { taskStatus } : {}),
    ...(outcome ? { outcome } : {}),
    ...(stopReason ? { stopReason } : {}),
    ...(usage ? { usage } : {}),
    ...(provider ? { provider } : {}),
    ...(parsed.header.title ? { title: parsed.header.title } : {}),
    ...(archivePath ? { archivePath } : {}),
    ...(cancel ? { cancel } : {}),
    ...(handoff ? { handoff } : {}),
    ...(evidence ? { evidence } : {}),
  }
}

export const parseTaskResultSearchSource = (
  content: string,
  archivePath: string,
): TaskResultSearchSource | null => {
  const parsed = parseArchiveDocument(content)
  const taskId = parsed.header.task_id?.trim()
  const status = parseStatus(parsed.header.status)
  const completedAt =
    parsed.header.completed_at?.trim() ?? parsed.header.created_at?.trim()
  if (!taskId || !status || !completedAt) return null

  return {
    taskId,
    status,
    completedAt,
    archivePath,
    ...(parsed.header.title?.trim()
      ? { title: parsed.header.title.trim() }
      : {}),
    prompt: extractArchiveSection(parsed, '=== PROMPT ==='),
    output: extractArchiveSection(parsed, '=== RESULT ==='),
  }
}
