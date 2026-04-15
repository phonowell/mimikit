import { z } from 'zod'

import { normalizeStrictOutputSchema } from '../../foundation/shared/strict-output-schema.js'
import { canonicalizeTaskDraft } from '../../foundation/shared/task-draft-canonicalize.js'

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
  const normalized = {
    reply: parsed.reply,
    actions: parsed.actions.map((action) => {
      if (action.type === 'enqueue_task') {
        return {
          ...action,
          task: canonicalizeTaskDraft(action.task),
        }
      }
      if (action.type === 'set_plan') {
        return {
          ...action,
          plan: {
            ...action.plan,
            task: canonicalizeTaskDraft(action.plan.task),
          },
        }
      }
      return action
    }),
  }
  const strictParsed = managerTurnSchema.parse(normalized)
  return {
    reply: strictParsed.reply,
    actions: strictParsed.actions,
  }
}
