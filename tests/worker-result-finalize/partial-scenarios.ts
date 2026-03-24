import { expect, test } from 'vitest'

import { finalizeResult } from '../../src/execution/worker/result-finalize.js'
import { markTaskPaused } from '../../src/work/orchestrator/task-lifecycle.js'
import { readTaskResultArchive } from '../../src/persistence/storage/task-results.js'
import { createTestRuntimeState } from '../helpers/runtime-state.js'
import { readTaskProgressForTest } from '../helpers/task-progress.js'

import { createTmpDir, readWorkerEndLog } from './testkit.js'

import type { Task, TaskResult } from '../../src/foundation/types/index.js'

test('finalizeResult keeps paused task state for partial budget result', async () => {
  const stateDir = await createTmpDir()
  const task: Task = {
    id: 'task-partial',
    fingerprint: 'task-partial',
    prompt: 'continue long task',
    title: 'Continue Long Task',
    focusId: 'focus-local',
    profile: 'worker',
    provider: 'codex',
    status: 'running',
    createdAt: '2026-02-26T10:00:00.000Z',
    startedAt: '2026-02-26T10:00:01.000Z',
    contract: {
      goal: 'Ship long task',
      scope: 'Main task body',
      acceptance: ['Finish the remaining work'],
    },
  }
  const runtime = await createTestRuntimeState({
    workDir: stateDir,
    withGlobalFocus: false,
    patch: {
      tasks: [task],
      focuses: [
        {
          id: 'focus-local',
          title: 'Local',
          status: 'active',
          createdAt: '2026-02-26T10:00:00.000Z',
          updatedAt: '2026-02-26T10:00:00.000Z',
          lastActivityAt: '2026-02-26T10:00:00.000Z',
        },
      ],
    },
  })
  const result: TaskResult = {
    taskId: task.id,
    status: 'partial',
    taskStatus: 'paused',
    outcome: 'partial',
    stopReason: 'budget_exhausted',
    ok: false,
    output: 'partial draft',
    durationMs: 33,
    completedAt: '2026-02-26T10:00:34.000Z',
    handoff: {
      summary: 'Task paused after hitting the run budget.',
      nextSteps: ['Resume the task after reviewing the partial draft.'],
    },
  }

  await finalizeResult(runtime, task, result, markTaskPaused, {
    taskPatch: {
      pausedAt: result.completedAt,
    },
    persistCompletionFields: false,
  })

  expect(task.status).toBe('paused')
  expect(task.completedAt).toBeUndefined()
  expect(task.pausedAt).toBe(result.completedAt)

  await expect
    .poll(() => readWorkerEndLog(runtime, task.id), { timeout: 1_000 })
    .toMatchObject({
      status: 'partial',
      taskStatus: 'paused',
      outcome: 'partial',
      stopReason: 'budget_exhausted',
    })

  const progress = await readTaskProgressForTest(stateDir, task.id)
  expect(progress[0]?.payload).toMatchObject({
    status: 'partial',
    taskStatus: 'paused',
    outcome: 'partial',
    stopReason: 'budget_exhausted',
  })

  const archived = await readTaskResultArchive(result.archivePath ?? '')
  expect(archived).toMatchObject({
    status: 'partial',
    taskStatus: 'paused',
    outcome: 'partial',
    stopReason: 'budget_exhausted',
  })
  expect(archived?.evidence).toMatchObject({
    contractGoal: 'Ship long task',
    stateDelta: {
      taskStatusTo: 'paused',
    },
  })
  expect(result.evidence?.stateDelta.taskStatusTo).toBe('paused')
})
