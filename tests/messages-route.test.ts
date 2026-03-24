import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import fastify from 'fastify'
import { expect, test, vi } from 'vitest'

import { defaultConfig } from '../src/bootstrap/config.js'
import { registerApiRoutes } from '../src/surface/http/routes-api.js'
import type { Task } from '../src/foundation/types/index.js'
import { createOrchestratorStub } from './helpers/orchestrator-stub.js'

const expectArchiveMarkdown = (
  response: {
    statusCode: number
    headers: Record<string, unknown>
    body: string
  },
  markers: string[],
): void => {
  expect(response.statusCode).toBe(200)
  expect(String(response.headers['content-type'])).toContain('text/markdown')
  for (const marker of markers) expect(response.body).toContain(marker)
}

test('input route forwards normalized payload to orchestrator', async () => {
  const app = fastify()
  const { orchestrator, addInputCalls } = createOrchestratorStub()
  const config = defaultConfig({ workDir: '.mimikit' })
  registerApiRoutes(app, orchestrator, config)

  const response = await app.inject({
    method: 'POST',
    url: '/api/input',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'vitest-agent',
      'accept-language': 'zh-CN',
    },
    payload: {
      text: '  hello  ',
      quote: '  q-1 ',
      clientLocale: 'zh-CN',
      clientTimeZone: 'Asia/Shanghai',
      clientOffsetMinutes: 480,
      clientNowIso: '2026-02-09T11:20:00.000+08:00',
    },
  })

  expect(response.statusCode).toBe(200)
  expect(response.json()).toEqual({ id: 'input-1' })
  expect(addInputCalls).toHaveLength(1)
  expect(addInputCalls[0]).toEqual({
    text: 'hello',
    quote: 'q-1',
    meta: {
      source: 'webui',
      platform: 'webui',
      remote: '127.0.0.1',
      userAgent: 'vitest-agent',
      language: 'zh-CN',
      clientLocale: 'zh-CN',
      clientTimeZone: 'Asia/Shanghai',
      clientOffsetMinutes: 480,
      clientNowIso: '2026-02-09T11:20:00.000+08:00',
    },
  })

  await app.close()
})

test('input route rejects invalid payload', async () => {
  const app = fastify()
  const { orchestrator, addInputCalls } = createOrchestratorStub()
  const config = defaultConfig({ workDir: '.mimikit' })
  registerApiRoutes(app, orchestrator, config)

  const textMissing = await app.inject({
    method: 'POST',
    url: '/api/input',
    payload: { text: '   ' },
  })
  expect(textMissing.statusCode).toBe(400)
  expect(textMissing.json()).toEqual({ error: 'text is required' })

  expect(addInputCalls).toHaveLength(0)

  await app.close()
})

test('choice select route forwards valid selection request', async () => {
  const app = fastify()
  const { orchestrator } = createOrchestratorStub()
  const selectPendingUserChoice = vi.fn(async () => ({
    ok: true as const,
    choiceId: 'choice-demo',
    optionId: 'option-a',
    source: 'user' as const,
  }))
  ;(
    orchestrator as unknown as {
      selectPendingUserChoice: (
        choiceId: string,
        optionId: string,
      ) => Promise<{
        ok: true
        choiceId: string
        optionId: string
        source: 'user'
      }>
    }
  ).selectPendingUserChoice = selectPendingUserChoice
  const config = defaultConfig({ workDir: '.mimikit' })
  registerApiRoutes(app, orchestrator, config)

  const response = await app.inject({
    method: 'POST',
    url: '/api/choices/choice-demo/select',
    payload: { optionId: 'option-a' },
  })

  expect(response.statusCode).toBe(200)
  expect(response.json()).toEqual({
    ok: true,
    choiceId: 'choice-demo',
    optionId: 'option-a',
    source: 'user',
  })
  expect(selectPendingUserChoice).toHaveBeenCalledWith('choice-demo', 'option-a')
  await app.close()
})

test('resume recoverable route forwards batch resume request', async () => {
  const app = fastify()
  const { orchestrator } = createOrchestratorStub()
  const resumeRecoverableTasks = vi.fn(async () => ({
    ok: true as const,
    resumedCount: 2,
    skippedCount: 1,
    items: [
      { ok: true, id: 'task-1', status: 'pending' as const },
      { ok: true, id: 'task-2', status: 'pending' as const },
      { ok: false, id: 'task-3', status: 'not_paused' as const },
    ],
  }))
  ;(
    orchestrator as unknown as {
      resumeRecoverableTasks: () => Promise<{
        ok: true
        resumedCount: number
        skippedCount: number
        items: Array<{ ok: boolean; id: string; status: string }>
      }>
    }
  ).resumeRecoverableTasks = resumeRecoverableTasks
  const config = defaultConfig({ workDir: '.mimikit' })
  registerApiRoutes(app, orchestrator, config)

  const response = await app.inject({
    method: 'POST',
    url: '/api/tasks/resume-recoverable',
  })

  expect(response.statusCode).toBe(200)
  expect(response.json()).toEqual({
    ok: true,
    resumedCount: 2,
    skippedCount: 1,
    items: [
      { ok: true, id: 'task-1', status: 'pending' },
      { ok: true, id: 'task-2', status: 'pending' },
      { ok: false, id: 'task-3', status: 'not_paused' },
    ],
  })
  expect(resumeRecoverableTasks).toHaveBeenCalledTimes(1)
  await app.close()
})

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

