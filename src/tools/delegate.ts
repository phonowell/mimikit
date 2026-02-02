import { newId } from '../ids.js'
import { writeItem } from '../storage/queue.js'
import { writeTrigger } from '../storage/triggers.js'
import { nowIso } from '../time.js'
import { TASK_SCHEMA_VERSION, TRIGGER_SCHEMA_VERSION } from '../types/schema.js'
import { summaryFromCandidates } from '../tasks/summary.js'

import type { ToolContext } from './context.js'
import type { Condition, Task, Trigger } from '../types/tasks.js'

export type DelegateArgs = {
  prompt: string
  type?: 'oneshot' | 'conditional'
  condition?: Condition
  priority?: number
  timeout?: number | null
  traceId?: string
}

export const delegate = async (ctx: ToolContext, args: DelegateArgs) => {
  const priority = args.priority ?? 5
  const createdAt = nowIso()
  const trace = args.traceId ? { traceId: args.traceId } : {}
  const summary = summaryFromCandidates([args.prompt])

  if (ctx.role === 'teller') {
    const id = newId()
    const task: Task = {
      schemaVersion: TASK_SCHEMA_VERSION,
      id,
      type: 'oneshot',
      prompt: args.prompt,
      ...(summary ? { summary } : {}),
      priority,
      createdAt,
      attempts: 0,
      timeout: args.timeout ?? null,
      ...trace,
    }
    await writeItem(ctx.paths.plannerQueue, id, task)
    return { taskId: id }
  }

  if (args.type === 'conditional') {
    if (!args.condition) throw new Error('condition required')
    const id = newId()
    const trigger: Trigger = {
      schemaVersion: TRIGGER_SCHEMA_VERSION,
      id,
      type: 'conditional',
      prompt: args.prompt,
      priority,
      createdAt,
      timeout: args.timeout ?? null,
      condition: args.condition,
      cooldown: 0,
      state: { initialized: false },
      ...trace,
    }
    await writeTrigger(ctx.paths.triggers, trigger)
    return { triggerId: id }
  }

  const id = newId()
  const task: Task = {
    schemaVersion: TASK_SCHEMA_VERSION,
    id,
    type: 'oneshot',
    prompt: args.prompt,
    ...(summary ? { summary } : {}),
    priority,
    createdAt,
    attempts: 0,
    timeout: args.timeout ?? null,
    ...trace,
  }
  await writeItem(ctx.paths.workerQueue, id, task)
  return { taskId: id }
}
