import fastify from 'fastify'
import { expect, test, vi } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { registerApiRoutes } from '../src/http/routes-api.js'
import { createOrchestratorStub } from './helpers/orchestrator-stub.js'

test('task cancel route returns id/status/changeAt for user cancel', async () => {
  const app = fastify()
  const { orchestrator } = createOrchestratorStub()
  const cancelTask = vi.fn(async () => ({
    ok: true as const,
    id: 'task-user-1',
    status: 'canceled' as const,
    changeAt: '2026-03-06T05:00:00.000Z',
  }))
  ;(
    orchestrator as unknown as {
      cancelTask: (
        taskId: string,
        meta?: { source?: string; reason?: string },
      ) => Promise<{
        ok: true
        id: string
        status: 'canceled'
        changeAt: string
      }>
    }
  ).cancelTask = cancelTask

  const config = defaultConfig({ workDir: '.mimikit' })
  registerApiRoutes(app, orchestrator, config)

  const response = await app.inject({
    method: 'POST',
    url: '/api/tasks/task-user-1/cancel',
  })

  expect(response.statusCode).toBe(200)
  expect(response.json()).toEqual({
    ok: true,
    id: 'task-user-1',
    status: 'canceled',
    changeAt: '2026-03-06T05:00:00.000Z',
  })
  expect(cancelTask).toHaveBeenCalledWith('task-user-1', { source: 'user' })
  await app.close()
})

test('task cancel route keeps id/status in error payload', async () => {
  const app = fastify()
  const { orchestrator } = createOrchestratorStub()
  const cancelTask = vi.fn(async () => ({
    ok: false as const,
    id: 'task-user-404',
    status: 'not_found' as const,
  }))
  ;(
    orchestrator as unknown as {
      cancelTask: (
        taskId: string,
        meta?: { source?: string; reason?: string },
      ) => Promise<{ ok: false; id: string; status: 'not_found' }>
    }
  ).cancelTask = cancelTask

  const config = defaultConfig({ workDir: '.mimikit' })
  registerApiRoutes(app, orchestrator, config)

  const response = await app.inject({
    method: 'POST',
    url: '/api/tasks/task-user-404/cancel',
  })

  expect(response.statusCode).toBe(404)
  expect(response.json()).toEqual({
    ok: false,
    id: 'task-user-404',
    status: 'not_found',
    error: 'not_found',
  })
  expect(cancelTask).toHaveBeenCalledWith('task-user-404', { source: 'user' })
  await app.close()
})
