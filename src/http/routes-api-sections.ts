import { isAbsolute, relative, resolve } from 'node:path'

import read from 'fire-keeper/read'

import { logSafeError } from '../log/safe.js'
import { readTaskProgress } from '../storage/task-progress.js'

import { clearStateDir } from './helpers.js'

import type { AppConfig } from '../config.js'
import type { Orchestrator } from '../orchestrator/core/orchestrator-service.js'
import type { Task } from '../types/index.js'
import type { FastifyInstance, FastifyReply } from 'fastify'

const isWithinRoot = (root: string, path: string): boolean => {
  const rel = relative(root, path)
  if (!rel) return true
  if (rel.startsWith('..')) return false
  return !isAbsolute(rel)
}

const resolveTaskId = (
  params: unknown,
  reply: FastifyReply,
): string | undefined => {
  const id =
    params && typeof params === 'object' && 'id' in params
      ? (params as { id?: unknown }).id
      : undefined
  const taskId = typeof id === 'string' ? id.trim() : ''
  if (taskId) return taskId
  reply.code(400).send({ error: 'task id is required' })
  return undefined
}

const resolveTask = (
  params: unknown,
  reply: FastifyReply,
  orchestrator: Orchestrator,
): { taskId: string; task: Task } | undefined => {
  const taskId = resolveTaskId(params, reply)
  if (!taskId) return undefined
  const task = orchestrator.getTaskById(taskId)
  if (!task) {
    reply.code(404).send({ error: 'task not found' })
    return undefined
  }
  return { taskId, task }
}

export const registerTaskArchiveRoute = (
  app: FastifyInstance,
  orchestrator: Orchestrator,
  config: AppConfig,
): void => {
  app.get('/api/tasks/:id/archive', async (request, reply) => {
    const resolved = resolveTask(request.params, reply, orchestrator)
    if (!resolved) return
    const { task } = resolved
    const archivePath = task.archivePath ?? task.result?.archivePath
    if (!archivePath) {
      reply.code(404).send({ error: 'task archive not found' })
      return
    }
    const resolvedWorkDir = resolve(config.workDir)
    const resolvedArchivePath = resolve(archivePath)
    if (!isWithinRoot(resolvedWorkDir, resolvedArchivePath)) {
      reply.code(400).send({ error: 'invalid archive path' })
      return
    }
    try {
      const raw = await read(resolvedArchivePath, { raw: true, echo: false })
      if (!raw) {
        reply.code(404).send({ error: 'task archive not found' })
        return
      }
      const content =
        typeof raw === 'string'
          ? raw
          : Buffer.isBuffer(raw)
            ? raw.toString('utf8')
            : ''
      reply.type('text/markdown; charset=utf-8').send(content)
    } catch (error) {
      const code =
        typeof error === 'object' && error && 'code' in error
          ? String((error as { code?: string }).code)
          : undefined
      if (code === 'ENOENT') {
        reply.code(404).send({ error: 'task archive not found' })
        return
      }
      throw error
    }
  })
}

export const registerTaskProgressRoute = (
  app: FastifyInstance,
  orchestrator: Orchestrator,
  config: AppConfig,
): void => {
  app.get('/api/tasks/:id/progress', async (request, reply) => {
    const resolved = resolveTask(request.params, reply, orchestrator)
    if (!resolved) return
    const { taskId } = resolved
    const events = await readTaskProgress(config.workDir, taskId)
    reply.send({ taskId, events })
  })
}

export const registerTaskCancelRoute = (
  app: FastifyInstance,
  orchestrator: Orchestrator,
): void => {
  app.post('/api/tasks/:id/cancel', async (request, reply) => {
    const taskId = resolveTaskId(request.params, reply)
    if (!taskId) return
    const cancelResult = await orchestrator.cancelTask(taskId, {
      source: 'user',
    })
    if (!cancelResult.ok) {
      if (cancelResult.status === 'not_found') {
        const canceledCron = await orchestrator.cancelCronJob(taskId)
        if (canceledCron) {
          reply.send({ ok: true, status: 'canceled', taskId })
          return
        }
      }
      const status =
        cancelResult.status === 'not_found'
          ? 404
          : cancelResult.status === 'invalid'
            ? 400
            : 409
      reply.code(status).send({ error: cancelResult.status })
      return
    }
    reply.send({ ok: true, status: cancelResult.status, taskId })
  })
}

export const registerControlRoutes = (
  app: FastifyInstance,
  orchestrator: Orchestrator,
  config: AppConfig,
): void => {
  app.post('/api/restart', (_request, reply) => {
    reply.send({ ok: true })
    setTimeout(() => {
      void (async () => {
        await orchestrator.stopAndPersist()
        process.exit(75)
      })()
    }, 100)
  })

  app.post('/api/reset', (_request, reply) => {
    reply.send({ ok: true })
    setTimeout(() => {
      void (async () => {
        await orchestrator.stopAndPersist()
        try {
          await clearStateDir(config.workDir)
        } catch (error) {
          await logSafeError('http: reset', error)
        }
        process.exit(75)
      })()
    }, 100)
  })
}
