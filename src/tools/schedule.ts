import { newId } from '../ids.js'
import { writeTrigger } from '../storage/triggers.js'
import { nowIso } from '../time.js'

import type { ToolContext } from './context.js'
import type { Condition, Trigger } from '../types/tasks.js'

export type ScheduleArgs = {
  prompt: string
  type: 'recurring' | 'scheduled' | 'conditional'
  interval?: number
  runAt?: string
  condition?: Condition
  cooldown?: number
  timeout?: number | null
  traceId?: string
}

export const schedule = async (ctx: ToolContext, args: ScheduleArgs) => {
  const id = newId()
  const createdAt = nowIso()
  const trace = args.traceId ? { traceId: args.traceId } : {}
  const trigger: Trigger = {
    id,
    type: args.type,
    prompt: args.prompt,
    priority: 5,
    createdAt,
    timeout: args.timeout ?? null,
    cooldown: args.cooldown ?? 0,
    state: { initialized: false },
    ...trace,
  }
  if (args.type === 'recurring') {
    if (!args.interval) throw new Error('interval required')
    trigger.schedule = {
      interval: args.interval,
      lastRunAt: null,
      nextRunAt: null,
    }
  }
  if (args.type === 'scheduled') {
    if (!args.runAt) throw new Error('runAt required')
    trigger.schedule = { runAt: args.runAt }
  }
  if (args.type === 'conditional') {
    if (!args.condition) throw new Error('condition required')
    trigger.condition = args.condition
  }
  await writeTrigger(ctx.paths.triggers, trigger)
  return { triggerId: id }
}
