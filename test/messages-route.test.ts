import fastify from 'fastify'
import { expect, test } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { registerApiRoutes } from '../src/http/routes-api.js'
import type { ChatMessagesMode } from '../src/orchestrator/read-model/chat-view.js'
import type { Task } from '../src/types/index.js'
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

test('status route returns runtime id', async () => {
  const app = fastify()
  const { orchestrator } = createOrchestratorStub()
  const config = defaultConfig({ workDir: '.mimikit' })
  registerApiRoutes(app, orchestrator, config)

  const statusResponse = await app.inject({
    method: 'GET',
    url: '/api/status',
  })
  expect(statusResponse.statusCode).toBe(200)
  expect(statusResponse.json()).toMatchObject({
    ok: true,
    runtimeId: 'runtime-stub-1',
  })
  await app.close()
})

test('messages route forwards afterId and returns mode', async () => {
  const app = fastify()
  const { orchestrator, calls } = createOrchestratorStub()
  const config = defaultConfig({ workDir: '.mimikit' })
  registerApiRoutes(app, orchestrator, config)
  const response = await app.inject({
    method: 'GET',
    url: '/api/messages?limit=20&afterId=msg-123',
  })

  expect(response.statusCode).toBe(200)
  const body = response.json() as {
    messages: Array<{ id: string }>
    mode: ChatMessagesMode
  }
  expect(body.mode).toBe('delta')
  expect(body.messages[0]?.id).toBe('delta-1')
  expect(calls).toEqual([{ limit: 20, afterId: 'msg-123' }])

  await app.close()
})

test('input route parses body and calls orchestrator', async () => {
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
      source: 'http',
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

test('messages route returns 304 when If-None-Match hits', async () => {
  const app = fastify()
  const { orchestrator } = createOrchestratorStub()
  const config = defaultConfig({ workDir: '.mimikit' })
  registerApiRoutes(app, orchestrator, config)

  const first = await app.inject({
    method: 'GET',
    url: '/api/messages?limit=20',
  })
  expect(first.statusCode).toBe(200)
  const etag = first.headers.etag
  expect(typeof etag).toBe('string')

  const second = await app.inject({
    method: 'GET',
    url: '/api/messages?limit=20',
    headers: { 'if-none-match': String(etag) },
  })
  expect(second.statusCode).toBe(304)

  await app.close()
})

test('task archive route returns live snapshot when archive is not created yet', async () => {
  const app = fastify()
  const { orchestrator } = createOrchestratorStub()
  const task: Task = {
    id: 'task-archive-live-1',
    fingerprint: 'fp-live-1',
    prompt: 'run a quick summary',
    title: 'Quick Summary',
    profile: 'worker',
    status: 'pending',
    createdAt: '2026-02-10T00:00:00.000Z',
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
    'task_id: task-archive-live-1',
    'status: pending',
    '=== PROMPT ===',
    'run a quick summary',
  ])
  await app.close()
})

test('task archive route returns live cron snapshot when archive is not created yet', async () => {
  const app = fastify()
  const { orchestrator } = createOrchestratorStub()
  const cronJob = {
    id: 'cron-archive-live-1',
    prompt: 'daily digest',
    title: 'Daily Digest',
    profile: 'worker',
    enabled: true,
    createdAt: '2026-02-10T00:00:00.000Z',
    cron: '0 9 * * *',
  }
  ;(
    orchestrator as unknown as {
      getCronJobs: () => Array<{
        id: string
        prompt: string
        title: string
        profile: 'worker'
        enabled: boolean
        createdAt: string
        cron: string
      }>
    }
  ).getCronJobs = () => [cronJob]
  const config = defaultConfig({ workDir: '.mimikit' })
  registerApiRoutes(app, orchestrator, config)

  const cronResponse = await app.inject({
    method: 'GET',
    url: `/api/tasks/${cronJob.id}/archive`,
  })
  expectArchiveMarkdown(cronResponse, [
    'task_id: cron-archive-live-1',
    'kind: cron',
    'status: pending',
    'daily digest',
  ])

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
