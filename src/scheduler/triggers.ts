import {
  listTriggers,
  removeTrigger,
  writeTrigger,
} from '../storage/triggers.js'
import { taskFromTrigger } from '../tasks/from-trigger.js'
import { nowIso } from '../time.js'

import { evaluateCondition } from './conditions.js'

import type { EvalContext } from './conditions.js'
import type { Task, Trigger, TriggerState } from '../types/tasks.js'

type ProcessOutcome = { tasks: Task[]; nextWakeAtMs: number | null }

const parseIso = (value?: string | null): number | null => {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

const cooldownUntilMs = (trigger: Trigger): number | null => {
  const last = parseIso(trigger.state?.lastTriggeredAt)
  if (!last || !trigger.cooldown) return null
  return last + trigger.cooldown * 1000
}

const resolveRecurringNextRunAtMs = (
  trigger: Trigger,
  nowMs: number,
): number | null => {
  if (!trigger.schedule || !('interval' in trigger.schedule)) return null
  const next = parseIso(trigger.schedule.nextRunAt)
  if (next !== null) return next
  const base =
    parseIso(trigger.schedule.lastRunAt) ?? parseIso(trigger.createdAt)
  if (!base) return nowMs + trigger.schedule.interval * 1000
  return base + trigger.schedule.interval * 1000
}

const resolveScheduledRunAtMs = (trigger: Trigger): number | null => {
  if (!trigger.schedule || !('runAt' in trigger.schedule)) return null
  return parseIso(trigger.schedule.runAt)
}

const normalizeRunningState = (
  trigger: Trigger,
  nowMs: number,
  stuckMs: number,
): { state: TriggerState; cleared: boolean } => {
  const state = { ...(trigger.state ?? {}) }
  const runningAt = parseIso(state.runningAt)
  if (runningAt && nowMs - runningAt > stuckMs) {
    state.runningAt = null
    state.lastStatus = 'error'
    state.lastError = 'stuck'
    return { state, cleared: true }
  }
  return { state, cleared: false }
}

const computeNextWakeForTrigger = (params: {
  trigger: Trigger
  nowMs: number
  checkIntervalMs: number
  stuckMs: number
}): number | null => {
  const { trigger, nowMs, checkIntervalMs, stuckMs } = params
  const runningAt = parseIso(trigger.state?.runningAt)
  if (runningAt) return runningAt + stuckMs

  if (trigger.type === 'recurring')
    return resolveRecurringNextRunAtMs(trigger, nowMs)

  if (trigger.type === 'scheduled') return resolveScheduledRunAtMs(trigger)

  const cooldownUntil = cooldownUntilMs(trigger)
  if (cooldownUntil && cooldownUntil > nowMs) return cooldownUntil
  return nowMs + checkIntervalMs
}

const isDue = (nextRunAtMs: number | null, nowMs: number): boolean =>
  nextRunAtMs !== null && nextRunAtMs <= nowMs

const writeTriggerIfChanged = async (
  dir: string,
  original: string,
  trigger: Trigger,
): Promise<boolean> => {
  if (JSON.stringify(trigger) === original) return false
  await writeTrigger(dir, trigger)
  return true
}

export const processTriggers = async (
  ctx: EvalContext,
  triggersDir: string,
  opts?: { now?: Date; checkIntervalMs?: number; stuckMs?: number },
): Promise<ProcessOutcome> => {
  const now = opts?.now ?? new Date()
  const nowMs = now.getTime()
  const nowText = nowIso()
  const checkIntervalMs = opts?.checkIntervalMs ?? 5000
  const stuckMs = opts?.stuckMs ?? 2 * 60 * 60 * 1000
  const tasks: Task[] = []
  const triggers = await listTriggers(triggersDir)
  let nextWakeAtMs: number | null = null

  for (const trigger of triggers) {
    const original = JSON.stringify(trigger)
    let updated = { ...trigger }
    const normalized = normalizeRunningState(updated, nowMs, stuckMs)
    updated.state = normalized.state

    const runningAt = parseIso(updated.state.runningAt)
    if (runningAt) {
      const nextWake = runningAt + stuckMs
      updated.state = {
        ...updated.state,
        nextRunAt: new Date(nextWake).toISOString(),
      }
      await writeTriggerIfChanged(triggersDir, original, updated)
      nextWakeAtMs = nextWakeAtMs ? Math.min(nextWakeAtMs, nextWake) : nextWake
      continue
    }

    if (updated.type === 'recurring') {
      const nextRunAtMs = resolveRecurringNextRunAtMs(updated, nowMs)
      let resolvedNext: number | null = nextRunAtMs
      if (nextRunAtMs !== null && isDue(nextRunAtMs, nowMs)) {
        if (updated.schedule && 'interval' in updated.schedule) {
          const next = nowMs + updated.schedule.interval * 1000
          updated.schedule = {
            ...updated.schedule,
            lastRunAt: nowText,
            nextRunAt: new Date(next).toISOString(),
          }
          resolvedNext = next
        }
        tasks.push(taskFromTrigger({ trigger: updated }))
        updated.state = {
          ...(updated.state ?? {}),
          lastTriggeredAt: nowText,
          runningAt: nowText,
        }
      } else if (
        nextRunAtMs !== null &&
        updated.schedule &&
        'interval' in updated.schedule &&
        !updated.schedule.nextRunAt
      ) {
        updated.schedule = {
          ...updated.schedule,
          nextRunAt: new Date(nextRunAtMs).toISOString(),
        }
      }
      if (resolvedNext !== null) {
        updated.state = {
          ...(updated.state ?? {}),
          nextRunAt: new Date(resolvedNext).toISOString(),
        }
        nextWakeAtMs = nextWakeAtMs
          ? Math.min(nextWakeAtMs, resolvedNext)
          : resolvedNext
      }
      await writeTriggerIfChanged(triggersDir, original, updated)
      continue
    }

    if (updated.type === 'scheduled') {
      const runAtMs = resolveScheduledRunAtMs(updated)
      if (runAtMs !== null && isDue(runAtMs, nowMs)) {
        tasks.push(taskFromTrigger({ trigger: updated }))
        await removeTrigger(triggersDir, updated.id)
        continue
      }
      if (runAtMs !== null) {
        updated.state = {
          ...(updated.state ?? {}),
          nextRunAt: new Date(runAtMs).toISOString(),
        }
        await writeTriggerIfChanged(triggersDir, original, updated)
        nextWakeAtMs = nextWakeAtMs ? Math.min(nextWakeAtMs, runAtMs) : runAtMs
        continue
      }
      await writeTriggerIfChanged(triggersDir, original, updated)
      continue
    }

    if (!updated.condition) {
      await writeTriggerIfChanged(triggersDir, original, updated)
      continue
    }
    const cooldownUntil = cooldownUntilMs(updated)
    if (cooldownUntil && cooldownUntil > nowMs) {
      updated.state = {
        ...(updated.state ?? {}),
        nextRunAt: new Date(cooldownUntil).toISOString(),
      }
      await writeTriggerIfChanged(triggersDir, original, updated)
      nextWakeAtMs = nextWakeAtMs
        ? Math.min(nextWakeAtMs, cooldownUntil)
        : cooldownUntil
      continue
    }

    const baseState = updated.state ?? { initialized: false }
    const outcome = await evaluateCondition(ctx, updated.condition, baseState)
    let updatedState = outcome.state
    if (outcome.status === 'true') {
      tasks.push(taskFromTrigger({ trigger: updated }))
      updatedState = {
        ...updatedState,
        lastTriggeredAt: nowText,
        runningAt: nowText,
      }
    }
    if (outcome.status === 'llm_eval' && outcome.prompt) {
      const lastEval = parseIso(updatedState.lastEvalAt)
      const nextAllowed =
        updated.cooldown && lastEval ? lastEval + updated.cooldown * 1000 : null
      if (!nextAllowed || nextAllowed <= nowMs) {
        tasks.push(
          taskFromTrigger({ trigger: updated, prompt: outcome.prompt }),
        )
        updatedState = {
          ...updatedState,
          lastEvalAt: nowText,
          runningAt: nowText,
        }
      }
    }
    const nextTrigger = { ...updated, state: updatedState }
    const nextWake = computeNextWakeForTrigger({
      trigger: nextTrigger,
      nowMs,
      checkIntervalMs,
      stuckMs,
    })
    if (nextWake) {
      updatedState = {
        ...updatedState,
        nextRunAt: new Date(nextWake).toISOString(),
      }
      nextWakeAtMs = nextWakeAtMs ? Math.min(nextWakeAtMs, nextWake) : nextWake
    }
    updated = { ...updated, state: updatedState }
    await writeTriggerIfChanged(triggersDir, original, updated)
  }

  return { tasks, nextWakeAtMs }
}
