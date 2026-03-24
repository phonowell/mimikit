import { expect, test } from 'vitest'

import { persistRuntimeState } from '../../src/kernel/orchestrator/runtime-persistence.js'
import { loadRuntimeSnapshot } from '../../src/persistence/storage/runtime-snapshot.js'
import { requestTaskResumeChoice } from '../../src/work/orchestrator/task-resume-choice.js'
import {
  resolvePendingUserChoiceTimeout,
  selectPendingUserChoiceFromUser,
} from '../../src/work/orchestrator/user-choice.js'

import { createQueueAdd, createRuntime, createTask } from './testkit.js'

import type { RuntimeState } from '../../src/kernel/orchestrator/runtime-state.js'

test('selectPendingUserChoiceFromUser persists resolved choice removal immediately', async () => {
  const queueAdd = createQueueAdd()
  const runtime = await createRuntime({
    queue: {
      add: queueAdd as RuntimeState['worker']['queue']['add'],
      sizeBy: () => 0,
    },
  })
  const task = createTask('task-budget-persist-selection', {
    status: 'paused',
    pausedAt: '2026-03-06T00:00:03.000Z',
    result: {
      taskId: 'task-budget-persist-selection',
      status: 'partial',
      taskStatus: 'paused',
      outcome: 'partial',
      stopReason: 'budget_exhausted',
      ok: false,
      output: 'partial',
      durationMs: 12,
      completedAt: '2026-03-06T00:00:04.000Z',
    },
  })
  runtime.tasks = [task]

  await requestTaskResumeChoice({
    runtime,
    task,
  })
  await persistRuntimeState(runtime)

  const choice = runtime.ui.pendingUserChoices[0]
  if (!choice?.effect || choice.effect.type !== 'resume_task')
    throw new Error('expected resume_task choice')

  await selectPendingUserChoiceFromUser(runtime, choice.id, choice.effect.optionId)

  const snapshot = await loadRuntimeSnapshot(runtime.config.workDir)
  expect(snapshot.pendingUserChoices).toBeUndefined()
})

test('pending resume choice persists without timeout until a user selects it', async () => {
  const runtime = await createRuntime()
  const task = createTask('task-budget-persist', {
    status: 'paused',
    pausedAt: '2026-03-06T00:00:03.000Z',
    result: {
      taskId: 'task-budget-persist',
      status: 'partial',
      taskStatus: 'paused',
      outcome: 'partial',
      stopReason: 'budget_exhausted',
      ok: false,
      output: 'partial',
      durationMs: 12,
      completedAt: '2026-03-06T00:00:04.000Z',
    },
  })
  runtime.tasks = [task]

  const requested = await requestTaskResumeChoice({
    runtime,
    task,
    createdAt: '2026-03-06T00:00:04.000Z',
  })

  expect(requested).toBe(true)
  expect(
    await resolvePendingUserChoiceTimeout(
      runtime,
      Date.parse('2026-03-07T00:00:04.000Z'),
    ),
  ).toBe(false)
  expect(runtime.ui.pendingUserChoices[0]?.id).toBe(
    'choice-task-resume-task-budget-persist',
  )
})
