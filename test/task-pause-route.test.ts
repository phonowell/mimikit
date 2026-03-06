import fastify from 'fastify'
import { expect, test, vi } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { registerApiRoutes } from '../src/http/routes-api.js'
import { createOrchestratorStub } from './helpers/orchestrator-stub.js'

test('task pause route returns id/status/changeAt for user pause', async () => {
  const app = fastify()
  const { orchestrator } = createOrchestratorStub()
  const pauseTask = vi.fn(async () => ({
    ok: true as const,
    id: 'task-user-1',
    status: 'paused' as const,
    changeAt: '2026-03-06T06:00:00.000Z',
  }))
  ;(
    orchestrator as unknown as {
      pauseTask: (
        taskId: string,
        meta?: { source?: string; reason?: string },
      ) => Promise<{
        ok: true
        id: string
        status: 'paused'
        changeAt: string
      }>
    }
  ).pauseTask = pauseTask

  const config = defaultConfig({ workDir: '.mimikit' })
  registerApiRoutes(app, orchestrator, config)

  const response = await app.inject({
    method: 'POST',
    url: '/api/tasks/task-user-1/pause',
  })

  expect(response.statusCode).toBe(200)
  expect(response.json()).toEqual({
    ok: true,
    id: 'task-user-1',
    status: 'paused',
    changeAt: '2026-03-06T06:00:00.000Z',
  })
  expect(pauseTask).toHaveBeenCalledWith('task-user-1', { source: 'user' })
  await app.close()
})

test('task pause route keeps id/status in error payload', async () => {
  const app = fastify()
  const { orchestrator } = createOrchestratorStub()
  const pauseTask = vi.fn(async () => ({
    ok: false as const,
    id: 'task-user-1',
    status: 'already_paused' as const,
  }))
  ;(
    orchestrator as unknown as {
      pauseTask: (
        taskId: string,
        meta?: { source?: string; reason?: string },
      ) => Promise<{ ok: false; id: string; status: 'already_paused' }>
    }
  ).pauseTask = pauseTask

  const config = defaultConfig({ workDir: '.mimikit' })
  registerApiRoutes(app, orchestrator, config)

  const response = await app.inject({
    method: 'POST',
    url: '/api/tasks/task-user-1/pause',
  })

  expect(response.statusCode).toBe(409)
  expect(response.json()).toEqual({
    ok: false,
    id: 'task-user-1',
    status: 'already_paused',
    error: 'already_paused',
  })
  expect(pauseTask).toHaveBeenCalledWith('task-user-1', { source: 'user' })
  await app.close()
})
