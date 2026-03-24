import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { defaultConfig } from '../src/bootstrap/config.js'
import { createHttpServer } from '../src/surface/http/index.js'
import { createOrchestratorStub } from './helpers/orchestrator-stub.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-http-static-root-'))

test('GET / serves webui index instead of root not-found handler', async () => {
  const stateDir = await createTmpDir()
  const config = defaultConfig({ workDir: stateDir })
  const { orchestrator } = createOrchestratorStub()
  const app = await createHttpServer(orchestrator, config, 0)

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/',
    })

    expect(response.statusCode).toBe(200)
    expect(String(response.headers['content-type'])).toContain('text/html')
    expect(response.body).toContain('<div id="root"></div>')
    expect(response.body).toContain('generated/app.js')
  } finally {
    await app.close()
  }
})
