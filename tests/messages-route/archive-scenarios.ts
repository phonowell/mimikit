import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import fastify from 'fastify'
import { expect, test } from 'vitest'

import { defaultConfig } from '../../src/bootstrap/config.js'
import { registerApiRoutes } from '../../src/surface/http/routes-api.js'
import { persistTaskExecutionSpec } from '../../src/work/spec/store.js'
import { createOrchestratorStub } from '../helpers/orchestrator-stub.js'

import { expectArchiveMarkdown } from './testkit.js'

import type { Task } from '../../src/foundation/types/index.js'

test('task archive route falls back to live snapshot when archive file is missing', async () => {
  const workDir = await mkdtemp(join(tmpdir(), 'mimikit-archive-live-'))
  const app = fastify()
  const { orchestrator } = createOrchestratorStub()
  await persistTaskExecutionSpec({
    stateDir: workDir,
    prompt: 'explain failure cause',
    specId: 'spec-task-archive-live-2',
  })
  const task: Task = {
    id: 'task-archive-live-2',
    fingerprint: 'fp-live-2',
    semanticKey: 'sk-task-archive-live-2',
    executionSpecId: 'spec-task-archive-live-2',
    title: 'Failure Cause',
    cwd: '/tmp/archive-live',
    focusId: 'focus-global',
    profile: 'worker',
    provider: 'codex',
    status: 'failed',
    createdAt: '2026-02-10T00:00:00.000Z',
    completedAt: '2026-02-10T00:00:10.000Z',
    archivePath: join(workDir, 'tasks/20990101/missing.md'),
    result: {
      taskId: 'task-archive-live-2',
      status: 'failed',
      ok: false,
      output: 'network timeout',
      durationMs: 10000,
      completedAt: '2026-02-10T00:00:10.000Z',
      traceRef: '.mimikit/traces/2026-02-10/task-archive-live-2.txt',
      profile: 'worker',
    },
  }
  ;(
    orchestrator as unknown as {
      getTaskById: (taskId: string) => Task | undefined
    }
  ).getTaskById = (taskId) => (taskId === task.id ? task : undefined)
  const config = defaultConfig({ workDir })
  registerApiRoutes(app, orchestrator, config)

  const response = await app.inject({
    method: 'GET',
    url: `/api/tasks/${task.id}/archive`,
  })

  expectArchiveMarkdown(response, [
    'archive_kind: live_fallback',
    'status: failed',
    'trace_path: .mimikit/traces/2026-02-10/task-archive-live-2.txt',
    '=== RESULT ===',
    'network timeout',
  ])

  await app.close()
})

test('task archive route preserves final archive semantics when archive file exists', async () => {
  const workDir = await mkdtemp(join(tmpdir(), 'mimikit-archive-final-'))
  const app = fastify()
  const { orchestrator } = createOrchestratorStub()
  await persistTaskExecutionSpec({
    stateDir: workDir,
    prompt: 'summarize final output',
    specId: 'spec-task-archive-final-1',
  })
  const archivePath = join(workDir, 'tasks/2026-02-10/task-archive-final-1.md')
  await mkdir(join(workDir, 'tasks/2026-02-10'), { recursive: true })
  await writeFile(
    archivePath,
    [
      '---',
      'archive_kind: final',
      'task_id: task-archive-final-1',
      'title: Final Archive',
      'status: succeeded',
      '---',
      '',
      '=== PROMPT ===',
      'summarize final output',
      '',
      '=== RESULT ===',
      'final archive body',
      '',
    ].join('\n'),
    'utf8',
  )
  const task: Task = {
    id: 'task-archive-final-1',
    fingerprint: 'fp-final-1',
    semanticKey: 'sk-task-archive-final-1',
    executionSpecId: 'spec-task-archive-final-1',
    title: 'Final Archive',
    cwd: '/tmp/archive-final',
    focusId: 'focus-global',
    profile: 'worker',
    provider: 'codex',
    status: 'succeeded',
    createdAt: '2026-02-10T00:00:00.000Z',
    completedAt: '2026-02-10T00:00:10.000Z',
    archivePath,
    result: {
      taskId: 'task-archive-final-1',
      status: 'succeeded',
      ok: true,
      output: 'should not be used',
      durationMs: 10000,
      completedAt: '2026-02-10T00:00:10.000Z',
      profile: 'worker',
    },
  }
  ;(
    orchestrator as unknown as {
      getTaskById: (taskId: string) => Task | undefined
    }
  ).getTaskById = (taskId) => (taskId === task.id ? task : undefined)
  registerApiRoutes(app, orchestrator, defaultConfig({ workDir }))

  const response = await app.inject({
    method: 'GET',
    url: `/api/tasks/${task.id}/archive`,
  })

  expectArchiveMarkdown(response, [
    'archive_kind: final',
    'status: succeeded',
    '=== RESULT ===',
    'final archive body',
  ])
  expect(response.body).not.toContain('should not be used')

  await app.close()
})

test('reset-with-summary route is removed and returns not found', async () => {
  const app = fastify()
  const { orchestrator } = createOrchestratorStub()
  const config = defaultConfig({ workDir: '.mimikit' })
  registerApiRoutes(app, orchestrator, config)

  const response = await app.inject({
    method: 'POST',
    url: '/api/reset-with-summary',
  })

  expect(response.statusCode).toBe(404)
  await app.close()
})
