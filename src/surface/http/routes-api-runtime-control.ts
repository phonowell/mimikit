/**
 * @file Runtime control HTTP routes.
 * @description Registers restart/reset endpoints plus the idle gate and structured control-plane logging they require.
 */

import { logSafeError } from '../../persistence/log/safe.js'

import { appendHttpLog, buildHttpRequestContext } from './observability.js'
import { clearStateDir } from './state-dir.js'

import type { AppConfig } from '../../bootstrap/config.js'
import type { Orchestrator } from '../../kernel/orchestrator/orchestrator-service.js'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

const isRuntimeIdleForControlAction = (orchestrator: Orchestrator): boolean => {
  const status = orchestrator.getStatus()
  return (
    status.managerRunning === false &&
    status.activeTasks === 0 &&
    status.pendingTasks === 0
  )
}

const rejectWhenBusy = (
  config: AppConfig,
  request: FastifyRequest,
  reply: FastifyReply,
  orchestrator: Orchestrator,
  action: 'restart' | 'reset',
): boolean => {
  if (isRuntimeIdleForControlAction(orchestrator)) return false
  void appendHttpLog(config.workDir, {
    event: 'http_control_requested',
    action,
    accepted: false,
    reason: 'runtime_busy',
    ...buildHttpRequestContext(request),
  })
  reply.code(409).send({
    error: `${action} requires clear slots: wait for manager to stop and pending/running tasks to clear`,
  })
  return true
}

const clearStateDirSafely = async (
  workDir: string,
  reason: string,
): Promise<void> => {
  try {
    await clearStateDir(workDir)
  } catch (error) {
    await logSafeError(reason, error)
  }
}

const scheduleExit = (
  config: AppConfig,
  orchestrator: Orchestrator,
  params?: {
    afterPersist?: () => Promise<void>
    exitReason?: string
    requestId?: string
  },
): void => {
  void appendHttpLog(config.workDir, {
    event: 'http_runtime_exit_scheduled',
    reason: params?.exitReason ?? 'http_api_restart',
    ...(params?.requestId ? { requestId: params.requestId } : {}),
  })
  setTimeout(() => {
    void (async () => {
      await orchestrator.stopAndPersist()
      const exitLogEntry = {
        event: 'http_runtime_exit_requested',
        reason: params?.exitReason ?? 'http_api_restart',
        ...(params?.requestId ? { requestId: params.requestId } : {}),
      }
      if (params?.afterPersist) {
        await appendHttpLog(config.workDir, exitLogEntry)
        await params.afterPersist()
      } else void appendHttpLog(config.workDir, exitLogEntry)

      orchestrator.requestExit(75, params?.exitReason ?? 'http_api_restart', {
        skipPersist: true,
      })
    })()
  }, 100)
}

export const registerRuntimeControlRoutes = (
  app: FastifyInstance,
  orchestrator: Orchestrator,
  config: AppConfig,
): void => {
  app.post('/api/restart', async (request, reply) => {
    if (rejectWhenBusy(config, request, reply, orchestrator, 'restart')) return
    await appendHttpLog(config.workDir, {
      event: 'http_control_requested',
      action: 'restart',
      accepted: true,
      ...buildHttpRequestContext(request),
    })
    reply.send({ ok: true })
    scheduleExit(config, orchestrator, { requestId: request.id })
  })

  app.post('/api/reset', async (request, reply) => {
    if (rejectWhenBusy(config, request, reply, orchestrator, 'reset')) return
    await appendHttpLog(config.workDir, {
      event: 'http_control_requested',
      action: 'reset',
      accepted: true,
      ...buildHttpRequestContext(request),
    })
    reply.send({ ok: true })
    scheduleExit(config, orchestrator, {
      exitReason: 'http_api_reset',
      requestId: request.id,
      afterPersist: () => clearStateDirSafely(config.workDir, 'http: reset'),
    })
  })
}
