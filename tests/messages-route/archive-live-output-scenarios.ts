import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import fastify from 'fastify'
import { expect, test } from 'vitest'

import { defaultConfig } from '../../src/bootstrap/config.js'
import { appendTaskProgress } from '../../src/persistence/storage/task-progress.js'
import { registerApiRoutes } from '../../src/surface/http/routes-api.js'
import { persistTaskExecutionSpec } from '../../src/work/spec/store.js'
import { createOrchestratorStub } from '../helpers/orchestrator-stub.js'

import { expectArchiveMarkdown } from './testkit.js'

import type { Task } from '../../src/foundation/types/index.js'

const workerActivityText =
  '$ rg -n "task-progress" src\nsrc/persistence/storage/task-progress.ts:1:import { join } from \'node:path\''

const createRunningTask = (params: {
  id: string
  executionSpecId: string
  title: string
}): Task => ({
  id: params.id,
  fingerprint: `fp-${params.id}`,
  semanticKey: `sk-${params.id}`,
  executionSpecId: params.executionSpecId,
  title: params.title,
  cwd: '/tmp/archive-running',
  focusId: 'focus-global',
  profile: 'worker',
  provider: 'codex',
  status: 'running',
  createdAt: '2026-02-10T00:00:00.000Z',
  startedAt: '2026-02-10T00:00:01.000Z',
  usage: { input: 12, output: 8, total: 20 },
})

const registerRunningTask = (params: {
  task: Task
  getTaskLiveOutput?: (taskId: string) => string | undefined
}) => {
  const { orchestrator } = createOrchestratorStub()
  ;(
    orchestrator as unknown as {
      getTaskById: (taskId: string) => Task | undefined
      getTaskLiveOutput: (taskId: string) => string | undefined
    }
  ).getTaskById = (taskId) =>
    taskId === params.task.id ? params.task : undefined
  if (params.getTaskLiveOutput) {
    ;(
      orchestrator as unknown as {
        getTaskLiveOutput: (taskId: string) => string | undefined
      }
    ).getTaskLiveOutput = params.getTaskLiveOutput
  }
  return orchestrator
}

test('task archive route shows running live output instead of task-progress activity', async () => {
  const workDir = await mkdtemp(join(tmpdir(), 'mimikit-archive-running-'))
  const app = fastify()
  await persistTaskExecutionSpec({
    stateDir: workDir,
    prompt: 'track worker progress',
    specId: 'spec-task-archive-running',
  })
  const task = createRunningTask({
    id: 'task-archive-running',
    executionSpecId: 'spec-task-archive-running',
    title: 'Running Task',
  })
  await appendTaskProgress({
    stateDir: workDir,
    taskId: task.id,
    type: 'worker_activity',
    payload: { text: workerActivityText },
  })
  await appendTaskProgress({
    stateDir: workDir,
    taskId: task.id,
    type: 'worker_activity',
    payload: { text: 'tool completed: fs/read_file' },
  })
  const orchestrator = registerRunningTask({
    task,
    getTaskLiveOutput: (taskId) =>
      taskId === task.id
        ? 'streaming summary: indexing task-progress'
        : undefined,
  })
  registerApiRoutes(app, orchestrator, defaultConfig({ workDir }))

  const response = await app.inject({
    method: 'GET',
    url: `/api/tasks/${task.id}/archive`,
  })

  expectArchiveMarkdown(response, [
    'status: running',
    '=== RESULT ===',
    'streaming summary: indexing task-progress',
  ])
  expect(response.body).not.toContain('$ rg -n "task-progress" src')
  expect(response.body).not.toContain(
    "src/persistence/storage/task-progress.ts:1:import { join } from 'node:path'",
  )
  expect(response.body).not.toContain('tool completed: fs/read_file')
  expect(response.body).not.toContain(
    'Task is running. Final archive is not available yet.',
  )

  await app.close()
})

test('task archive route does not leak worker activity when live output is unavailable', async () => {
  const workDir = await mkdtemp(join(tmpdir(), 'mimikit-archive-running-'))
  const app = fastify()
  await persistTaskExecutionSpec({
    stateDir: workDir,
    prompt: 'track worker progress',
    specId: 'spec-task-archive-running-no-live-output',
  })
  const task = createRunningTask({
    id: 'task-archive-running-no-live-output',
    executionSpecId: 'spec-task-archive-running-no-live-output',
    title: 'Running Task Without Live Output',
  })
  await appendTaskProgress({
    stateDir: workDir,
    taskId: task.id,
    type: 'worker_activity',
    payload: { text: workerActivityText },
  })
  const orchestrator = registerRunningTask({ task })
  registerApiRoutes(app, orchestrator, defaultConfig({ workDir }))

  const response = await app.inject({
    method: 'GET',
    url: `/api/tasks/${task.id}/archive`,
  })

  expectArchiveMarkdown(response, [
    'status: running',
    '=== RESULT ===',
    'Task is running. Final archive is not available yet.',
  ])
  expect(response.body).not.toContain('$ rg -n "task-progress" src')
  expect(response.body).not.toContain(
    "src/persistence/storage/task-progress.ts:1:import { join } from 'node:path'",
  )

  await app.close()
})
