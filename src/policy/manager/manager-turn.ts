import { z } from 'zod'

import {
  type ManagerTurnAction,
  managerTurnSchema,
} from './manager-turn-schema.js'

export const buildManagerTurnOutputSchema = (): Record<string, unknown> => {
  const schema: Record<string, unknown> = {
    type: 'json_schema',
    name: 'manager_turn',
    strict: true,
    schema: z.toJSONSchema(managerTurnSchema),
  }
  return schema
}

export const parseManagerTurn = (
  value: unknown,
): { reply: string; actions: ManagerTurnAction[] } => {
  const parsed = managerTurnSchema.parse(value)
  return {
    reply: parsed.reply,
    actions: parsed.actions,
  }
}
