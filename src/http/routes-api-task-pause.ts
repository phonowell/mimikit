import { registerTaskMutationRoute } from './routes-api-task-mutation.js'

import type { Orchestrator } from '../orchestrator/core/orchestrator-service.js'
import type { FastifyInstance } from 'fastify'

export const registerTaskPauseRoute = (
  app: FastifyInstance,
  orchestrator: Orchestrator,
): void => {
  registerTaskMutationRoute(app, '/api/tasks/:id/pause', (taskId) =>
    orchestrator.pauseTask(taskId, { source: 'user' }),
  )
}
