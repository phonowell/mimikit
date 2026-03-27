import fastify from 'fastify'
import { expect, test } from 'vitest'

import { defaultConfig } from '../../src/bootstrap/config.js'
import { registerApiRoutes } from '../../src/surface/http/routes-api.js'
import { createOrchestratorStub } from '../helpers/orchestrator-stub.js'

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

test('choice select route is not exposed', async () => {
  const app = fastify()
  const { orchestrator } = createOrchestratorStub()
  const config = defaultConfig({ workDir: '.mimikit' })
  registerApiRoutes(app, orchestrator, config)

  expect(app.printRoutes()).not.toContain('/api/choices/')
  await app.close()
})

test('resume recoverable route is not exposed', async () => {
  const app = fastify()
  const { orchestrator } = createOrchestratorStub()
  const config = defaultConfig({ workDir: '.mimikit' })
  registerApiRoutes(app, orchestrator, config)

  const response = await app.inject({
    method: 'POST',
    url: '/api/tasks/resume-recoverable',
  })

  expect(response.statusCode).toBe(404)
  await app.close()
})
