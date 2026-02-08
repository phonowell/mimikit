import fastify from 'fastify'
import { expect, test } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { registerApiRoutes } from '../src/http/routes-api.js'
import type { ChatMessage, ChatMessagesMode } from '../src/orchestrator/chat-view.js'
import type { Orchestrator } from '../src/orchestrator/orchestrator.js'

const createOrchestratorStub = () => {
  const calls: Array<{ limit: number; afterId?: string }> = []
  const orchestrator = {
    getStatus: () => ({
      ok: true,
      agentStatus: 'idle',
      activeTasks: 0,
      pendingTasks: 0,
      pendingInputs: 0,
      thinkerRunning: false,
      maxWorkers: 1,
    }),
    addUserInput: async () => 'input-1',
    getChatHistory: async () => [],
    getChatMessages: async (limit: number, afterId?: string) => {
      calls.push({ limit, afterId })
      const message: ChatMessage = {
        id: afterId ? 'delta-1' : 'full-1',
        role: 'assistant',
        text: 'ok',
        createdAt: '2026-02-08T00:00:00.000Z',
      }
      const mode: ChatMessagesMode = afterId ? 'delta' : 'full'
      return { messages: [message], mode }
    },
    getTasks: () => ({ tasks: [], counts: {} }),
    getTaskById: () => undefined,
    cancelTask: async () => ({ ok: false, status: 'not_found' as const }),
    stopAndPersist: async () => undefined,
  } as unknown as Orchestrator
  return { orchestrator, calls }
}

test('messages route forwards afterId and returns mode', async () => {
  const app = fastify()
  const { orchestrator, calls } = createOrchestratorStub()
  const config = defaultConfig({ stateDir: '.mimikit', workDir: process.cwd() })
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

test('messages route returns full mode when afterId is absent', async () => {
  const app = fastify()
  const { orchestrator, calls } = createOrchestratorStub()
  const config = defaultConfig({ stateDir: '.mimikit', workDir: process.cwd() })
  registerApiRoutes(app, orchestrator, config)

  const response = await app.inject({
    method: 'GET',
    url: '/api/messages?limit=20',
  })

  expect(response.statusCode).toBe(200)
  const body = response.json() as {
    messages: Array<{ id: string }>
    mode: ChatMessagesMode
  }
  expect(body.mode).toBe('full')
  expect(body.messages[0]?.id).toBe('full-1')
  expect(calls).toEqual([{ limit: 20, afterId: undefined }])

  await app.close()
})

test('messages route returns 304 when If-None-Match hits', async () => {
  const app = fastify()
  const { orchestrator } = createOrchestratorStub()
  const config = defaultConfig({ stateDir: '.mimikit', workDir: process.cwd() })
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

test('status route returns 304 when If-None-Match hits', async () => {
  const app = fastify()
  const { orchestrator } = createOrchestratorStub()
  const config = defaultConfig({ stateDir: '.mimikit', workDir: process.cwd() })
  registerApiRoutes(app, orchestrator, config)

  const first = await app.inject({
    method: 'GET',
    url: '/api/status',
  })
  expect(first.statusCode).toBe(200)
  const etag = first.headers.etag
  expect(typeof etag).toBe('string')

  const second = await app.inject({
    method: 'GET',
    url: '/api/status',
    headers: { 'if-none-match': String(etag) },
  })
  expect(second.statusCode).toBe(304)

  await app.close()
})
