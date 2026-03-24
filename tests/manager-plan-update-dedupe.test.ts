import { expect, test } from 'vitest'

import { GLOBAL_FOCUS_ID } from '../src/work/focus/constants.js'
import { readHistory } from '../src/persistence/history/store.js'
import { applyTaskActions } from '../src/policy/manager/action-apply.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

import type { RuntimeState } from '../src/kernel/orchestrator/runtime-state.js'

const createRuntime = async (): Promise<RuntimeState> => {
  const runtime = await createTestRuntimeState({ pausedQueue: true })
  runtime.config.codex.enabled = true
  return runtime
}

test('update_plan rejects sibling collision for active plan key', async () => {
  const runtime = await createRuntime()
  runtime.taskPlans.push(
    {
      id: 'plan-existing',
      title: 'scheduled',
      focusId: GLOBAL_FOCUS_ID,
      priority: 'normal',
      status: 'active',
      trigger: {
        mode: 'cron',
        cron: '0 0 9 * * *',
        timeZone: 'Asia/Shanghai',
      },
      effect: {
        kind: 'wake_manager',
        reason: 'scheduled_review',
      },
      createdAt: '2026-02-13T00:00:00.000Z',
      updatedAt: '2026-02-13T00:00:00.000Z',
      runtime: { runCount: 0 },
    },
    {
      id: 'plan-update-target',
      title: 'follow up',
      focusId: GLOBAL_FOCUS_ID,
      priority: 'high',
      status: 'active',
      trigger: {
        mode: 'scheduled_at',
        scheduledAt: '2026-02-14T00:00:00.000Z',
      },
      effect: {
        kind: 'wake_manager',
        reason: 'follow_up',
      },
      createdAt: '2026-02-13T00:00:00.000Z',
      updatedAt: '2026-02-13T00:00:00.000Z',
      runtime: { runCount: 0 },
    },
  )

  await applyTaskActions(runtime, [
    {
      name: 'update_plan',
      attrs: {
        id: 'plan-update-target',
        title: 'scheduled',
        schedule_type: 'cron',
        cron_expr: '0 0 9 * * *',
        time_zone: 'Asia/Shanghai',
        effect_kind: 'wake_manager',
        effect_reason: 'scheduled_review',
      },
    },
  ])

  expect(runtime.taskPlans).toHaveLength(2)
  expect(runtime.taskPlans[1]).toMatchObject({
    id: 'plan-update-target',
    title: 'follow up',
    trigger: {
      mode: 'scheduled_at',
      scheduledAt: '2026-02-14T00:00:00.000Z',
    },
    effect: {
      kind: 'wake_manager',
      reason: 'follow_up',
    },
  })

  const history = await readHistory(runtime.paths.history)
  const planUpdatedEvents = history.filter(
    (item) => item.role === 'system' && item.systemEventName === 'plan_updated',
  )
  expect(planUpdatedEvents).toHaveLength(0)
})
