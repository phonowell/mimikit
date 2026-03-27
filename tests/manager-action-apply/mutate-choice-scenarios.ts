import { expect, test } from 'vitest'

import { applyTaskActions } from '../../src/policy/manager/action-apply.js'
import { GLOBAL_FOCUS_ID } from '../../src/work/focus/constants.js'
import { materializeTaskFixture } from '../helpers/execution-spec.js'

import { createRuntime, TASK_CWD } from './testkit.js'

test('task_control pause marks pending task as paused', async () => {
  const runtime = await createRuntime()
  runtime.tasks.push(
    await materializeTaskFixture({
      stateDir: runtime.config.workDir,
      task: {
        id: 'task-pause-target',
        prompt: 'pause prompt',
        title: 'pause title',
        cwd: TASK_CWD,
        focusId: GLOBAL_FOCUS_ID,
        profile: 'worker',
        provider: 'codex',
        status: 'pending',
        createdAt: '2026-02-13T00:00:00.000Z',
      },
    }),
  )

  await applyTaskActions(runtime, [
    {
      type: 'task_control',
      task_id: 'task-pause-target',
      action: 'pause',
      instructions: [],
    },
  ])

  expect(runtime.tasks[0]?.status).toBe('paused')
  expect(runtime.tasks[0]?.pausedAt).toBeTypeOf('string')
})

test('task_control resume requeues paused task', async () => {
  const runtime = await createRuntime()
  runtime.tasks.push(
    await materializeTaskFixture({
      stateDir: runtime.config.workDir,
      task: {
        id: 'task-resume-target',
        prompt: 'resume prompt',
        title: 'resume title',
        cwd: TASK_CWD,
        focusId: GLOBAL_FOCUS_ID,
        profile: 'worker',
        provider: 'codex',
        status: 'paused',
        createdAt: '2026-02-13T00:00:00.000Z',
        pausedAt: '2026-02-13T00:10:00.000Z',
      },
    }),
  )

  await applyTaskActions(runtime, [
    {
      type: 'task_control',
      task_id: 'task-resume-target',
      action: 'resume',
      instructions: ['继续执行并产出最终结果'],
    },
  ])

  expect(runtime.tasks[0]?.status).toBe('pending')
  expect(runtime.tasks[0]?.pausedAt).toBeUndefined()
  expect(runtime.worker.queue.size).toBe(1)
})

test('task_control cancel marks paused task as canceled', async () => {
  const runtime = await createRuntime()
  runtime.tasks.push(
    await materializeTaskFixture({
      stateDir: runtime.config.workDir,
      task: {
        id: 'task-cancel-target',
        prompt: 'cancel prompt',
        title: 'cancel title',
        cwd: TASK_CWD,
        focusId: GLOBAL_FOCUS_ID,
        profile: 'worker',
        provider: 'codex',
        status: 'paused',
        createdAt: '2026-02-13T00:00:00.000Z',
        pausedAt: '2026-02-13T00:10:00.000Z',
      },
    }),
  )

  await applyTaskActions(runtime, [
    {
      type: 'task_control',
      task_id: 'task-cancel-target',
      action: 'cancel',
      instructions: [],
    },
  ])

  expect(runtime.tasks[0]?.status).toBe('canceled')
  expect(runtime.tasks[0]?.completedAt).toBeTypeOf('string')
})
