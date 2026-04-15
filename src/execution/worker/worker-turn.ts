import { z } from 'zod'

import { normalizeStrictOutputSchema } from '../../foundation/shared/strict-output-schema.js'

import {
  workerTaskHandoffSchema,
  type StructuredTaskHandoff,
} from './task-handoff-protocol.js'
import { type WorkerTurn, workerTurnSchema } from './worker-turn-schema.js'

const stripNullFields = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripNullFields)
  if (!value || typeof value !== 'object') return value

  const normalized: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    if (child === null) continue
    normalized[key] = stripNullFields(child)
  }
  return normalized
}

const stripUndefinedFields = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map((item) => stripUndefinedFields(item))
  if (!value || typeof value !== 'object') return value

  const normalized: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    if (child === undefined) continue
    normalized[key] = stripUndefinedFields(child)
  }
  return normalized
}

const normalizeWorkerHandoff = (value: unknown): StructuredTaskHandoff | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const handoff = value as Record<string, unknown>
  const sanitized = {
    summary: handoff.summary,
    decisions: handoff.decisions,
    next_steps: handoff.next_steps,
    risks: handoff.risks,
    artifacts: Array.isArray(handoff.artifacts)
      ? handoff.artifacts.map((item) => {
          if (!item || typeof item !== 'object') return item
          const artifact = item as Record<string, unknown>
          return {
            path: artifact.path,
            kind: artifact.kind,
            note: artifact.note,
          }
        })
      : handoff.artifacts,
    evidence: Array.isArray(handoff.evidence)
      ? handoff.evidence.map((item) => {
          if (!item || typeof item !== 'object') return item
          const evidence = item as Record<string, unknown>
          return {
            type: evidence.type,
            ref: evidence.ref,
            note: evidence.note,
          }
        })
      : handoff.evidence,
  }
  const parsed = workerTaskHandoffSchema.safeParse(sanitized)
  return parsed.success
    ? (stripUndefinedFields(parsed.data) as StructuredTaskHandoff)
    : undefined
}

const normalizeWorkerTurnValue = (value: unknown): unknown => {
  if (!value || typeof value !== 'object') return value
  const turn = value as Record<string, unknown>
  const handoff = normalizeWorkerHandoff(turn.handoff)
  return {
    reply: turn.reply,
    ...(handoff ? { handoff } : {}),
  }
}

export const buildWorkerTurnOutputSchema = (): Record<string, unknown> => ({
  type: 'json_schema',
  name: 'worker_turn',
  strict: true,
  schema: normalizeStrictOutputSchema(z.toJSONSchema(workerTurnSchema)),
})

export const parseWorkerTurn = (value: unknown): WorkerTurn =>
  workerTurnSchema.parse(normalizeWorkerTurnValue(stripNullFields(value)))
