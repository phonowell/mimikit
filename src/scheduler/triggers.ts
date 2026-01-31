import {
  listTriggers,
  removeTrigger,
  writeTrigger,
} from '../storage/triggers.js'
import { taskFromTrigger } from '../tasks/from-trigger.js'
import { nowIso } from '../time.js'

import { evaluateCondition } from './conditions.js'

import type { EvalContext } from './conditions.js'
import type { Task, Trigger } from '../types/tasks.js'

const shouldRunRecurring = (trigger: Trigger, now: Date): boolean => {
  if (!trigger.schedule || !('interval' in trigger.schedule)) return false
  const next = trigger.schedule.nextRunAt
  if (!next) return false
  return Date.parse(next) <= now.getTime()
}

const updateRecurring = (trigger: Trigger, now: string): Trigger => {
  if (!trigger.schedule || !('interval' in trigger.schedule)) return trigger
  const { interval } = trigger.schedule
  return {
    ...trigger,
    schedule: {
      interval,
      lastRunAt: now,
      nextRunAt: new Date(Date.parse(now) + interval * 1000).toISOString(),
    },
  }
}

const shouldRunScheduled = (trigger: Trigger, now: Date): boolean => {
  if (!trigger.schedule || !('runAt' in trigger.schedule)) return false
  return Date.parse(trigger.schedule.runAt) <= now.getTime()
}

const cooldownActive = (trigger: Trigger, now: Date): boolean => {
  const last = trigger.state?.lastTriggeredAt
  if (!last || !trigger.cooldown) return false
  const next = Date.parse(last) + trigger.cooldown * 1000
  return next > now.getTime()
}

export const processTriggers = async (
  ctx: EvalContext,
  triggersDir: string,
): Promise<Task[]> => {
  const now = new Date()
  const nowText = nowIso()
  const tasks: Task[] = []
  const triggers = await listTriggers(triggersDir)

  for (const trigger of triggers) {
    let current = trigger
    let updated = trigger
    if (
      current.type === 'recurring' &&
      current.schedule &&
      'interval' in current.schedule
    ) {
      if (
        current.schedule.nextRunAt === null ||
        current.schedule.nextRunAt === undefined
      ) {
        const base = current.schedule.lastRunAt ?? current.createdAt
        const nextRunAt = new Date(
          Date.parse(base) + current.schedule.interval * 1000,
        ).toISOString()
        current = {
          ...current,
          schedule: { ...current.schedule, nextRunAt },
        }
        updated = current
        await writeTrigger(triggersDir, updated)
      }
    }
    if (current.type === 'recurring' && cooldownActive(current, now)) continue

    if (current.type === 'recurring' && shouldRunRecurring(current, now)) {
      updated = updateRecurring(current, nowText)
      tasks.push(taskFromTrigger({ trigger: current }))
      updated.state = { ...(updated.state ?? {}), lastTriggeredAt: nowText }
      await writeTrigger(triggersDir, updated)
      continue
    }

    if (current.type === 'scheduled' && shouldRunScheduled(current, now)) {
      tasks.push(taskFromTrigger({ trigger: current }))
      await removeTrigger(triggersDir, current.id)
      continue
    }

    if (current.type === 'conditional' && current.condition) {
      if (cooldownActive(current, now)) continue
      const baseState = current.state ?? { initialized: false }
      const outcome = await evaluateCondition(ctx, current.condition, baseState)
      let updatedState = outcome.state
      updated = { ...current, state: updatedState }
      if (outcome.status === 'true') {
        tasks.push(taskFromTrigger({ trigger: current }))
        updatedState = { ...updatedState, lastTriggeredAt: nowText }
      }
      if (outcome.status === 'llm_eval' && outcome.prompt) {
        const lastEval = updatedState.lastEvalAt
        if (!current.cooldown || !lastEval) {
          tasks.push(
            taskFromTrigger({ trigger: current, prompt: outcome.prompt }),
          )
          updatedState = { ...updatedState, lastEvalAt: nowText }
        } else {
          const next = Date.parse(lastEval) + current.cooldown * 1000
          if (next <= now.getTime()) {
            tasks.push(
              taskFromTrigger({ trigger: current, prompt: outcome.prompt }),
            )
            updatedState = { ...updatedState, lastEvalAt: nowText }
          }
        }
      }
      updated = { ...updated, state: updatedState }
      await writeTrigger(triggersDir, updated)
    }
  }

  return tasks
}
