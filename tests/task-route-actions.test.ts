import fastify from 'fastify'
import { expect, test, vi } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { registerApiRoutes } from '../src/http/routes-api.js'
import { createOrchestratorStub } from './helpers/orchestrator-stub.js'

type ActionName = 'cancel' | 'delete' | 'pause' | 'resume'

type SuccessStatus = 'canceled' | 'deleted' | 'paused' | 'pending'
type ErrorStatus = 'not_found' | 'already_paused' | 'active_task'

type ActionSuccessCase = {
  action: ActionName
  taskId: string
  status: SuccessStatus
  changeAt: string
}

type ActionErrorCase = {
  action: ActionName
  taskId: string
  status: ErrorStatus
  statusCode: number
}

type TaskActionHandler = (
  action: ActionName,
  taskId: string,
  meta?: { source?: string; reason?: string },
) => Promise<unknown>

const bindActionHandler = (orchestrator: unknown, handler: TaskActionHandler): void => {
  ;(orchestrator as { mutateTask: TaskActionHandler }).mutateTask = handler
}

const successCases: ActionSuccessCase[] = [
  {
    action: 'cancel',
    taskId: 'task-user-cancel',
    status: 'canceled',
    changeAt: '2026-03-06T05:00:00.000Z',
  },
  {
    action: 'delete',
    taskId: 'task-user-delete',
    status: 'deleted',
    changeAt: '2026-03-06T06:20:00.000Z',
  },
  {
    action: 'pause',
    taskId: 'task-user-pause',
    status: 'paused',
    changeAt: '2026-03-06T06:00:00.000Z',
  },
  {
    action: 'resume',
    taskId: 'task-user-resume',
    status: 'pending',
    changeAt: '2026-03-06T06:10:00.000Z',
  },
]

const errorCases: ActionErrorCase[] = [
  {
    action: 'cancel',
    taskId: 'task-user-missing',
    status: 'not_found',
    statusCode: 404,
  },
  {
    action: 'pause',
    taskId: 'task-user-paused',
    status: 'already_paused',
    statusCode: 409,
  },
  {
    action: 'delete',
    taskId: 'task-user-active',
    status: 'active_task',
    statusCode: 409,
  },
]

test('task action routes return id/status/changeAt for user action success', async () => {
  for (const item of successCases) {
    const app = fastify()
    const { orchestrator } = createOrchestratorStub()
    const actionHandler = vi.fn(async () => ({
      ok: true as const,
      id: item.taskId,
      status: item.status,
      changeAt: item.changeAt,
    }))
    bindActionHandler(orchestrator, actionHandler)
    const config = defaultConfig({ workDir: '.mimikit' })
    registerApiRoutes(app, orchestrator, config)

    const response = await app.inject({
      method: 'POST',
      url: `/api/tasks/${item.taskId}/${item.action}`,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      ok: true,
      id: item.taskId,
      status: item.status,
      changeAt: item.changeAt,
    })
    expect(actionHandler).toHaveBeenCalledWith(item.action, item.taskId, {
      source: 'user',
    })
    await app.close()
  }
})

test('task action routes keep id/status in error payload', async () => {
  for (const item of errorCases) {
    const app = fastify()
    const { orchestrator } = createOrchestratorStub()
    const actionHandler = vi.fn(async () => ({
      ok: false as const,
      id: item.taskId,
      status: item.status,
    }))
    bindActionHandler(orchestrator, actionHandler)
    const config = defaultConfig({ workDir: '.mimikit' })
    registerApiRoutes(app, orchestrator, config)

    const response = await app.inject({
      method: 'POST',
      url: `/api/tasks/${item.taskId}/${item.action}`,
    })

    expect(response.statusCode).toBe(item.statusCode)
    expect(response.json()).toEqual({
      ok: false,
      id: item.taskId,
      status: item.status,
      error: item.status,
    })
    expect(actionHandler).toHaveBeenCalledWith(item.action, item.taskId, {
      source: 'user',
    })
    await app.close()
  }
})

test('task delete route returns active_task as conflict', async () => {
  const app = fastify()
  const { orchestrator } = createOrchestratorStub()
  const actionHandler = vi.fn(async () => ({
    ok: false as const,
    id: 'task-user-active-delete',
    status: 'active_task' as const,
  }))
  bindActionHandler(orchestrator, actionHandler)
  const config = defaultConfig({ workDir: '.mimikit' })
  registerApiRoutes(app, orchestrator, config)

  const response = await app.inject({
    method: 'POST',
    url: '/api/tasks/task-user-active-delete/delete',
  })

  expect(response.statusCode).toBe(409)
  expect(response.json()).toEqual({
    ok: false,
    id: 'task-user-active-delete',
    status: 'active_task',
    error: 'active_task',
  })
  expect(actionHandler).toHaveBeenCalledWith(
    'delete',
    'task-user-active-delete',
    { source: 'user' },
  )
  await app.close()
})
