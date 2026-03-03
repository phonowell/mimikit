import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import fastify from 'fastify'
import { expect, test } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { registerApiRoutes } from '../src/http/routes-api.js'
import { createOrchestratorStub } from './helpers/orchestrator-stub.js'

test('qq webhook route accepts c2c message and deduplicates repeated msg_id', async () => {
  const stateDir = await mkdtemp(join(tmpdir(), 'mimikit-qq-webhook-'))
  const app = fastify()
  const { orchestrator, addInputCalls } = createOrchestratorStub()
  const config = defaultConfig({ workDir: stateDir })
  config.qq.enabled = true
  config.qq.appId = 'qq-app-id'
  config.qq.appSecret = 'qq-app-secret'
  config.qq.verifySign = false
  registerApiRoutes(app, orchestrator, config)

  const payload = {
    id: 'event-1',
    op: 0,
    t: 'C2C_MESSAGE_CREATE',
    d: {
      id: 'msg-1',
      content: '  hi  ',
      timestamp: '2026-03-02T10:00:00+08:00',
      author: {
        user_openid: 'openid-1',
      },
    },
  }

  const first = await app.inject({
    method: 'POST',
    url: '/api/qq/events',
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify(payload),
  })
  const second = await app.inject({
    method: 'POST',
    url: '/api/qq/events',
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify(payload),
  })

  expect(first.statusCode).toBe(200)
  expect(first.json()).toEqual({ op: 12, d: 0 })
  expect(second.statusCode).toBe(200)
  expect(second.json()).toEqual({ op: 12, d: 0 })
  expect(addInputCalls).toHaveLength(1)
  expect(addInputCalls[0]).toEqual({
    text: 'hi',
    meta: {
      source: 'qq',
      platform: 'qq',
      qqOpenid: 'openid-1',
      qqMessageId: 'msg-1',
      qqEventId: 'event-1',
      qqTimestamp: '2026-03-02T10:00:00+08:00',
    },
    quote: undefined,
  })

  await app.close()
  await rm(stateDir, { recursive: true, force: true })
})
