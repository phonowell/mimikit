import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { defaultConfig } from '../src/bootstrap/config.js'
import { createHttpServer } from '../src/surface/http/index.js'

import { createOrchestratorStub } from './helpers/orchestrator-stub.js'

const createTmpRoot = () => mkdtemp(join(tmpdir(), 'mimikit-http-workspace-'))

test('GET /api/workspace-file serves markdown inside inferred workspace root', async () => {
  const workspaceRoot = await createTmpRoot()
  const stateDir = join(workspaceRoot, '.mimikit')
  const reportPath = join(workspaceRoot, 'plans', 'report.md')
  await mkdir(stateDir, { recursive: true })
  await mkdir(join(workspaceRoot, 'plans'), { recursive: true })
  await writeFile(reportPath, '# report\n', 'utf8')

  const config = defaultConfig({ workDir: stateDir })
  const { orchestrator } = createOrchestratorStub()
  const app = await createHttpServer(orchestrator, config, 0)

  try {
    const response = await app.inject({
      method: 'GET',
      url: `/api/workspace-file?path=${encodeURIComponent(reportPath)}`,
    })

    expect(response.statusCode).toBe(200)
    expect(String(response.headers['content-type'])).toContain('text/markdown')
    expect(response.body).toContain('# report')
  } finally {
    await app.close()
  }
})

test('GET /api/workspace-file rejects unsupported workspace files', async () => {
  const workspaceRoot = await createTmpRoot()
  const stateDir = join(workspaceRoot, '.mimikit')
  const envPath = join(workspaceRoot, '.env')
  await mkdir(stateDir, { recursive: true })
  await writeFile(envPath, 'SECRET=1\n', 'utf8')

  const config = defaultConfig({ workDir: stateDir })
  const { orchestrator } = createOrchestratorStub()
  const app = await createHttpServer(orchestrator, config, 0)

  try {
    const response = await app.inject({
      method: 'GET',
      url: `/api/workspace-file?path=${encodeURIComponent(envPath)}`,
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ error: 'unsupported workspace file' })
  } finally {
    await app.close()
  }
})
