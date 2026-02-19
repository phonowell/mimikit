import { logSafeError } from '../log/safe.js'

import { clearStateDir } from './helpers.js'

import type { AppConfig } from '../config.js'
import type { Orchestrator } from '../orchestrator/core/orchestrator-service.js'
import type { FastifyInstance } from 'fastify'

const scheduleExit = (
  orchestrator: Orchestrator,
  afterPersist?: () => Promise<void>,
): void => {
  setTimeout(() => {
    void (async () => {
      await orchestrator.stopAndPersist()
      if (afterPersist) await afterPersist()
      process.exit(75)
    })()
  }, 100)
}

export const registerControlRoutes = (
  app: FastifyInstance,
  orchestrator: Orchestrator,
  config: AppConfig,
): void => {
  app.post('/api/restart', (_request, reply) => {
    reply.send({ ok: true })
    scheduleExit(orchestrator)
  })

  app.post('/api/reset', (_request, reply) => {
    reply.send({ ok: true })
    scheduleExit(orchestrator, async () => {
      try {
        await clearStateDir(config.workDir)
      } catch (error) {
        await logSafeError('http: reset', error)
      }
    })
  })
}
