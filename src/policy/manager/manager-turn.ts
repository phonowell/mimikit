import { z } from 'zod'

import { normalizeStrictOutputSchema } from '../../foundation/shared/strict-output-schema.js'

import { normalizeManagerTurnInput } from './manager-turn-normalize.js'
import {
  type ManagerTurnAction,
  managerTurnParseSchema,
  managerTurnSchema,
} from './manager-turn-schema.js'

export const buildManagerTurnOutputSchema = (): Record<string, unknown> => {
  const schema: Record<string, unknown> = {
    type: 'json_schema',
    name: 'manager_turn',
    strict: true,
    schema: normalizeStrictOutputSchema(z.toJSONSchema(managerTurnSchema)),
  }
  return schema
}

export const parseManagerTurn = (
  value: unknown,
): {
  reply: string
  actions: ManagerTurnAction[]
} => {
  const parsed = managerTurnParseSchema.parse(normalizeManagerTurnInput(value))
  const strictParsed = managerTurnSchema.parse(parsed)
  return {
    reply: strictParsed.reply,
    actions: strictParsed.actions,
  }
}
