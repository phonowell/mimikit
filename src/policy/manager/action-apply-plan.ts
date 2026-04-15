import { newId, nowIso } from '../../foundation/shared/utils.js'
import { persistRuntimeState } from '../../kernel/orchestrator/runtime-persistence.js'
import { notifyUiSignal } from '../../kernel/orchestrator/signals.js'
import {
  appendRuntimePlan,
  findRuntimePlan,
  updateRuntimePlan,
} from '../../work/orchestrator/plan-state-write.js'

import { resolveActionFocusId } from './action-focus-id.js'
import { buildPlanEnqueueTaskEffect } from './action-plan-effect-enqueue.js'
import {
  appendPlanSystemMessage,
  normalizePlanKey,
} from './action-plan-helpers.js'

import type { ManagerTurnAction as Parsed } from './manager-turn-schema.js'
import type { TaskPlan } from '../../foundation/types/index.js'
import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

type SetPlanAction = Extract<Parsed, { type: 'set_plan' }>

const buildTrigger = (trigger: SetPlanAction['plan']['trigger']) => {
  if (trigger.type === 'cron') {
    return {
      mode: 'cron' as const,
      cron: trigger.cron,
      timeZone: trigger.time_zone,
    }
  }
  if (trigger.type === 'scheduled_at') {
    return {
      mode: 'scheduled_at' as const,
      scheduledAt: trigger.scheduled_at,
    }
  }
  return { mode: 'on_worker_slot_freed' as const }
}

export const applySetPlan = async (
  runtime: ManagerRuntime,
  item: Parsed,
): Promise<void> => {
  if (item.type !== 'set_plan') return

  const focusId = resolveActionFocusId(runtime)
  const trigger = buildTrigger(item.plan.trigger)
  const effect = await buildPlanEnqueueTaskEffect({
    stateDir: runtime.config.workDir,
    task: item.plan.task,
    focusId,
  })
  const nextKey = normalizePlanKey({
    title: item.plan.title,
    focusId,
    trigger,
    effect,
  })
  const updatedAt = nowIso()

  if (item.plan_id === null) {
    const exists = runtime.domain.taskPlans.some(
      (plan) =>
        plan.status !== 'done' &&
        normalizePlanKey({
          title: plan.title,
          focusId: plan.focusId,
          trigger: plan.trigger,
          effect: plan.effect,
        }) === nextKey,
    )
    if (exists) return

    const createdAt = updatedAt
    const plan: TaskPlan = {
      id: `plan-${newId()}`,
      title: item.plan.title,
      focusId,
      priority: item.plan.priority,
      status: 'active',
      trigger,
      effect,
      createdAt,
      updatedAt,
      ...(item.plan.max_runs !== null ? { maxRuns: item.plan.max_runs } : {}),
      runtime: {
        runCount: 0,
      },
    }
    appendRuntimePlan({ runtime, plan })
    await persistRuntimeState(runtime)
    await appendPlanSystemMessage(runtime, 'plan_created', plan)
    notifyUiSignal(runtime, 'plans')
    return
  }

  const index = runtime.domain.taskPlans.findIndex(
    (plan) => plan.id === item.plan_id,
  )
  if (index < 0) return
  const current = findRuntimePlan(runtime, item.plan_id)
  if (!current || current.status === 'done') return

  const collides = runtime.domain.taskPlans.some(
    (plan) =>
      plan.id !== current.id &&
      plan.status !== 'done' &&
      normalizePlanKey({
        title: plan.title,
        focusId: plan.focusId,
        trigger: plan.trigger,
        effect: plan.effect,
      }) === nextKey,
  )
  if (collides) return

  const next: TaskPlan = {
    ...current,
    title: item.plan.title,
    focusId,
    priority: item.plan.priority,
    trigger,
    effect,
    updatedAt,
    ...(item.plan.max_runs !== null ? { maxRuns: item.plan.max_runs } : {}),
  }
  if (item.plan.max_runs === null) delete next.maxRuns
  updateRuntimePlan({
    runtime,
    planId: item.plan_id,
    update: () => next,
  })
  await persistRuntimeState(runtime)
  await appendPlanSystemMessage(runtime, 'plan_updated', next)
  notifyUiSignal(runtime, 'plans')
}

export const applyDeletePlan = async (
  runtime: ManagerRuntime,
  item: Parsed,
): Promise<void> => {
  if (item.type !== 'delete_plan') return

  const index = runtime.domain.taskPlans.findIndex(
    (plan) => plan.id === item.plan_id,
  )
  if (index < 0) return

  const current = findRuntimePlan(runtime, item.plan_id)
  if (!current) return
  const deletedAt = nowIso()
  const next =
    current.status === 'done'
      ? current
      : {
          ...current,
          status: 'done' as const,
          updatedAt: deletedAt,
          runtime: {
            ...current.runtime,
            closedAt: deletedAt,
            doneReason: 'canceled' as const,
          },
        }
  updateRuntimePlan({
    runtime,
    planId: item.plan_id,
    update: () => next,
  })

  await persistRuntimeState(runtime)
  await appendPlanSystemMessage(runtime, 'plan_deleted', next)
  notifyUiSignal(runtime, 'plans')
}
