import {
  toDisplayPath,
  toStateDisplayPath,
} from '../../surface/shared/path-display.js'
import { truncateText } from '../shared/text.js'

import { normalizePromptUsage } from './format-base.js'

import type { TaskCancelMeta, TaskResult } from '../types/index.js'

const TASK_OUTPUT_MAX_CHARS = 320
const TASK_HANDOFF_TEXT_MAX_CHARS = 220

const toCancelMeta = (
  cancel?: TaskCancelMeta,
): Record<string, unknown> | undefined =>
  cancel
    ? {
        source: cancel.source,
        ...(cancel.reason ? { reason: cancel.reason } : {}),
      }
    : undefined

const toHandoffPayload = (
  handoff: TaskResult['handoff'],
): Record<string, unknown> | undefined => {
  if (!handoff) return undefined
  const text = (value?: string): string | undefined => {
    if (!value) return undefined
    return truncateText(value, TASK_HANDOFF_TEXT_MAX_CHARS, {
      normalizeWhitespace: true,
    })
  }
  const list = (items?: string[]): string[] | undefined => {
    if (!items || items.length === 0) return undefined
    const normalized = items
      .map((item) => text(item))
      .filter((item): item is string => Boolean(item))
    return normalized.length > 0 ? normalized : undefined
  }
  const artifacts = handoff.artifacts
    ?.map((item) => {
      const path = item.path.trim()
      if (!path) return null
      return {
        path,
        ...(item.kind?.trim() ? { kind: item.kind.trim() } : {}),
        ...(text(item.note) ? { note: text(item.note) } : {}),
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
  const evidence = handoff.evidence
    ?.map((item) => {
      const ref = item.ref.trim()
      if (!ref) return null
      return {
        type: item.type,
        ref,
        ...(text(item.note) ? { note: text(item.note) } : {}),
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
  const summary = text(handoff.summary)
  const decisions = list(handoff.decisions)
  const nextSteps = list(handoff.nextSteps)
  const risks = list(handoff.risks)
  const payload = {
    ...(summary ? { summary } : {}),
    ...(decisions ? { decisions } : {}),
    ...(nextSteps ? { next_steps: nextSteps } : {}),
    ...(risks ? { risks } : {}),
    ...(artifacts && artifacts.length > 0 ? { artifacts } : {}),
    ...(evidence && evidence.length > 0 ? { evidence } : {}),
  }
  return Object.keys(payload).length > 0 ? payload : undefined
}

export const pickArchivePath = (
  resultArchivePath?: string,
  taskArchivePath?: string,
  workDir?: string,
): string | undefined => {
  const resultPath = resultArchivePath?.trim()
  if (resultPath)
    return toStateDisplayPath(resultPath) ?? toDisplayPath(resultPath, workDir)
  const taskPath = taskArchivePath?.trim()
  if (taskPath)
    return toStateDisplayPath(taskPath) ?? toDisplayPath(taskPath, workDir)
  return undefined
}

export const buildResultPromptPayload = (
  result: TaskResult,
  cancel?: TaskCancelMeta,
  taskArchivePath?: string,
  workDir?: string,
): Record<string, unknown> => {
  const archivePath = pickArchivePath(
    result.archivePath,
    taskArchivePath,
    workDir,
  )
  const handoff = toHandoffPayload(result.handoff)
  return {
    status: result.status,
    ...(result.taskStatus ? { task_status: result.taskStatus } : {}),
    ok: result.ok,
    completed_at: result.completedAt,
    duration_ms: result.durationMs,
    ...(result.outcome ? { outcome: result.outcome } : {}),
    ...(result.stopReason ? { stop_reason: result.stopReason } : {}),
    output: truncateText(result.output, TASK_OUTPUT_MAX_CHARS, {
      normalizeWhitespace: true,
    }),
    ...(result.status === 'canceled' && cancel
      ? { cancel: toCancelMeta(cancel) }
      : {}),
    ...(archivePath ? { archive_path: archivePath } : {}),
    ...(handoff ? { handoff } : {}),
    ...(result.evidence ? { evidence: result.evidence } : {}),
    usage: normalizePromptUsage(result.usage),
  }
}
