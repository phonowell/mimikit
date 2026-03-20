import { expect, test } from 'vitest'

import { applyTaskActions } from '../src/manager/action-apply.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

import type { RuntimeState } from '../src/orchestrator/core/runtime-state.js'

const CONTRACT_ATTRS = {
  goal: 'Deliver requested outcome',
  in_scope: 'Single runnable worker task',
  done_when_1: 'Return concrete output',
}
const TASK_CWD = '/tmp/manager-action-apply-task'

const createRuntime = async (): Promise<RuntimeState> => {
  const runtime = await createTestRuntimeState({ pausedQueue: true })
  runtime.config.codex.enabled = true
  runtime.config.opencode.enabled = false
  return runtime
}

test('enqueue_task normalizes legacy aliases before dispatch', async () => {
  const runtime = await createRuntime()

  await applyTaskActions(runtime, [
    {
      name: 'enqueue_task',
      attrs: {
        title: 'legacy aliases',
        cwd: TASK_CWD,
        goal: CONTRACT_ATTRS.goal,
        scope: CONTRACT_ATTRS.in_scope,
        acceptance_1: CONTRACT_ATTRS.done_when_1,
      },
    },
  ])

  expect(runtime.tasks).toHaveLength(1)
  expect(runtime.tasks[0]?.prompt).toContain(`目标：${CONTRACT_ATTRS.goal}`)
  expect(runtime.tasks[0]?.contract).toEqual({
    goal: CONTRACT_ATTRS.goal,
    scope: CONTRACT_ATTRS.in_scope,
    acceptance: [CONTRACT_ATTRS.done_when_1],
  })
})
