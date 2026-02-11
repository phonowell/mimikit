import fastify from 'fastify'
import { expect, test } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { registerApiRoutes } from '../src/http/routes-api.js'
import type { ChatMessagesMode } from '../src/orchestrator/read-model/chat-view.js'
import { createOrchestratorStub } from './helpers/orchestrator-stub.js'

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

test('input route parses body and calls orchestrator', async () => {
  const app = fastify()
  const { orchestrator, addInputCalls } = createOrchestratorStub()
  const config = defaultConfig({ stateDir: '.mimikit', workDir: process.cwd() })
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
  const config = defaultConfig({ stateDir: '.mimikit', workDir: process.cwd() })
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
