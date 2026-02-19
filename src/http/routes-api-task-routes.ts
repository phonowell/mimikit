import { isAbsolute, relative, resolve } from 'node:path'

import read from 'fire-keeper/read'

import { buildArchiveDocument } from '../storage/archive-format.js'
import { readTaskProgress } from '../storage/task-progress.js'

import { resolveRouteId } from './routes-api-route-id.js'

import type { AppConfig } from '../config.js'
import type { Orchestrator } from '../orchestrator/core/orchestrator-service.js'
import type { Task } from '../types/index.js'
import type { FastifyInstance, FastifyReply } from 'fastify'

const MARKDOWN_CONTENT_TYPE = 'text/markdown; charset=utf-8'

const isWithinRoot = (root: string, path: string): boolean => {
  const rel = relative(root, path)
  if (!rel) return true
  if (rel.startsWith('..')) return false
  return !isAbsolute(rel)
}

const readErrorCode = (error: unknown): string | undefined =>
  typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined

const resolveTask = (
  params: unknown,
  reply: FastifyReply,
  orchestrator: Orchestrator,
): { taskId: string; task: Task } | undefined => {
  const taskId = resolveRouteId(params, reply, 'task')
  if (!taskId) return
  const task = orchestrator.getTaskById(taskId)
  if (!task) {
    reply.code(404).send({ error: 'task not found' })
    return
  }
  return { taskId, task }
}

const buildLiveArchive = (task: Task): string => {
  const usage = task.result?.usage ?? task.usage
  const cancel = task.result?.cancel ?? task.cancel
  const resultStatus = task.result?.status ?? task.status
  const resultDuration = task.result?.durationMs ?? task.durationMs
  const resultOutput = task.result?.output.trim()
  const result =
    resultOutput && resultOutput.length > 0
      ? resultOutput
      : task.status === 'pending'
        ? 'Task is queued. Final archive is not available yet.'
        : task.status === 'running'
          ? 'Task is running. Final archive is not available yet.'
          : 'Task archive file is missing. Showing live snapshot.'

  return buildArchiveDocument(
    [
      ['task_id', task.id],
      ['title', task.title],
      ['status', resultStatus],
      ['created_at', task.createdAt],
      ['started_at', task.startedAt],
      ['completed_at', task.result?.completedAt ?? task.completedAt],
      ['duration_ms', resultDuration],
      ['usage', usage ? JSON.stringify(usage) : undefined],
      ['cancel_source', cancel?.source],
      ['cancel_reason', cancel?.reason],
    ],
    [
      {
        marker: '=== PROMPT ===',
        content: task.prompt.trim() || '(empty prompt)',
      },
      { marker: '=== RESULT ===', content: result },
    ],
  )
}

const sendLiveArchive = (reply: FastifyReply, task: Task): void => {
  reply.type(MARKDOWN_CONTENT_TYPE).send(buildLiveArchive(task))
}

export const registerTaskArchiveRoute = (
  app: FastifyInstance,
  orchestrator: Orchestrator,
  config: AppConfig,
): void => {
  app.get('/api/tasks/:id/archive', async (request, reply) => {
    const resolved = resolveTask(request.params, reply, orchestrator)
    if (!resolved) return

    const archivePath =
      resolved.task.archivePath ?? resolved.task.result?.archivePath
    if (!archivePath) {
      sendLiveArchive(reply, resolved.task)
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
        sendLiveArchive(reply, resolved.task)
        return
      }
      const content =
        typeof raw === 'string'
          ? raw
          : Buffer.isBuffer(raw)
            ? raw.toString('utf8')
            : ''
      reply.type(MARKDOWN_CONTENT_TYPE).send(content)
    } catch (error) {
      if (readErrorCode(error) === 'ENOENT') {
        sendLiveArchive(reply, resolved.task)
        return
      }
      throw error
    }
  })
}

export const registerTaskCancelRoute = (
  app: FastifyInstance,
  orchestrator: Orchestrator,
): void => {
  app.post('/api/tasks/:id/cancel', async (request, reply) => {
    const taskId = resolveRouteId(request.params, reply, 'task')
    if (!taskId) return

    const result = await orchestrator.cancelTask(taskId, { source: 'user' })
    if (!result.ok) {
      if (result.status === 'not_found') {
        const canceledCron = await orchestrator.cancelCronJob(taskId)
        if (canceledCron) {
          reply.send({ ok: true, status: 'canceled', taskId })
          return
        }
      }
      const status =
        result.status === 'not_found'
          ? 404
          : result.status === 'invalid'
            ? 400
            : 409
      reply.code(status).send({ error: result.status })
      return
    }

    reply.send({ ok: true, status: result.status, taskId })
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
    const events = await readTaskProgress(config.workDir, resolved.taskId)
    reply.send({ taskId: resolved.taskId, events })
  })
}
