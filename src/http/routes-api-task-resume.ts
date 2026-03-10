import { registerTaskMutationRoute } from './routes-api-task-mutation.js'

import type { Orchestrator } from '../orchestrator/core/orchestrator-service.js'
import type { FastifyInstance } from 'fastify'

export const registerTaskResumeRoute = (
  app: FastifyInstance,
  orchestrator: Orchestrator,
): void => {
  app.post('/api/tasks/resume-recoverable', async (_request, reply) => {
    reply.send(await orchestrator.resumeRecoverableTasks())
  })

  registerTaskMutationRoute(app, '/api/tasks/:id/resume', (taskId) =>
    orchestrator.resumeTask(taskId, { source: 'user' }),
  )
}
