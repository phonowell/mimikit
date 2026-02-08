import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import fastify from 'fastify'
import { expect, test } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { registerTaskProgressRoute } from '../src/http/routes-api-sections.js'
import { appendTaskProgress } from '../src/storage/task-progress.js'
import type { Orchestrator } from '../src/orchestrator/orchestrator.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-task-progress-route-'))

test('task progress route returns task events', async () => {
  const stateDir = await createTmpDir()
  const config = defaultConfig({ stateDir, workDir: process.cwd() })

  await appendTaskProgress({
    stateDir,
    taskId: 'task-123',
    type: 'standard_start',
    payload: { round: 0 },
  })

  const orchestrator = {
    getTaskById: (id: string) =>
      id === 'task-123'
        ? {
            id,
            fingerprint: 'fp',
            prompt: 'test',
            title: 'test',
            profile: 'standard',
            status: 'running',
            createdAt: '2026-02-08T00:00:00.000Z',
          }
        : undefined,
  } as unknown as Orchestrator

  const app = fastify()
  registerTaskProgressRoute(app, orchestrator, config)

  const response = await app.inject({
    method: 'GET',
    url: '/api/tasks/task-123/progress',
  })
  expect(response.statusCode).toBe(200)
  const body = response.json() as {
    taskId: string
    events: Array<{ type: string }>
  }
  expect(body.taskId).toBe('task-123')
  expect(body.events[0]?.type).toBe('standard_start')

  await app.close()
})