test('restart route requests orchestrator exit after persistence', async () => {
  const app = fastify()
  const { orchestrator, exitRequests } = createOrchestratorStub()
  const stopAndPersist = vi.fn(async () => undefined)
  ;(orchestrator as unknown as { stopAndPersist: () => Promise<void> }).stopAndPersist =
    stopAndPersist
  const config = defaultConfig({ workDir: '.mimikit' })
  registerApiRoutes(app, orchestrator, config)
  vi.useFakeTimers()
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/restart',
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ ok: true })
    await vi.advanceTimersByTimeAsync(150)
  } finally {
    vi.useRealTimers()
  }
  expect(stopAndPersist).toHaveBeenCalledTimes(1)
  expect(exitRequests).toEqual([{ code: 75, reason: 'http_api_restart' }])
  await app.close()
})

test('restart route rejects when manager or worker is not idle', async () => {
  const app = fastify()
  const { orchestrator, exitRequests } = createOrchestratorStub()
  const stopAndPersist = vi.fn(async () => undefined)
  ;(orchestrator as unknown as { stopAndPersist: () => Promise<void> }).stopAndPersist =
    stopAndPersist
  ;(
    orchestrator as unknown as {
      getStatus: () => {
        ok: boolean
        runtimeId: string
        agentStatus: 'idle' | 'running'
        activeTasks: number
        pendingTasks: number
        pendingInputs: number
        managerRunning: boolean
        maxWorkers: number
      }
    }
  ).getStatus = () => ({
    ok: true,
    runtimeId: 'runtime-stub-busy',
    agentStatus: 'running',
    activeTasks: 1,
    pendingTasks: 0,
    pendingInputs: 0,
    managerRunning: true,
    maxWorkers: 1,
  })
  const config = defaultConfig({ workDir: '.mimikit' })
  registerApiRoutes(app, orchestrator, config)

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
  const app = fastify()
  const { orchestrator, exitRequests } = createOrchestratorStub()
  const stopAndPersist = vi.fn(async () => undefined)
  ;(orchestrator as unknown as { stopAndPersist: () => Promise<void> }).stopAndPersist =
    stopAndPersist
  ;(
    orchestrator as unknown as {
      getStatus: () => {
        ok: boolean
        runtimeId: string
        agentStatus: 'idle' | 'running'
        activeTasks: number
        pendingTasks: number
        pendingInputs: number
        managerRunning: boolean
        maxWorkers: number
      }
    }
  ).getStatus = () => ({
    ok: true,
    runtimeId: 'runtime-stub-paused-only',
    agentStatus: 'idle',
    activeTasks: 0,
    pendingTasks: 0,
    pendingInputs: 0,
    managerRunning: false,
    maxWorkers: 1,
  })
  const config = defaultConfig({ workDir: '.mimikit' })
  registerApiRoutes(app, orchestrator, config)
  vi.useFakeTimers()
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/restart',
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ ok: true })
    await vi.advanceTimersByTimeAsync(150)
  } finally {
    vi.useRealTimers()
  }
  expect(stopAndPersist).toHaveBeenCalledTimes(1)
  expect(exitRequests).toEqual([{ code: 75, reason: 'http_api_restart' }])
  await app.close()
})

test('reset route requests orchestrator exit after persistence', async () => {
  const app = fastify()
  const { orchestrator, exitRequests } = createOrchestratorStub()
  const stopAndPersist = vi.fn(async () => undefined)
  ;(orchestrator as unknown as { stopAndPersist: () => Promise<void> }).stopAndPersist =
    stopAndPersist
  const workDir = await mkdtemp(join(tmpdir(), 'mimikit-reset-route-'))
  const config = defaultConfig({ workDir })
  registerApiRoutes(app, orchestrator, config)
  const response = await app.inject({
    method: 'POST',
    url: '/api/reset',
  })
  expect(response.statusCode).toBe(200)
  expect(response.json()).toEqual({ ok: true })
  await new Promise((resolve) => setTimeout(resolve, 180))
  expect(stopAndPersist).toHaveBeenCalledTimes(1)
  expect(exitRequests).toEqual([{ code: 75, reason: 'http_api_reset' }])
  await app.close()
})

test('reset route rejects when manager or worker is not idle', async () => {
  const app = fastify()
  const { orchestrator, exitRequests } = createOrchestratorStub()
  const stopAndPersist = vi.fn(async () => undefined)
  ;(orchestrator as unknown as { stopAndPersist: () => Promise<void> }).stopAndPersist =
    stopAndPersist
  ;(
    orchestrator as unknown as {
      getStatus: () => {
        ok: boolean
        runtimeId: string
        agentStatus: 'idle' | 'running'
        activeTasks: number
        pendingTasks: number
        pendingInputs: number
        managerRunning: boolean
        maxWorkers: number
      }
    }
  ).getStatus = () => ({
    ok: true,
    runtimeId: 'runtime-stub-busy',
    agentStatus: 'running',
    activeTasks: 0,
    pendingTasks: 1,
    pendingInputs: 0,
    managerRunning: false,
    maxWorkers: 1,
  })
  const config = defaultConfig({ workDir: '.mimikit' })
  registerApiRoutes(app, orchestrator, config)

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
