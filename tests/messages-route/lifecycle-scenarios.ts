import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import {
  createLifecycleRouteApp,
  expectLifecycleRouteAccepted,
} from './testkit.js'

test('restart route requests orchestrator exit after persistence', async () => {
  const { app, exitRequests, stopAndPersist } = createLifecycleRouteApp()
  await expectLifecycleRouteAccepted({
    url: '/api/restart',
    app,
    stopAndPersist,
    exitRequests,
    expectedExitReason: 'http_api_restart',
    settleMs: 150,
    useFakeTimers: true,
  })
  await app.close()
})

test('restart route rejects when manager or worker is not idle', async () => {
  const { app, exitRequests, stopAndPersist } = createLifecycleRouteApp({
    status: {
      ok: true,
      runtimeId: 'runtime-stub-busy',
      agentStatus: 'running',
      activeTasks: 1,
      pendingTasks: 0,
      pendingInputs: 0,
      managerRunning: true,
      maxWorkers: 1,
    },
  })

  const response = await app.inject({
    method: 'POST',
    url: '/api/restart',
  })

  expect(response.statusCode).toBe(409)
  expect(response.json()).toEqual({
    error:
      'restart requires clear slots: wait for manager to stop and pending/running tasks to clear',
  })
  expect(stopAndPersist).toHaveBeenCalledTimes(0)
  expect(exitRequests).toHaveLength(0)
  await app.close()
})

test('restart route allows paused-only tasks when no pending/running work remains', async () => {
  const { app, exitRequests, stopAndPersist } = createLifecycleRouteApp({
    status: {
      ok: true,
      runtimeId: 'runtime-stub-paused-only',
      agentStatus: 'idle',
      activeTasks: 0,
      pendingTasks: 0,
      pendingInputs: 0,
      managerRunning: false,
      maxWorkers: 1,
    },
  })
  await expectLifecycleRouteAccepted({
    url: '/api/restart',
    app,
    stopAndPersist,
    exitRequests,
    expectedExitReason: 'http_api_restart',
    settleMs: 150,
    useFakeTimers: true,
  })
  await app.close()
})

test('reset route requests orchestrator exit after persistence', async () => {
  const workDir = await mkdtemp(join(tmpdir(), 'mimikit-reset-route-'))
  const { app, exitRequests, stopAndPersist } = createLifecycleRouteApp({
    workDir,
  })
  await expectLifecycleRouteAccepted({
    url: '/api/reset',
    app,
    stopAndPersist,
    exitRequests,
    expectedExitReason: 'http_api_reset',
    settleMs: 180,
  })
  await app.close()
})

test('reset route rejects when manager or worker is not idle', async () => {
  const { app, exitRequests, stopAndPersist } = createLifecycleRouteApp({
    status: {
      ok: true,
      runtimeId: 'runtime-stub-busy',
      agentStatus: 'running',
      activeTasks: 0,
      pendingTasks: 1,
      pendingInputs: 0,
      managerRunning: false,
      maxWorkers: 1,
    },
  })

  const response = await app.inject({
    method: 'POST',
    url: '/api/reset',
  })

  expect(response.statusCode).toBe(409)
  expect(response.json()).toEqual({
    error:
      'reset requires clear slots: wait for manager to stop and pending/running tasks to clear',
  })
  expect(stopAndPersist).toHaveBeenCalledTimes(0)
  expect(exitRequests).toHaveLength(0)
  await app.close()
})
