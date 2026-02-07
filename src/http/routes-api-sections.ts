import { readFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'

import { logSafeError } from '../log/safe.js'

import { clearStateDir, parseExportLimit } from './helpers.js'
import {
  buildMessagesExportFilename,
  buildMessagesMarkdownExport,
} from './messages-export.js'

import type { SupervisorConfig } from '../config.js'
import type { Supervisor } from '../supervisor/supervisor.js'
import type { FastifyInstance } from 'fastify'

const isWithinRoot = (root: string, path: string): boolean => {
  const rel = relative(root, path)
  if (!rel) return true
  if (rel.startsWith('..')) return false
  return !isAbsolute(rel)
}

export const registerTaskArchiveRoute = (
  app: FastifyInstance,
  supervisor: Supervisor,
  config: SupervisorConfig,
): void => {
  app.get('/api/tasks/:id/archive', async (request, reply) => {
    const params = request.params as { id?: string } | undefined
    const taskId = typeof params?.id === 'string' ? params.id.trim() : ''
    if (!taskId) {
      reply.code(400).send({ error: 'task id is required' })
      return
    }
    const task = supervisor.getTaskById(taskId)
    if (!task) {
      reply.code(404).send({ error: 'task not found' })
      return
    }
    const archivePath = task.archivePath ?? task.result?.archivePath
    if (!archivePath) {
      reply.code(404).send({ error: 'task archive not found' })
      return
    }
    const resolvedStateDir = resolve(config.stateDir)
    const resolvedArchivePath = resolve(archivePath)
    if (!isWithinRoot(resolvedStateDir, resolvedArchivePath)) {
      reply.code(400).send({ error: 'invalid archive path' })
      return
    }
    try {
      const content = await readFile(resolvedArchivePath, 'utf8')
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

export const registerTaskCancelRoute = (
  app: FastifyInstance,
  supervisor: Supervisor,
): void => {
  app.post('/api/tasks/:id/cancel', async (request, reply) => {
    const params = request.params as { id?: string } | undefined
    const taskId = typeof params?.id === 'string' ? params.id.trim() : ''
    if (!taskId) {
      reply.code(400).send({ error: 'task id is required' })
      return
    }
    const cancelResult = await supervisor.cancelTask(taskId, { source: 'http' })
    if (!cancelResult.ok) {
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
  supervisor: Supervisor,
  config: SupervisorConfig,
): void => {
  app.post('/api/restart', (_request, reply) => {
    reply.send({ ok: true })
    setTimeout(() => {
      void (async () => {
        await supervisor.stopAndPersist()
        process.exit(75)
      })()
    }, 100)
  })

  app.post('/api/reset', (_request, reply) => {
    reply.send({ ok: true })
    setTimeout(() => {
      void (async () => {
        await supervisor.stopAndPersist()
        try {
          await clearStateDir(config.stateDir)
        } catch (error) {
          await logSafeError('http: reset', error)
        }
        process.exit(75)
      })()
    }, 100)
  })
}

export const registerMessagesExportRoute = (
  app: FastifyInstance,
  supervisor: Supervisor,
): void => {
  app.get('/api/messages/export', async (request, reply) => {
    const query = request.query as Record<string, unknown> | undefined
    const limit = parseExportLimit(query?.limit)
    const messages = await supervisor.getChatHistory(limit)
    const exportedAt = new Date().toISOString()
    const markdown = buildMessagesMarkdownExport({
      messages,
      exportedAt,
      limit,
    })
    const filename = buildMessagesExportFilename(exportedAt)
    reply.header('Content-Disposition', `attachment; filename="${filename}"`)
    reply.type('text/markdown; charset=utf-8').send(markdown)
  })
}
