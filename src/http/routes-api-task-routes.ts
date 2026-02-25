import { isAbsolute, relative, resolve } from 'node:path'

import read from 'fire-keeper/read'

import { buildArchiveDocument } from '../storage/archive-format.js'

import type { AppConfig } from '../config.js'
import type { Orchestrator } from '../orchestrator/core/orchestrator-service.js'
import type { CronJob, Task } from '../types/index.js'
import type { FastifyInstance, FastifyReply } from 'fastify'

const MARKDOWN_CONTENT_TYPE = 'text/markdown; charset=utf-8'

const resolveRouteId = (
  params: unknown,
  reply: FastifyReply,
  field: 'task',
): string | undefined => {
  const id =
    params && typeof params === 'object' && 'id' in params
      ? (params as { id?: unknown }).id
      : undefined
  const value = typeof id === 'string' ? id.trim() : ''
  if (value) return value
  reply.code(400).send({ error: `${field} id is required` })
  return undefined
}

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

const resolveTaskArchiveTarget = (
  params: unknown,
  reply: FastifyReply,
  orchestrator: Orchestrator,
):
  | { kind: 'task'; taskId: string; task: Task }
  | { kind: 'cron'; taskId: string; cronJob: CronJob }
  | undefined => {
  const taskId = resolveRouteId(params, reply, 'task')
  if (!taskId) return
  const task = orchestrator.getTaskById(taskId)
  if (task) return { kind: 'task', taskId, task }
  const cronJob = orchestrator.getCronJobs().find((job) => job.id === taskId)
  if (cronJob) return { kind: 'cron', taskId, cronJob }
  reply.code(404).send({ error: 'task not found' })
  return undefined
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

const resolveCronStatus = (cronJob: CronJob): Task['status'] => {
  if (cronJob.enabled) return 'pending'
  if (cronJob.disabledReason === 'completed') return 'succeeded'
  if (cronJob.disabledReason === 'canceled') return 'canceled'
  if (cronJob.lastTriggeredAt) return 'succeeded'
  return 'canceled'
}

const buildCronArchive = (cronJob: CronJob): string => {
  const schedule = cronJob.cron ?? cronJob.scheduledAt
  const result = cronJob.enabled
    ? 'Cron task is waiting for next trigger.'
    : cronJob.disabledReason === 'canceled'
      ? 'Cron task was canceled by user or system.'
      : 'Cron task is completed or inactive.'
  return buildArchiveDocument(
    [
      ['task_id', cronJob.id],
      ['kind', 'cron'],
      ['title', cronJob.title],
      ['status', resolveCronStatus(cronJob)],
      ['created_at', cronJob.createdAt],
      ['last_triggered_at', cronJob.lastTriggeredAt],
      ['schedule', schedule],
      ['profile', cronJob.profile],
      ['enabled', String(cronJob.enabled)],
      ['disabled_reason', cronJob.disabledReason],
    ],
    [
      {
        marker: '=== PROMPT ===',
        content: cronJob.prompt.trim() || '(empty prompt)',
      },
      { marker: '=== RESULT ===', content: result },
    ],
  )
}

const sendCronArchive = (reply: FastifyReply, cronJob: CronJob): void => {
  reply.type(MARKDOWN_CONTENT_TYPE).send(buildCronArchive(cronJob))
}

export const registerTaskArchiveRoute = (
  app: FastifyInstance,
  orchestrator: Orchestrator,
  config: AppConfig,
): void => {
  app.get('/api/tasks/:id/archive', async (request, reply) => {
    const resolved = resolveTaskArchiveTarget(
      request.params,
      reply,
      orchestrator,
    )
    if (!resolved) return
    if (resolved.kind === 'cron') {
      sendCronArchive(reply, resolved.cronJob)
      return
    }

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
