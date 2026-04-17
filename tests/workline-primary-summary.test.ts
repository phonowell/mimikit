import { expect, test } from 'vitest'

import { resolvePrimaryWorkline } from '../src/policy/manager/workline-primary-summary.js'

import type {
  Task,
  TaskPlan,
  UserInput,
} from '../src/foundation/types/index.js'

const now = '2026-04-16T08:30:00.000Z'

const buildTask = (id: string, focusId: string): Task => ({
  id,
  fingerprint: `fp-${id}`,
  semanticKey: `sk-${id}`,
  executionSpecId: `spec-${id}`,
  title: id,
  cwd: '/tmp/mimikit',
  resourceMode: 'read',
  focusId,
  profile: 'worker',
  provider: 'codex',
  status: 'pending',
  createdAt: now,
})

const buildPlan = (id: string, focusId: string): TaskPlan => ({
  id,
  title: id,
  focusId,
  priority: 'normal',
  status: 'active',
  trigger: { mode: 'on_worker_slot_freed' },
  effect: {
    kind: 'enqueue_task',
    taskKey: `task-key-${id}`,
    taskTemplate: {
      title: `task-${id}`,
      executionSpecId: `exec-${id}`,
      cwd: '/tmp/mimikit',
      resourceMode: 'read',
      useWorktree: false,
    },
  },
  createdAt: now,
  updatedAt: now,
  runtime: { runCount: 0 },
})

test('resolvePrimaryWorkline prefers quoted provenance from latest user input', () => {
  const inputs: UserInput[] = [
    {
      id: 'input-latest',
      role: 'user',
      text: '我是在修正刚才那条规则，不是操作当前活跃任务。',
      createdAt: '2026-04-16T08:31:00.000Z',
      focusId: 'focus-main',
      source: 'webui',
      platform: 'webui',
      quote: 'agent-1',
      sourceInputIds: ['input-origin'],
      sourceTaskIds: ['task-quoted'],
      sourcePlanIds: ['plan-quoted'],
    },
  ]

  const primary = resolvePrimaryWorkline({
    workingFocusIds: ['focus-main'],
    inputs,
    results: [],
    tasks: [
      buildTask('task-quoted', 'focus-main'),
      buildTask('task-live', 'focus-main'),
    ],
    plans: [buildPlan('plan-quoted', 'focus-main')],
  })

  expect(primary).toEqual({
    focusId: 'focus-main',
    source: 'quoted_message',
    sourceInputId: 'input-origin',
    sourceTaskId: 'task-quoted',
    sourcePlanId: 'plan-quoted',
  })
})

test('resolvePrimaryWorkline falls back to plain user_input when latest input has no provenance', () => {
  const inputs: UserInput[] = [
    {
      id: 'input-latest',
      role: 'user',
      text: '继续吧',
      createdAt: '2026-04-16T08:31:00.000Z',
      focusId: 'focus-main',
      source: 'webui',
      platform: 'webui',
    },
  ]

  const primary = resolvePrimaryWorkline({
    workingFocusIds: ['focus-main'],
    inputs,
    results: [],
    tasks: [buildTask('task-live', 'focus-main')],
    plans: [buildPlan('plan-live', 'focus-main')],
  })

  expect(primary).toEqual({
    focusId: 'focus-main',
    source: 'user_input',
    sourceInputId: 'input-latest',
  })
})
