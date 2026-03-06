import { resolve } from 'node:path'

import { checkExistingPathBoundary } from '../fs/path-safety.js'
import { readTextFile } from '../fs/read-text.js'
import { readErrorCode } from '../shared/error-code.js'
import { buildArchiveDocument } from '../storage/archive-format.js'

import { resolveRouteId } from './route-params.js'

import type { AppConfig } from '../config.js'
import type { Orchestrator } from '../orchestrator/core/orchestrator-service.js'
import type { Task } from '../types/index.js'
import type { FastifyInstance, FastifyReply } from 'fastify'

const MARKDOWN_CONTENT_TYPE = 'text/markdown; charset=utf-8'

const resolveTaskArchiveTarget = (
  params: unknown,
  reply: FastifyReply,
  orchestrator: Orchestrator,
): { taskId: string; task: Task } | undefined => {
  const taskId = resolveRouteId(params, reply, 'task')
  if (!taskId) return
  const task = orchestrator.getTaskById(taskId)
  if (task) return { taskId, task }
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
        : task.status === 'paused'
          ? 'Task is paused. Final archive is not available yet.'
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
    const resolved = resolveTaskArchiveTarget(
      request.params,
      reply,
      orchestrator,
    )
    if (!resolved) return

    const archivePath =
      resolved.task.archivePath ?? resolved.task.result?.archivePath
    if (!archivePath) {
      sendLiveArchive(reply, resolved.task)
      return
    }

    const resolvedWorkDir = resolve(config.workDir)
    const resolvedArchivePath = resolve(archivePath)
    const boundary = await checkExistingPathBoundary({
      rootPath: resolvedWorkDir,
      targetPath: resolvedArchivePath,
    })

    if (boundary === 'outside') {
      reply.code(400).send({ error: 'invalid archive path' })
      return
    }

    if (boundary === 'missing') {
      sendLiveArchive(reply, resolved.task)
      return
    }

    try {
      const content = await readTextFile(resolvedArchivePath)
      if (!content) {
        sendLiveArchive(reply, resolved.task)
        return
      }
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
