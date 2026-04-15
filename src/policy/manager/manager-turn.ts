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

const normalizeTaskDraftLike = (value: unknown): unknown => {
  if (!value || typeof value !== 'object') return value
  const draft = value as Record<string, unknown>
  return {
    title: draft.title,
    cwd: draft.cwd,
    mode: draft.mode,
    use_worktree: draft.use_worktree,
    goal: draft.goal,
    in_scope: draft.in_scope,
    out_of_scope: draft.out_of_scope,
    done_when: draft.done_when,
    context_refs: draft.context_refs,
    instructions: draft.instructions,
  }
}

const normalizePlanTrigger = (value: unknown): unknown => {
  if (!value || typeof value !== 'object') return value
  const trigger = value as Record<string, unknown>
  if (trigger.type === 'cron') {
    return {
      type: trigger.type,
      cron: trigger.cron,
      time_zone: trigger.time_zone,
    }
  }
  if (trigger.type === 'scheduled_at') {
    return {
      type: trigger.type,
      scheduled_at: trigger.scheduled_at,
    }
  }
  if (trigger.type === 'on_worker_slot_freed') {
    return {
      type: trigger.type,
    }
  }
  return trigger
}

const normalizeManagerAction = (value: unknown): unknown => {
  if (!value || typeof value !== 'object') return undefined
  const action = value as Record<string, unknown>
  const type = action.type
  if (typeof type !== 'string') return undefined

  if (type === 'enqueue_task') {
    return {
      type,
      task: normalizeTaskDraftLike(action.task),
    }
  }
  if (type === 'task_control') {
    return {
      type,
      task_id: action.task_id,
      action: action.action,
      ...(action.action === 'resume' ? { instructions: action.instructions } : {}),
    }
  }
  if (type === 'set_plan') {
    const plan =
      action.plan && typeof action.plan === 'object'
        ? (action.plan as Record<string, unknown>)
        : undefined
    return {
      type,
      plan_id: action.plan_id,
      plan: plan
        ? {
            title: plan.title,
            trigger: normalizePlanTrigger(plan.trigger),
            task: normalizeTaskDraftLike(plan.task),
            priority: plan.priority,
            max_runs: plan.max_runs,
          }
        : action.plan,
    }
  }
  if (type === 'delete_plan') {
    return {
      type,
      plan_id: action.plan_id,
    }
  }
  if (type === 'assign_focus') {
    return {
      type,
      target_type: action.target_type,
      target_id: action.target_id,
      focus_id: action.focus_id,
    }
  }
  if (type === 'remember_memory' || type === 'remember_project_profile') {
    return {
      type,
      content: action.content,
      source_input_id: action.source_input_id,
      source_quote: action.source_quote,
    }
  }
  return undefined
}

const normalizeManagerTurnValue = (value: unknown): unknown => {
  if (!value || typeof value !== 'object') return value
  const turn = value as Record<string, unknown>
  const actions = Array.isArray(turn.actions)
    ? turn.actions
        .map((action) => normalizeManagerAction(action))
        .filter((action): action is NonNullable<typeof action> => action !== undefined)
    : turn.actions
  return {
    reply: turn.reply,
    actions,
  }
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
  const parsed = managerTurnParseSchema.parse(
    normalizeManagerTurnValue(stripNullFields(value)),
  )
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
