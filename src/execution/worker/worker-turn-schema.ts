import { z } from 'zod'

import { workerTaskHandoffSchema } from './task-handoff-protocol.js'

export const workerTurnSchema = z.strictObject({
  reply: z.string(),
  handoff: workerTaskHandoffSchema.optional(),
})

export type WorkerTurn = z.infer<typeof workerTurnSchema>
