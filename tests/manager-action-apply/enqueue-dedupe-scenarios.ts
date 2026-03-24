import { expect, test } from 'vitest'

import { GLOBAL_FOCUS_ID } from '../../src/work/focus/constants.js'
import { readHistory } from '../../src/persistence/history/store.js'
import { applyTaskActions } from '../../src/policy/manager/action-apply.js'

import { CONTRACT_ATTRS, createRuntime, TASK_CWD } from './testkit.js'

test('enqueue_task re-enqueues pending task when fingerprint matches exactly', async () => {
  const runtime = await createRuntime()
  runtime.focuses.push({
    id: 'focus-local',
    title: 'Local',
    status: 'active',
    createdAt: '2026-02-13T00:00:00.000Z',
    updatedAt: '2026-02-13T00:00:00.000Z',
    lastActivityAt: '2026-02-13T00:00:01.000Z',
  })
  runtime.tasks.push({
    id: 'task-pending',
    fingerprint: 'same prompt',
    prompt: 'same prompt',
    title: 'old title',
    cwd: TASK_CWD,
    contract: {
      goal: CONTRACT_ATTRS.goal,
      scope: CONTRACT_ATTRS.in_scope,
      acceptance: [CONTRACT_ATTRS.done_when_1],
    },
    focusId: 'focus-local',
    profile: 'worker',
    provider: 'codex',
    status: 'pending',
    createdAt: '2026-02-13T00:00:00.000Z',
  })

  await applyTaskActions(runtime, [
    {
      name: 'enqueue_task',
      attrs: {
        worker_prompt: 'same prompt',
        title: 'old title',
        cwd: TASK_CWD,
        ...CONTRACT_ATTRS,
      },
    },
  ])

  expect(runtime.tasks).toHaveLength(1)
  expect(runtime.tasks[0]?.id).toBe('task-pending')
  expect(runtime.tasks[0]?.focusId).toBe('focus-local')
  expect(runtime.worker.queue.size).toBe(1)
})

test('enqueue_task task_created system event includes worker slot status payload', async () => {
  const runtime = await createRuntime()
  runtime.config.worker.maxConcurrent = 3

  await applyTaskActions(runtime, [
    {
      name: 'enqueue_task',
      attrs: {
        worker_prompt: 'generate release note',
        title: 'release-note',
        cwd: TASK_CWD,
        ...CONTRACT_ATTRS,
      },
    },
  ])

  const history = await readHistory(runtime.paths.history)
  const createdEvent = history.find(
    (item) => item.role === 'system' && item.systemEventName === 'task_created',
  )
  expect(createdEvent).toBeTruthy()
  expect(createdEvent?.systemEventPayload?.slots).toEqual({
    max_slots: 3,
    occupied_slots: 0,
    available_slots: 3,
  })
})

test('enqueue_task dedupe does not block task creation when fingerprint differs', async () => {
  const runtime = await createRuntime()
  runtime.tasks.push({
    id: 'task-pending',
    fingerprint: 'same prompt',
    prompt: 'same prompt',
    title: 'old title',
    cwd: TASK_CWD,
    focusId: GLOBAL_FOCUS_ID,
    profile: 'worker',
    provider: 'codex',
    status: 'pending',
    createdAt: '2026-02-13T00:00:00.000Z',
  })

  await applyTaskActions(runtime, [
    {
      name: 'enqueue_task',
      attrs: {
        worker_prompt: 'same prompt',
        title: 'new title',
        cwd: TASK_CWD,
        ...CONTRACT_ATTRS,
      },
    },
  ])

  expect(runtime.tasks).toHaveLength(2)
  expect(runtime.tasks[1]?.title).toBe('new title')
  expect(runtime.tasks[1]?.fingerprint).not.toBe(runtime.tasks[0]?.fingerprint)
})

test('enqueue_task contract change does not reuse pending task', async () => {
  const runtime = await createRuntime()
  runtime.tasks.push({
    id: 'task-contract-old',
    fingerprint: 'same prompt',
    prompt: 'same prompt',
    title: 'same title',
    cwd: TASK_CWD,
    contract: {
      goal: 'Old goal',
      scope: 'Old scope',
      acceptance: ['Old acceptance'],
    },
    focusId: GLOBAL_FOCUS_ID,
    profile: 'worker',
    provider: 'codex',
    status: 'pending',
    createdAt: '2026-02-13T00:00:00.000Z',
  })

  await applyTaskActions(runtime, [
    {
      name: 'enqueue_task',
      attrs: {
        worker_prompt: 'same prompt',
        title: 'same title',
        cwd: TASK_CWD,
        goal: 'New goal',
        in_scope: 'New scope',
        done_when_1: 'New acceptance',
      },
    },
  ])

  expect(runtime.tasks).toHaveLength(2)
  expect(runtime.tasks[0]?.status).toBe('pending')
  expect(runtime.tasks[0]?.cancel).toBeUndefined()
  expect(runtime.tasks[1]?.status).toBe('pending')
  expect(runtime.tasks[1]?.contract?.goal).toBe('New goal')
})
