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

const requestArchive = async (params: {
  taskId: string
  specId: string
  title: string
  progress?: Array<{ type: string; text: string }>
  liveOutput?: string
}) => {
  const workDir = await mkdtemp(join(tmpdir(), 'mimikit-archive-running-'))
  const app = fastify()
  await persistTaskExecutionSpec({
    stateDir: workDir,
    prompt: 'track worker progress',
    specId: params.specId,
  })
  const task = createRunningTask({
    id: params.taskId,
    executionSpecId: params.specId,
    title: params.title,
  })
  for (const event of params.progress ?? []) {
    await appendTaskProgress({
      stateDir: workDir,
      taskId: task.id,
      type: event.type,
      payload: { text: event.text },
    })
  }
  const orchestrator = registerRunningTask({
    task,
    ...(params.liveOutput
      ? {
          getTaskLiveOutput: (taskId: string) =>
            taskId === task.id ? params.liveOutput : undefined,
        }
      : {}),
  })
  registerApiRoutes(app, orchestrator, defaultConfig({ workDir }))
  const response = await app.inject({
    method: 'GET',
    url: `/api/tasks/${task.id}/archive`,
  })
  await app.close()
  return response
}

test('task archive route shows running live output instead of task-progress activity', async () => {
  const response = await requestArchive({
    taskId: 'task-archive-running',
    specId: 'spec-task-archive-running',
    title: 'Running Task',
    progress: [
      { type: 'worker_activity', text: workerActivityText },
      { type: 'worker_activity', text: 'tool completed: fs/read_file' },
    ],
    liveOutput: 'streaming summary: indexing task-progress',
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
})

test('task archive route does not leak worker activity when live output is unavailable', async () => {
  const response = await requestArchive({
    taskId: 'task-archive-running-no-live-output',
    specId: 'spec-task-archive-running-no-live-output',
    title: 'Running Task Without Live Output',
    progress: [{ type: 'worker_activity', text: workerActivityText }],
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
})

test('task archive route falls back to persisted live output summary when runtime live output is unavailable', async () => {
  const response = await requestArchive({
    taskId: 'task-archive-running-persisted-live-output',
    specId: 'spec-task-archive-running-persisted-live-output',
    title: 'Running Task With Persisted Live Output',
    progress: [
      { type: 'worker_activity', text: workerActivityText },
      {
        type: 'worker_live_output',
        text: 'persisted summary: indexing task-progress',
      },
    ],
  })

  expectArchiveMarkdown(response, [
    'status: running',
    '=== RESULT ===',
    'persisted summary: indexing task-progress',
  ])
  expect(response.body).not.toContain('$ rg -n "task-progress" src')
  expect(response.body).not.toContain(
    "src/persistence/storage/task-progress.ts:1:import { join } from 'node:path'",
  )
  expect(response.body).not.toContain(
    'Task is running. Final archive is not available yet.',
  )
})
