import fastify from 'fastify'

import { expect, test } from 'vitest'

import { defaultConfig } from '../../src/bootstrap/config.js'
import { registerApiRoutes } from '../../src/surface/http/routes-api.js'
import { createOrchestratorStub } from '../helpers/orchestrator-stub.js'

import { expectArchiveMarkdown } from './testkit.js'

import type { Task } from '../../src/foundation/types/index.js'

test('task archive route falls back to live snapshot when archive file is missing', async () => {
  const app = fastify()
  const { orchestrator } = createOrchestratorStub()
  const task: Task = {
    id: 'task-archive-live-2',
    fingerprint: 'fp-live-2',
    prompt: 'explain failure cause',
    title: 'Failure Cause',
    profile: 'worker',
    status: 'failed',
    createdAt: '2026-02-10T00:00:00.000Z',
    completedAt: '2026-02-10T00:00:10.000Z',
    archivePath: '.mimikit/tasks/20990101/missing.md',
    result: {
      taskId: 'task-archive-live-2',
      status: 'failed',
      ok: false,
      output: 'network timeout',
      durationMs: 10000,
      completedAt: '2026-02-10T00:00:10.000Z',
      profile: 'worker',
    },
  }
  ;(
    orchestrator as unknown as { getTaskById: (taskId: string) => Task | undefined }
  ).getTaskById = (taskId) => (taskId === task.id ? task : undefined)
  const config = defaultConfig({ workDir: '.mimikit' })
  registerApiRoutes(app, orchestrator, config)

  const response = await app.inject({
    method: 'GET',
    url: `/api/tasks/${task.id}/archive`,
  })

  expectArchiveMarkdown(response, [
    'status: failed',
    '=== RESULT ===',
    'network timeout',
  ])

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
