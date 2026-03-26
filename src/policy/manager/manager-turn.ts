import { z } from 'zod'

import {
  type ManagerTurnAction,
  managerTurnSchema,
} from './manager-turn-schema.js'

import type { Parsed } from '../actions/model/spec.js'

const addIf = (
  attrs: Record<string, string>,
  key: string,
  value: string | number | null,
): void => {
  if (value === null) return
  attrs[key] = String(value)
}

const addIndexed = (
  attrs: Record<string, string>,
  prefix: string,
  values: string[],
): void => {
  values.forEach((value, index) => {
    attrs[`${prefix}_${index + 1}`] = value
  })
}

const toParsedAction = (action: ManagerTurnAction): Parsed => {
  const attrs: Record<string, string> = {}
  for (const [key, value] of Object.entries(action)) {
    if (key === 'type') continue
    if (key === 'done_when') addIndexed(attrs, 'done_when', value as string[])
    else if (key === 'context_refs')
      addIndexed(attrs, 'context_ref', value as string[])
    else if (key === 'task_done_when')
      addIndexed(attrs, 'task_done_when', value as string[])
    else if (key === 'task_context_refs')
      addIndexed(attrs, 'task_context_ref', value as string[])
    else if (key === 'options') {
      ;(value as Array<{ id: string; label: string; reason: string }>).forEach(
        (option, index) => {
          attrs[`option_${index + 1}_id`] = option.id
          attrs[`option_${index + 1}_label`] = option.label
          attrs[`option_${index + 1}_reason`] = option.reason
        },
      )
    } else if (key === 'open_items')
      addIndexed(attrs, 'open_item', value as string[])
    else addIf(attrs, key, value as string | number | null)
  }
  return { name: action.type, attrs }
}

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
): { replyText: string; actions: Parsed[] } => {
  const parsed = managerTurnSchema.parse(value)
  return {
    replyText: parsed.reply_text,
    actions: parsed.actions.map(toParsedAction),
  }
}
