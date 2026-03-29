import { z } from 'zod'

import { normalizeStrictOutputSchema } from '../../foundation/shared/strict-output-schema.js'

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

export const buildWorkerTurnOutputSchema = (): Record<string, unknown> => ({
  type: 'json_schema',
  name: 'worker_turn',
  strict: true,
  schema: normalizeStrictOutputSchema(z.toJSONSchema(workerTurnSchema)),
})

export const parseWorkerTurn = (value: unknown): WorkerTurn =>
  workerTurnSchema.parse(stripNullFields(value))
