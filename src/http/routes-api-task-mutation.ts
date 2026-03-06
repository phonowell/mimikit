import { resolveRouteId } from './route-params.js'

import type { FastifyInstance } from 'fastify'

type TaskMutationResult = {
  ok: boolean
  id: string
  status: string
  changeAt?: string
}

const resolveTaskMutationErrorCode = (status: string): number => {
  if (status === 'not_found') return 404
  if (status === 'invalid') return 400
  return 409
}

const toTaskMutationPayload = (result: TaskMutationResult) => ({
  ok: result.ok,
  id: result.id,
  status: result.status,
  ...(result.changeAt ? { changeAt: result.changeAt } : {}),
})

export const registerTaskMutationRoute = (
  app: FastifyInstance,
  path: string,
  mutateTask: (taskId: string) => Promise<TaskMutationResult>,
): void => {
  app.post(path, async (request, reply) => {
    const taskId = resolveRouteId(request.params, reply, 'task')
    if (!taskId) return

    const result = await mutateTask(taskId)
    if (!result.ok) {
      reply.code(resolveTaskMutationErrorCode(result.status)).send({
        ...toTaskMutationPayload(result),
        error: result.status,
      })
      return
    }

    reply.send(toTaskMutationPayload(result))
  })
}
