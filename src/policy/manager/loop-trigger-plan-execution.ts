import { enqueueWorkerTask } from '../../execution/worker/dispatch.js'
import { resolveSlotStatus } from '../../execution/worker/task-state-shared.js'
import { notifyWorkerLoop } from '../../kernel/orchestrator/signals.js'
import { appendTaskSystemMessage } from '../../persistence/history/task-events.js'
import { GLOBAL_FOCUS_ID } from '../../work/focus/constants.js'
import { enqueueTask } from '../../work/orchestrator/task-lifecycle.js'
import {
  buildPlanEffectPayload,
  buildPlanTriggerPayload,
} from '../../work/shared/plan-payload.js'
import { readTaskExecutionSpec } from '../../work/spec/store.js'

import { linkTriggeredPlanToTask } from './plan-progress.js'
import { resolveRunTaskTarget } from './run-task-target.js'
import { publishManagerSystemEventInput } from './system-input-event.js'

import type { TaskPlan } from '../../foundation/types/index.js'
import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

const markPlanDone = (
  plan: TaskPlan,
  doneAt: string,
  reason: TaskPlan['runtime']['doneReason'],
): void => {
  plan.status = 'done'
  plan.updatedAt = doneAt
  plan.runtime = {
    ...plan.runtime,
    closedAt: doneAt,
    doneReason: reason,
  }
}

export const maybeMarkPlanExhausted = (
  plan: TaskPlan,
  nowIso: string,
): boolean => {
  if (plan.status !== 'active') return false
  if (plan.maxRuns === undefined) return false
  if (plan.runtime.runCount < plan.maxRuns) return false
  markPlanDone(plan, nowIso, 'exhausted')
  return true
}

export const canFireOnWorkerSlotFreed = (plan: TaskPlan): boolean => {
  if (plan.status !== 'active') return false
  if (plan.trigger.mode !== 'on_worker_slot_freed') return false
  if (plan.maxRuns !== undefined && plan.runtime.runCount >= plan.maxRuns)
    return false
  return true
}

export const firePlan = async (params: {
  runtime: ManagerRuntime
  plan: TaskPlan
  nowIso: string
  reason: 'cron' | 'scheduled_at' | 'on_worker_slot_freed'
}): Promise<{ consumedWorkerSlot: boolean }> => {
  const { runtime, plan, nowIso } = params
  const spec = await readTaskExecutionSpec(
    runtime.config.workDir,
    plan.effect.taskTemplate.executionSpecId,
  )
  const target = await resolveRunTaskTarget({
    actionName: 'set_plan',
    cwd: plan.effect.taskTemplate.cwd,
    resourceMode: plan.effect.taskTemplate.resourceMode,
    prompt: spec.prompt,
    title: plan.effect.taskTemplate.title,
    focusId: plan.focusId,
    contract: spec.contract,
    ...(plan.effect.taskTemplate.branch
      ? { branch: plan.effect.taskTemplate.branch }
      : {}),
  })
  const { task, created } = await enqueueTask(
    runtime.config.workDir,
    runtime.tasks,
    spec.prompt,
    plan.effect.taskTemplate.title,
    target.cwd,
    'worker',
    'codex',
    plan.focusId,
    target.repoKey,
    target.branch,
    target.resourceMode,
    spec.contract,
  )
  linkTriggeredPlanToTask({
    runtime,
    triggeredPlanIds: new Set([plan.id]),
    task,
    linkedAt: nowIso,
  })
  const lastTaskId = task.id
  if (created) {
    await appendTaskSystemMessage(runtime.paths.history, 'created', task, {
      createdAt: task.createdAt,
      slotStatus: resolveSlotStatus(runtime),
    })
  }
  if (task.status === 'pending') {
    enqueueWorkerTask(runtime, task)
    notifyWorkerLoop(runtime)
  }

  plan.runtime = {
    ...plan.runtime,
    runCount: plan.runtime.runCount + 1,
    lastTriggeredAt: nowIso,
    ...(lastTaskId ? { lastTaskId } : {}),
  }
  plan.updatedAt = nowIso
  if (plan.trigger.mode === 'scheduled_at')
    markPlanDone(plan, nowIso, 'completed')

  await publishManagerSystemEventInput({
    runtime,
    summary: `Task plan "${plan.title.trim() || plan.id}" was triggered.`,
    event: 'trigger_fire',
    visibility: 'all',
    payload: {
      plan_id: plan.id,
      title: plan.title,
      priority: plan.priority,
      run_count: plan.runtime.runCount,
      slots: resolveSlotStatus(runtime),
      ...(plan.maxRuns !== undefined ? { max_runs: plan.maxRuns } : {}),
      ...(lastTaskId ? { last_task_id: lastTaskId } : {}),
      triggered_at: nowIso,
      ...buildPlanTriggerPayload(plan.trigger),
      ...buildPlanEffectPayload(plan.effect),
    },
    createdAt: nowIso,
    logEvent: 'trigger_fire_input',
    logMeta: {
      planId: plan.id,
      triggerMode: plan.trigger.mode,
      triggerReason: params.reason,
      focusId: GLOBAL_FOCUS_ID,
      runCount: plan.runtime.runCount,
      ...(lastTaskId ? { lastTaskId } : {}),
    },
  })
  return { consumedWorkerSlot: created }
}

export const markTriggeredPlanDone = (plan: TaskPlan, nowIso: string): void => {
  if (plan.maxRuns !== undefined && plan.runtime.runCount >= plan.maxRuns)
    markPlanDone(plan, nowIso, 'completed')
}
