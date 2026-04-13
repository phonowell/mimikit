import { z } from 'zod'

import { normalizeStrictOutputSchema } from '../../foundation/shared/strict-output-schema.js'
import { canonicalizeTaskDraft } from '../../foundation/shared/task-draft-canonicalize.js'

import {
  type ManagerTurnAction,
  managerTurnParseSchema,
  managerTurnSchema,
} from './manager-turn-schema.js'

const stripNullFields = (value: unknown): unknown => {
  const nullablePathPatterns = [
    ['actions', '*', 'plan_id'],
    ['actions', '*', 'plan', 'max_runs'],
  ]
  const matchesNullablePath = (path: string[]): boolean =>
    nullablePathPatterns.some(
      (pattern) =>
        pattern.length === path.length &&
        pattern.every((segment, index) =>
          segment === '*'
            ? /^\d+$/.test(path[index] ?? '')
            : path[index] === segment,
        ),
    )
  const walk = (current: unknown, path: string[]): unknown => {
    if (Array.isArray(current)) {
      return current.map((entry, index) =>
        walk(entry, [...path, String(index)]),
      )
    }
    if (!current || typeof current !== 'object') return current

    const normalized: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(current)) {
      const nextPath = [...path, key]
      if (child === null && !matchesNullablePath(nextPath)) continue
      normalized[key] = walk(child, nextPath)
    }
    return normalized
  }

  return walk(value, [])
}

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
  const parsed = managerTurnParseSchema.parse(stripNullFields(value))
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
