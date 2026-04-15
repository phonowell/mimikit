import fastify from 'fastify'
import { expect, test } from 'vitest'

import { defaultConfig } from '../src/bootstrap/config.js'
import { getCachedRepoQualitySnapshot } from '../src/foundation/repo-health/summary.js'
import { registerApiRoutes } from '../src/surface/http/routes-api.js'

import { createOrchestratorStub } from './helpers/orchestrator-stub.js'

test('repo quality route returns the current repository quality snapshot', async () => {
  const app = fastify()
  const { orchestrator } = createOrchestratorStub()
  registerApiRoutes(app, orchestrator, defaultConfig({ workDir: '.mimikit' }))

  const response = await app.inject({
    method: 'GET',
    url: '/api/repo-quality',
  })
  const expectedSnapshot = await getCachedRepoQualitySnapshot()

  expect(response.statusCode).toBe(200)
  expect(response.json()).toEqual(expectedSnapshot)
  expect(response.json().sourceLineOverage).toBe(
    Math.max(
      0,
      response.json().sourceLineCount - response.json().sourceLineTarget,
    ),
  )

  await app.close()
})
