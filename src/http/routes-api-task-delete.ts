import { registerTaskMutationRoute } from './routes-api-task-mutation.js'

import type { Orchestrator } from '../orchestrator/core/orchestrator-service.js'
import type { FastifyInstance } from 'fastify'

export const registerTaskDeleteRoute = (
  app: FastifyInstance,
  orchestrator: Orchestrator,
): void => {
  registerTaskMutationRoute(app, '/api/tasks/:id/delete', (taskId) =>
    orchestrator.deleteTask(taskId, { source: 'user' }),
  )
}
