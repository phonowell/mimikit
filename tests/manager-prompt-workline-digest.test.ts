import { expect, test } from 'vitest'

import { buildStatePacketPayload } from '../src/policy/prompts/manager-prompt-packet-content.js'

import {
  createPlanFixture,
  createTaskFixture,
  GLOBAL_FOCUS_ID,
} from './helpers/runtime-snapshot.js'

test('manager state packet renders task digests without execution contract details', () => {
  const task = createTaskFixture({
    id: 'task-digest-1',
    title: 'Digest task',
    focusId: GLOBAL_FOCUS_ID,
    status: 'running',
    startedAt: '2026-04-16T03:11:06.000Z',
    cwd: '/tmp/worktree',
    branch: 'task/digest',
    contract: {
      goal: 'remove drift',
      scope: 'edit prompts',
      acceptance: ['tests pass'],
      contextRefs: ['input-1'],
    },
    result: {
      taskId: 'task-digest-1',
      status: 'succeeded',
      ok: true,
      output: 'done',
      durationMs: 10,
      completedAt: '2026-04-16T03:12:06.000Z',
      stopReason: 'completed',
    },
  })

  const payload = buildStatePacketPayload({
    selectedSections: {
      environment: '',
      focus_list: '',
      working_focuses: '',
      project_profile: '',
      remembered_memory: '',
      memory: '',
      tasks: 'tasks',
      plans: '',
      inputs: '',
      batch_results: '',
      recent_history: '',
      action_feedback: '',
    },
    focusPayload: {
      focusList: [],
      workingFocuses: [],
    },
    tasks: [task],
    workDir: '/tmp',
    plans: [],
    workingFocusIds: [GLOBAL_FOCUS_ID],
  })

  const parsed = JSON.parse(payload.payload) as {
    tasks: { tasks: Array<Record<string, unknown>> }
  }
  const entry = parsed.tasks.tasks[0]

  expect(entry).toMatchObject({
    id: 'task-digest-1',
    title: 'Digest task',
    status: 'running',
    focus_id: GLOBAL_FOCUS_ID,
    latest_result_anchor: false,
    workline_match: true,
    stop_reason: 'completed',
  })
  expect(entry).not.toHaveProperty('contract')
  expect(entry).not.toHaveProperty('cwd')
  expect(entry).not.toHaveProperty('branch')
  expect(entry).not.toHaveProperty('git')
  expect(payload.selection.tasks).toEqual({ selected: 1, full: 0, card: 1 })
})

test('manager state packet renders plan digests without trigger or effect expansion', () => {
  const plan = createPlanFixture({
    id: 'plan-digest-1',
    title: 'Digest plan',
    focusId: GLOBAL_FOCUS_ID,
    runtime: {
      runCount: 2,
      lastTaskId: 'task-plan-1',
      stage: {
        summary: 'await review',
        needsDecision: true,
        sourceTaskId: 'task-plan-1',
        updatedAt: '2026-04-16T03:20:00.000Z',
      },
    },
  })

  const payload = buildStatePacketPayload({
    selectedSections: {
      environment: '',
      focus_list: '',
      working_focuses: '',
      project_profile: '',
      remembered_memory: '',
      memory: '',
      tasks: '',
      plans: 'plans',
      inputs: '',
      batch_results: '',
      recent_history: '',
      action_feedback: '',
    },
    focusPayload: {
      focusList: [],
      workingFocuses: [],
    },
    tasks: [],
    workDir: '/tmp',
    plans: [plan],
    workingFocusIds: [GLOBAL_FOCUS_ID],
    latestResultTaskId: 'task-plan-1',
  })

  const parsed = JSON.parse(payload.payload) as {
    plans: { plans: Array<Record<string, unknown>> }
  }
  const entry = parsed.plans.plans[0]

  expect(entry).toMatchObject({
    id: 'plan-digest-1',
    title: 'Digest plan',
    status: 'active',
    priority: 'high',
    focus_id: GLOBAL_FOCUS_ID,
    last_task_id: 'task-plan-1',
    latest_result_anchor: true,
    workline_match: true,
  })
  expect(entry).toHaveProperty('stage')
  expect(entry).not.toHaveProperty('schedule_type')
  expect(entry).not.toHaveProperty('effect_kind')
  expect(payload.selection.plans).toEqual({ selected: 1, full: 0, card: 1 })
})
