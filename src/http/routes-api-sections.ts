import { isAbsolute, relative, resolve } from 'node:path'

import read from 'fire-keeper/read'

import { logSafeError } from '../log/safe.js'
import { buildArchiveDocument } from '../storage/archive-format.js'
import {
  readTaskProgress,
  type TaskProgressEvent,
} from '../storage/task-progress.js'

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

const readErrorCode = (error: unknown): string | undefined =>
  typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined

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
  if (!taskId) return
  const task = orchestrator.getTaskById(taskId)
  if (!task) {
    reply.code(404).send({ error: 'task not found' })
    return
  }
  return { taskId, task }
}

const MARKDOWN_CONTENT_TYPE = 'text/markdown; charset=utf-8'

const hasText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

const formatProgressEvents = (events: TaskProgressEvent[]): string => {
  if (events.length === 0) return ''
  return events
    .map((event) => {
      const payloadKeys = Object.keys(event.payload)
      const payloadText =
        payloadKeys.length > 0 ? ` ${JSON.stringify(event.payload)}` : ''
      return `- ${event.createdAt} · ${event.type}${payloadText}`
    })
    .join('\n')
}

const buildLiveArchiveResult = (
  task: Task,
  progressEvents: TaskProgressEvent[],
): string => {
  if (hasText(task.result?.output)) return task.result.output
  const statusText =
    task.status === 'pending'
      ? 'Task is queued. Final archive is not available yet.'
      : task.status === 'running'
        ? 'Task is running. Final archive is not available yet.'
        : 'Task archive file is missing. Showing live snapshot.'
  const progressText = formatProgressEvents(progressEvents)
  if (!progressText) return statusText
  return `${statusText}\n\n=== PROGRESS ===\n${progressText}`
}

const buildLiveTaskArchive = (
  task: Task,
  progressEvents: TaskProgressEvent[],
): string => {
  const usage = task.result?.usage ?? task.usage
  const cancel = task.result?.cancel ?? task.cancel
  const resultStatus = task.result?.status ?? task.status
  const resultDuration = task.result?.durationMs ?? task.durationMs
  const promptText = hasText(task.prompt) ? task.prompt : '(empty prompt)'
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
      { marker: '=== PROMPT ===', content: promptText },
      {
        marker: '=== RESULT ===',
        content: buildLiveArchiveResult(task, progressEvents),
      },
    ],
  )
}

const sendLiveArchive = async (
  reply: FastifyReply,
  task: Task,
  taskId: string,
  stateDir: string,
): Promise<void> => {
  const progressEvents = await readTaskProgress(stateDir, taskId)
  const content = buildLiveTaskArchive(task, progressEvents)
  reply.type(MARKDOWN_CONTENT_TYPE).send(content)
}

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
      await sendLiveArchive(
        reply,
        resolved.task,
        resolved.taskId,
        config.workDir,
      )
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
        await sendLiveArchive(
          reply,
          resolved.task,
          resolved.taskId,
          config.workDir,
        )
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
        await sendLiveArchive(
          reply,
          resolved.task,
          resolved.taskId,
          config.workDir,
        )
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
    const events = await readTaskProgress(config.workDir, resolved.taskId)
    reply.send({ taskId: resolved.taskId, events })
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
