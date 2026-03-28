import { expect, test } from 'vitest'

import { readHistory } from '../src/persistence/history/store.js'
import { applyTaskActions } from '../src/policy/manager/action-apply.js'

import { createTestRuntimeState } from './helpers/runtime-state.js'

import type { RuntimeState } from '../src/kernel/orchestrator/runtime-state.js'
import type { ManagerPlanDraft } from '../src/policy/manager/manager-turn-schema.js'

const buildTaskDraft = (title: string, cwd: string) => ({
  title,
  cwd,
  mode: 'write' as const,
  goal: `Deliver ${title}`,
  in_scope: [`Only handle ${title}`],
  out_of_scope: [],
  done_when: [`${title} finished`],
  context_refs: [],
  instructions: [],
})

const createRuntime = async (): Promise<RuntimeState> => {
  const runtime = await createTestRuntimeState({ pausedQueue: true })
  runtime.config.codex.enabled = true
  return runtime
}

test('set_plan rejects sibling collision for active plan key', async () => {
  const runtime = await createRuntime()
  const existingPlan: ManagerPlanDraft = {
    title: 'scheduled',
    trigger: {
      type: 'cron',
      cron: '0 0 9 * * *',
      time_zone: 'Asia/Shanghai',
    },
    task: buildTaskDraft('scheduled task', '/tmp/scheduled-task'),
    priority: 'normal',
    max_runs: 5,
  }
  const targetPlan: ManagerPlanDraft = {
    title: 'follow up',
    trigger: {
      type: 'scheduled_at',
      scheduled_at: '2026-02-14T00:00:00.000Z',
    },
    task: buildTaskDraft('follow task', '/tmp/follow-task'),
    priority: 'high',
    max_runs: null,
  }

  await applyTaskActions(runtime, [
    {
      type: 'set_plan',
      plan_id: null,
      plan: existingPlan,
    },
    {
      type: 'set_plan',
      plan_id: null,
      plan: targetPlan,
    },
  ])

  const targetId = runtime.taskPlans[1]?.id
  expect(targetId).toBeTruthy()

  await applyTaskActions(runtime, [
    {
      type: 'set_plan',
      plan_id: targetId ?? null,
      plan: existingPlan,
    },
  ])

  expect(runtime.taskPlans).toHaveLength(2)
  expect(runtime.taskPlans[1]).toMatchObject({
    id: targetId,
    title: 'follow up',
    trigger: {
      mode: 'scheduled_at',
      scheduledAt: '2026-02-14T00:00:00.000Z',
    },
  })

  const history = await readHistory(runtime.paths.history)
  const planUpdatedEvents = history.filter(
    (item) => item.role === 'system' && item.systemEventName === 'plan_updated',
  )
  expect(planUpdatedEvents).toHaveLength(0)
})

test('set_plan skips duplicate active plan even when execution spec ids differ', async () => {
  const runtime = await createRuntime()
  const duplicatePlan: ManagerPlanDraft = {
    title: 'scheduled',
    trigger: {
      type: 'cron',
      cron: '0 0 9 * * *',
      time_zone: 'Asia/Shanghai',
    },
    task: buildTaskDraft('scheduled task', '/tmp/scheduled-task'),
    priority: 'normal',
    max_runs: 5,
  }

  await applyTaskActions(runtime, [
    {
      type: 'set_plan',
      plan_id: null,
      plan: duplicatePlan,
    },
  ])

  const firstSpecId =
    runtime.taskPlans[0]?.effect.kind === 'enqueue_task'
      ? runtime.taskPlans[0].effect.taskTemplate.executionSpecId
      : null

  await applyTaskActions(runtime, [
    {
      type: 'set_plan',
      plan_id: null,
      plan: duplicatePlan,
    },
  ])

  expect(runtime.taskPlans).toHaveLength(1)
  expect(runtime.taskPlans[0]?.effect.kind).toBe('enqueue_task')
  if (runtime.taskPlans[0]?.effect.kind !== 'enqueue_task')
    throw new Error('expected enqueue effect')
  expect(runtime.taskPlans[0].effect.taskTemplate.executionSpecId).toBe(
    firstSpecId,
  )
})
