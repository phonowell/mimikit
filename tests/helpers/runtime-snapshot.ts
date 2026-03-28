import {
  buildTaskFingerprint,
  buildTaskSemanticKey,
} from '../../src/work/orchestrator/task-state.js'

import type { Task, TaskPlan } from '../../src/foundation/types/index.js'

export const GLOBAL_FOCUS_ID = 'focus-global'
export const SNAPSHOT_BASE_TIME = '2026-02-06T00:00:00.000Z'

export const createTaskFixture = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  fingerprint: buildTaskFingerprint({
    prompt: 'check',
    title: 'Check',
    cwd: '/tmp/runtime-snapshot-task',
    resourceMode: 'write',
    profile: 'worker',
    provider: 'codex',
    focusId: GLOBAL_FOCUS_ID,
  }),
  semanticKey: buildTaskSemanticKey({
    prompt: 'check',
    title: 'Check',
    cwd: '/tmp/runtime-snapshot-task',
    resourceMode: 'write',
    profile: 'worker',
    provider: 'codex',
    focusId: GLOBAL_FOCUS_ID,
  }),
  executionSpecId: 'spec-task-1',
  title: 'Check',
  cwd: '/tmp/runtime-snapshot-task',
  resourceMode: 'write',
  focusId: GLOBAL_FOCUS_ID,
  profile: 'worker',
  provider: 'codex',
  status: 'pending',
  createdAt: SNAPSHOT_BASE_TIME,
  ...overrides,
})

export const createPlanFixture = (
  overrides: Partial<TaskPlan> = {},
): TaskPlan => ({
  id: 'plan-1',
  title: 'summarize',
  focusId: GLOBAL_FOCUS_ID,
  priority: 'high',
  status: 'active',
  trigger: {
    mode: 'on_worker_slot_freed',
  },
  effect: {
    kind: 'enqueue_task',
    taskKey: 'plan-task-key-1',
    taskTemplate: {
      title: 'plan task',
      executionSpecId: 'spec-plan-1',
      cwd: '/tmp/runtime-snapshot-plan-task',
      resourceMode: 'write',
    },
  },
  createdAt: SNAPSHOT_BASE_TIME,
  updatedAt: SNAPSHOT_BASE_TIME,
  runtime: {
    runCount: 0,
  },
  ...overrides,
})
