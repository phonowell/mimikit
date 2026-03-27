import { z } from 'zod'

import { type WorkerTurn, workerTurnSchema } from './worker-turn-schema.js'

export const buildWorkerTurnOutputSchema = (): Record<string, unknown> => ({
  type: 'json_schema',
  name: 'worker_turn',
  strict: true,
  schema: z.toJSONSchema(workerTurnSchema),
})

export const parseWorkerTurn = (value: unknown): WorkerTurn =>
  workerTurnSchema.parse(value)
