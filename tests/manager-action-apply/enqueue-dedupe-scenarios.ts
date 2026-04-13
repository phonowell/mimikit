import { realpath } from 'node:fs/promises'

import { expect, test } from 'vitest'

import { readHistory } from '../../src/persistence/history/store.js'
import { applyTaskActions } from '../../src/policy/manager/action-apply.js'
import { resolveWorkerPromptFromDraft } from '../../src/policy/manager/task-contract.js'
import { readTaskExecutionSpec } from '../../src/work/spec/store.js'
import { materializeTaskFixture } from '../helpers/execution-spec.js'

import { buildTaskDraft, createRuntime, TASK_CWD } from './testkit.js'

const defaultPrompt = resolveWorkerPromptFromDraft(buildTaskDraft())
if (!defaultPrompt) throw new Error('expected default task prompt')

test('enqueue_task re-enqueues pending task when fingerprint matches exactly', async () => {
  const runtime = await createRuntime()
  const draft = buildTaskDraft()
  const taskCwd = await realpath(TASK_CWD)
  runtime.domain.tasks.push(
    await materializeTaskFixture({
      stateDir: runtime.config.workDir,
      task: {
        id: 'task-pending',
        prompt: defaultPrompt,
        title: draft.title,
        cwd: taskCwd,
        resourceMode: draft.mode,
        contract: {
          goal: draft.goal,
          scope: draft.in_scope.join('；'),
          acceptance: draft.done_when,
        },
        focusId: 'focus-inbox',
        profile: 'worker',
        provider: 'codex',
        status: 'pending',
        createdAt: '2026-02-13T00:00:00.000Z',
      },
    }),
  )

  await applyTaskActions(runtime, [
    {
      type: 'enqueue_task',
      task: draft,
    },
  ])

  expect(runtime.domain.tasks).toHaveLength(1)
  expect(runtime.domain.tasks[0]?.id).toBe('task-pending')
  expect(runtime.domain.tasks[0]?.focusId).toBe('focus-inbox')
  expect(runtime.process.worker.queue.size).toBe(1)
})

test('enqueue_task task_created system event includes worker slot status payload', async () => {
  const runtime = await createRuntime()
  runtime.config.worker.maxConcurrent = 3

  await applyTaskActions(runtime, [
    {
      type: 'enqueue_task',
      task: buildTaskDraft({
        title: 'release-note',
        instructions: ['generate release note'],
      }),
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
  runtime.domain.tasks.push(
    await materializeTaskFixture({
      stateDir: runtime.config.workDir,
      task: {
        id: 'task-pending',
        prompt: defaultPrompt,
        title: 'old title',
        cwd: TASK_CWD,
        resourceMode: 'write',
        focusId: 'focus-inbox',
        profile: 'worker',
        provider: 'codex',
        status: 'pending',
        createdAt: '2026-02-13T00:00:00.000Z',
      },
    }),
  )

  await applyTaskActions(runtime, [
    {
      type: 'enqueue_task',
      task: buildTaskDraft({
        title: 'new title',
      }),
    },
  ])

  expect(runtime.domain.tasks).toHaveLength(2)
  expect(runtime.domain.tasks[1]?.title).toBe('new title')
  expect(runtime.domain.tasks[1]?.fingerprint).not.toBe(
    runtime.domain.tasks[0]?.fingerprint,
  )
})

test('enqueue_task contract change does not reuse pending task', async () => {
  const runtime = await createRuntime()
  runtime.domain.tasks.push(
    await materializeTaskFixture({
      stateDir: runtime.config.workDir,
      task: {
        id: 'task-contract-old',
        prompt: 'old prompt',
        title: 'manager action task',
        cwd: TASK_CWD,
        resourceMode: 'write',
        contract: {
          goal: 'Old goal',
          scope: 'Old scope',
          acceptance: ['Old acceptance'],
        },
        focusId: 'focus-inbox',
        profile: 'worker',
        provider: 'codex',
        status: 'pending',
        createdAt: '2026-02-13T00:00:00.000Z',
      },
    }),
  )

  await applyTaskActions(runtime, [
    {
      type: 'enqueue_task',
      task: buildTaskDraft({
        goal: 'New goal',
        in_scope: ['New scope'],
        done_when: ['New acceptance'],
      }),
    },
  ])

  expect(runtime.domain.tasks).toHaveLength(2)
  expect(runtime.domain.tasks[0]?.status).toBe('pending')
  expect(runtime.domain.tasks[0]?.cancel).toBeUndefined()
  expect(runtime.domain.tasks[1]?.status).toBe('pending')
  const spec = await readTaskExecutionSpec(
    runtime.config.workDir,
    runtime.domain.tasks[1]?.executionSpecId ?? '',
  )
  expect(spec.contract?.goal).toBe('New goal')
})
