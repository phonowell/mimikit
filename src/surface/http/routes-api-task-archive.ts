import { resolve } from 'node:path'

import { readErrorCode } from '../../foundation/shared/error-code.js'
import { checkExistingPathBoundary } from '../../persistence/fs/path-safety.js'
import { readTextFile } from '../../persistence/fs/read-text.js'
import { buildArchiveDocument } from '../../persistence/storage/archive-format.js'
import { readTaskExecutionSpec } from '../../work/spec/store.js'

import { resolveRouteId } from './route-params.js'

import type { AppConfig } from '../../bootstrap/config.js'
import type { Task } from '../../foundation/types/index.js'
import type { Orchestrator } from '../../kernel/orchestrator/orchestrator-service.js'
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

const buildLiveArchive = async (
  stateDir: string,
  task: Task,
  liveOutput?: string,
): Promise<string> => {
  const spec = await readTaskExecutionSpec(stateDir, task.executionSpecId)
  const usage = task.result?.usage ?? task.usage
  const cancel = task.result?.cancel ?? task.cancel
  const resultStatus = task.result?.status ?? task.status
  const resultDuration = task.result?.durationMs ?? task.durationMs
  const resultOutput = task.result?.output.trim()
  const liveSnapshot = liveOutput?.trim()
  const result =
    resultOutput && resultOutput.length > 0
      ? resultOutput
      : liveSnapshot && liveSnapshot.length > 0
        ? liveSnapshot
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
      ['task_status', task.result?.taskStatus ?? task.status],
      ['outcome', task.result?.outcome],
      ['stop_reason', task.result?.stopReason],
      ['created_at', task.createdAt],
      ['started_at', task.startedAt],
      ['completed_at', task.result?.completedAt ?? task.completedAt],
      ['duration_ms', resultDuration],
      ['usage', usage ? JSON.stringify(usage) : undefined],
      ['trace_path', task.result?.traceRef],
      ['cancel_source', cancel?.source],
      ['cancel_reason', cancel?.reason],
    ],
    [
      {
        marker: '=== PROMPT ===',
        content: spec.prompt.trim() || '(empty prompt)',
      },
      { marker: '=== RESULT ===', content: result },
    ],
  )
}

const sendLiveArchive = async (
  reply: FastifyReply,
  stateDir: string,
  task: Task,
  liveOutput?: string,
): Promise<void> => {
  reply
    .type(MARKDOWN_CONTENT_TYPE)
    .send(await buildLiveArchive(stateDir, task, liveOutput))
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

    const liveOutput = orchestrator.getTaskLiveOutput(resolved.task.id)
    const archivePath =
      resolved.task.archivePath ?? resolved.task.result?.archivePath
    if (!archivePath) {
      await sendLiveArchive(reply, config.workDir, resolved.task, liveOutput)
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
      await sendLiveArchive(reply, config.workDir, resolved.task, liveOutput)
      return
    }

    try {
      const content = await readTextFile(resolvedArchivePath)
      if (!content) {
        await sendLiveArchive(reply, config.workDir, resolved.task, liveOutput)
        return
      }
      reply.type(MARKDOWN_CONTENT_TYPE).send(content)
    } catch (error) {
      if (readErrorCode(error) === 'ENOENT') {
        await sendLiveArchive(reply, config.workDir, resolved.task, liveOutput)
        return
      }
      throw error
    }
  })
}
