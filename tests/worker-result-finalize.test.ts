import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { buildPaths } from '../src/fs/paths.js'
import type { RuntimeState } from '../src/orchestrator/core/runtime-state.js'
import { readTaskResultArchive } from '../src/storage/task-results.js'
import type { Task, TaskResult } from '../src/types/index.js'
import { finalizeResult } from '../src/worker/result-finalize.js'
import { markTaskPaused } from '../src/orchestrator/core/task-lifecycle.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'
import { readTaskProgressForTest } from './helpers/task-progress.js'
import { readJsonl } from '../src/storage/jsonl.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-finalize-result-'))

const mergeTaskPatch = (
  tasks: Task[],
  taskId: string,
  patch?: Partial<Task>,
): void => {
  if (!patch) return
  const task = tasks.find((item) => item.id === taskId)
  if (!task) return
  Object.assign(task, patch)
}

const readWorkerEndLog = async (
  runtime: RuntimeState,
  taskId: string,
): Promise<Record<string, unknown> | undefined> => {
  const logs = await readJsonl<Record<string, unknown>>(runtime.paths.log, {
    ensureFile: true,
  })
  return logs.find((item) => item.event === 'worker_end' && item.taskId === taskId)
}

test('finalizeResult appends worker_end progress for canceled task', async () => {
  const stateDir = await createTmpDir()
  const task: Task = {
    id: 'task-1',
    fingerprint: 'task-1',
    prompt: 'cancel me',
    title: 'Cancel Me',
    focusId: 'focus-local',
    profile: 'worker',
    provider: 'opencode',
    status: 'running',
    createdAt: '2026-02-26T10:00:00.000Z',
    startedAt: '2026-02-26T10:00:01.000Z',
    cancel: { source: 'deferred' },
    contract: {
      goal: 'Cancel task safely',
      scope: 'Cancel flow',
      acceptance: ['Task is marked canceled'],
    },
  }
  const runtime = await createTestRuntimeState({
    workDir: stateDir,
    patch: {
      tasks: [task],
      focuses: [
        {
          id: 'focus-global',
          title: 'Global',
          status: 'active',
          createdAt: '2026-02-26T10:00:00.000Z',
          updatedAt: '2026-02-26T10:00:00.000Z',
          lastActivityAt: '2026-02-26T10:00:00.000Z',
        },
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
    status: 'canceled',
    ok: false,
    output: 'Task canceled',
    durationMs: 12,
    completedAt: '2026-02-26T10:00:13.000Z',
    cancel: { source: 'deferred' },
  }

  await finalizeResult(runtime, task, result, mergeTaskPatch)

  await expect
    .poll(() => readWorkerEndLog(runtime, task.id), { timeout: 1_000 })
    .toMatchObject({ usageCaptured: false })

  const progress = await readTaskProgressForTest(stateDir, task.id)
  expect(progress).toHaveLength(1)
  expect(progress[0]?.type).toBe('worker_end')
  expect(progress[0]?.payload).toMatchObject({
    status: 'canceled',
    durationMs: 12,
    cancel: { source: 'deferred' },
  })
  expect(result.handoff?.summary).toContain('Task canceled')
  expect(result.evidence?.contractGoal).toBe('Cancel task safely')
  expect(result.evidence?.stateDelta.taskStatusTo).toBe('canceled')
  expect(result.evidence?.acceptanceChecks[0]?.criterion).toBe(
    'Task is marked canceled',
  )
  expect(result.handoff?.evidence?.[0]).toMatchObject({
    type: 'task_archive',
  })
  expect(result.handoff?.artifacts?.[0]).toMatchObject({
    kind: 'task_archive',
  })
  const archived = await readTaskResultArchive(result.archivePath ?? '')
  expect(archived?.provider).toBe('opencode')
  expect(archived?.handoff?.evidence?.[0]).toMatchObject({
    type: 'task_archive',
  })
  expect(archived?.evidence).toMatchObject({
    contractGoal: 'Cancel task safely',
    stateDelta: {
      taskStatusTo: 'canceled',
    },
  })
  expect(runtime.focusContexts).toHaveLength(1)
  expect(runtime.focusContexts[0]).toMatchObject({
    focusId: 'focus-local',
  })
  expect(runtime.focusContexts[0]?.summary).toContain('Cancel Me')
  expect(runtime.focusContexts[0]?.openItems?.[0]).toContain('Resume')

  const succeeded: TaskResult = {
    taskId: task.id,
    status: 'succeeded',
    ok: true,
    output: 'Done without checklist',
    durationMs: 20,
    completedAt: '2026-02-26T10:00:33.000Z',
  }
  await finalizeResult(runtime, task, succeeded, mergeTaskPatch)
  expect(runtime.focusContexts[0]?.openItems?.[0]).toContain('Resume')
})

test('finalizeResult marks usageCaptured=true for canceled result with usage', async () => {
  const stateDir = await createTmpDir()
  const task: Task = {
    id: 'task-usage',
    fingerprint: 'task-usage',
    prompt: 'cancel with usage',
    title: 'Cancel With Usage',
    focusId: 'focus-local',
    profile: 'worker',
    provider: 'codex',
    status: 'running',
    createdAt: '2026-02-26T10:00:00.000Z',
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
    status: 'canceled',
    ok: false,
    output: 'Task canceled',
    durationMs: 10,
    completedAt: '2026-02-26T10:00:10.000Z',
    cancel: { source: 'system' },
    usage: { input: 12, output: 3, total: 15 },
  }

  await finalizeResult(runtime, task, result, mergeTaskPatch)

  await expect
    .poll(() => readWorkerEndLog(runtime, task.id), { timeout: 1_000 })
    .toMatchObject({ usageCaptured: true })
})

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
  expect(runtime.focusContexts[0]?.openItems?.[0]).toContain('Resume')
})
