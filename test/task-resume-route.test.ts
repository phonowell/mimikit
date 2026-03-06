import fastify from 'fastify'
import { expect, test, vi } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { registerApiRoutes } from '../src/http/routes-api.js'
import { createOrchestratorStub } from './helpers/orchestrator-stub.js'

test('task resume route returns id/status/changeAt for user resume', async () => {
  const app = fastify()
  const { orchestrator } = createOrchestratorStub()
  const resumeTask = vi.fn(async () => ({
    ok: true as const,
    id: 'task-user-2',
    status: 'pending' as const,
    changeAt: '2026-03-06T06:10:00.000Z',
  }))
  ;(
    orchestrator as unknown as {
      resumeTask: (
        taskId: string,
        meta?: { source?: string; reason?: string },
      ) => Promise<{
        ok: true
        id: string
        status: 'pending'
        changeAt: string
      }>
    }
  ).resumeTask = resumeTask

  const config = defaultConfig({ workDir: '.mimikit' })
  registerApiRoutes(app, orchestrator, config)

  const response = await app.inject({
    method: 'POST',
    url: '/api/tasks/task-user-2/resume',
  })

  expect(response.statusCode).toBe(200)
  expect(response.json()).toEqual({
    ok: true,
    id: 'task-user-2',
    status: 'pending',
    changeAt: '2026-03-06T06:10:00.000Z',
  })
  expect(resumeTask).toHaveBeenCalledWith('task-user-2', { source: 'user' })
  await app.close()
})

test('task resume route keeps id/status in error payload', async () => {
  const app = fastify()
  const { orchestrator } = createOrchestratorStub()
  const resumeTask = vi.fn(async () => ({
    ok: false as const,
    id: 'task-user-2',
    status: 'not_paused' as const,
  }))
  ;(
    orchestrator as unknown as {
      resumeTask: (
        taskId: string,
        meta?: { source?: string; reason?: string },
      ) => Promise<{ ok: false; id: string; status: 'not_paused' }>
    }
  ).resumeTask = resumeTask

  const config = defaultConfig({ workDir: '.mimikit' })
  registerApiRoutes(app, orchestrator, config)

  const response = await app.inject({
    method: 'POST',
    url: '/api/tasks/task-user-2/resume',
  })

  expect(response.statusCode).toBe(409)
  expect(response.json()).toEqual({
    ok: false,
    id: 'task-user-2',
    status: 'not_paused',
    error: 'not_paused',
  })
  expect(resumeTask).toHaveBeenCalledWith('task-user-2', { source: 'user' })
  await app.close()
})
