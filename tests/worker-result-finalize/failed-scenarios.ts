import { expect, test } from 'vitest'

import { finalizeResult } from '../../src/execution/worker/result-finalize.js'
import { readTaskResultArchive } from '../../src/persistence/storage/task-results.js'
import { createTestRuntimeState } from '../helpers/runtime-state.js'
import { readTaskProgressForTest } from '../helpers/task-progress.js'
import { markTaskFailed } from '../../src/work/orchestrator/task-lifecycle.js'

import { createTmpDir, readWorkerEndLog } from './testkit.js'

import type { Task, TaskResult } from '../../src/foundation/types/index.js'

test('finalizeResult writes failed task state and archive for failed result', async () => {
  const stateDir = await createTmpDir()
  const task: Task = {
    id: 'task-failed',
    fingerprint: 'task-failed',
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
    status: 'failed',
    ok: false,
    output: 'validation failed after resumed run',
    durationMs: 33,
    completedAt: '2026-02-26T10:00:34.000Z',
    handoff: {
      summary: 'Task failed during final validation.',
      nextSteps: ['Inspect failing validation and retry once fixed.'],
    },
  }

  await finalizeResult(runtime, task, result, markTaskFailed)

  expect(task.status).toBe('failed')
  expect(task.completedAt).toBe(result.completedAt)
  expect(task.pausedAt).toBeUndefined()

  await expect
    .poll(() => readWorkerEndLog(runtime, task.id), { timeout: 1_000 })
    .toMatchObject({
      status: 'failed',
      taskStatus: 'failed',
      outcome: 'blocked',
      stopReason: 'failed',
    })

  const progress = await readTaskProgressForTest(stateDir, task.id)
  expect(progress[0]?.payload).toMatchObject({
    status: 'failed',
    taskStatus: 'failed',
    outcome: 'blocked',
    stopReason: 'failed',
  })

  const archived = await readTaskResultArchive(result.archivePath ?? '')
  expect(archived).toMatchObject({
    status: 'failed',
    taskStatus: 'failed',
    outcome: 'blocked',
    stopReason: 'failed',
  })
  expect(archived?.evidence).toMatchObject({
    contractGoal: 'Ship long task',
    stateDelta: {
      taskStatusTo: 'failed',
    },
  })
  expect(result.evidence?.stateDelta.taskStatusTo).toBe('failed')
})
