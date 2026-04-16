import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import { expect, test } from 'vitest'

import { defaultConfig } from '../src/bootstrap/config.js'
import { createHttpServer } from '../src/surface/http/index.js'

import { createOrchestratorStub } from './helpers/orchestrator-stub.js'

const createTmpDir = () =>
  mkdtemp(join(tmpdir(), 'mimikit-http-observability-'))

const readLogs = async (
  stateDir: string,
): Promise<Record<string, unknown>[]> => {
  const path = join(stateDir, 'log.jsonl.txt')
  const content = await readFile(path, 'utf8').catch(() => '')
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>)
}

test('GET /api/status writes a structured HTTP access log entry', async () => {
  const stateDir = await createTmpDir()
  const config = defaultConfig({ workDir: stateDir })
  const { orchestrator } = createOrchestratorStub()
  const app = await createHttpServer(orchestrator, config, 0)

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/api/status',
      headers: {
        'user-agent': 'vitest-http-observability',
      },
    })

    expect(response.statusCode).toBe(200)
    await delay(25)

    const logs = await readLogs(stateDir)
    expect(logs).toContainEqual(
      expect.objectContaining({
        event: 'http_request_completed',
        method: 'GET',
        url: '/api/status',
        routeKind: 'api',
        statusCode: 200,
        requestId: expect.any(String),
        durationMs: expect.any(Number),
      }),
    )
  } finally {
    await app.close()
  }
})

test('POST /api/input carries requestId into the user_input log', async () => {
  const stateDir = await createTmpDir()
  const config = defaultConfig({ workDir: stateDir })
  const { orchestrator, addInputCalls } = createOrchestratorStub()
  const app = await createHttpServer(orchestrator, config, 0)

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/input',
      headers: {
        'user-agent': 'vitest-http-observability',
      },
      payload: {
        text: 'hello from test',
        clientTimeZone: 'Asia/Shanghai',
      },
    })

    expect(response.statusCode).toBe(200)
    await delay(25)

    const logs = await readLogs(stateDir)
    const httpEntry = logs.find(
      (entry) =>
        entry['event'] === 'http_request_completed' &&
        entry['method'] === 'POST' &&
        entry['url'] === '/api/input',
    )
    expect(httpEntry).toBeDefined()
    expect(addInputCalls).toHaveLength(1)
    expect(addInputCalls[0]?.meta.requestId).toBe(httpEntry?.['requestId'])
  } finally {
    await app.close()
  }
})

test('POST /api/restart logs structured control-plane lifecycle events', async () => {
  const stateDir = await createTmpDir()
  const config = defaultConfig({ workDir: stateDir })
  const { orchestrator, exitRequests } = createOrchestratorStub()
  const app = await createHttpServer(orchestrator, config, 0)

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/restart',
    })

    expect(response.statusCode).toBe(200)
    await delay(150)

    const logs = await readLogs(stateDir)
    expect(logs).toContainEqual(
      expect.objectContaining({
        event: 'http_control_requested',
        action: 'restart',
        accepted: true,
        requestId: expect.any(String),
      }),
    )
    expect(logs).toContainEqual(
      expect.objectContaining({
        event: 'http_runtime_exit_scheduled',
        reason: 'http_api_restart',
      }),
    )
    expect(exitRequests).toContainEqual(
      expect.objectContaining({
        reason: 'http_api_restart',
        skipPersist: true,
      }),
    )
  } finally {
    await app.close()
  }
})
