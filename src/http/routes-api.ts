import { readFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'

import {
  appendRuntimeSignalFeedback,
  appendStructuredFeedback,
  resetEvolveFeedbackState,
} from '../evolve/feedback.js'
import { logSafeError } from '../log/safe.js'
import { newId, nowIso } from '../shared/utils.js'

import {
  clearStateDir,
  parseExportLimit,
  parseFeedbackBody,
  parseInputBody,
  parseMessageLimit,
  parseTaskLimit,
} from './helpers.js'
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

const registerTaskArchiveRoute = (
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

const registerTaskCancelRoute = (
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

const registerControlRoutes = (
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

const registerMessagesExportRoute = (
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

export const registerApiRoutes = (
  app: FastifyInstance,
  supervisor: Supervisor,
  config: SupervisorConfig,
): void => {
  app.get('/api/status', () => supervisor.getStatus())

  app.post('/api/input', async (request, reply) => {
    const result = parseInputBody(request.body, {
      remoteAddress: request.raw.socket.remoteAddress ?? undefined,
      userAgent:
        typeof request.headers['user-agent'] === 'string'
          ? request.headers['user-agent']
          : undefined,
      acceptLanguage:
        typeof request.headers['accept-language'] === 'string'
          ? request.headers['accept-language']
          : undefined,
    })
    if ('error' in result) {
      reply.code(400).send({ error: result.error })
      return
    }
    const id = await supervisor.addUserInput(
      result.text,
      result.meta,
      result.quote,
    )
    reply.send({ id })
  })

  app.post('/api/feedback', async (request, reply) => {
    const result = parseFeedbackBody(request.body)
    if ('error' in result) {
      reply.code(400).send({ error: result.error })
      return
    }
    const id = newId()
    await appendStructuredFeedback({
      stateDir: config.stateDir,
      feedback: {
        id,
        createdAt: nowIso(),
        kind: 'user_feedback',
        severity: result.severity,
        message: result.message,
        source: 'api_feedback',
        ...(result.context ? { context: result.context } : {}),
      },
      extractedIssue: {
        kind: 'issue',
        issue: {
          title: result.message,
          category: 'quality',
          confidence: 0.9,
          action: result.severity === 'low' ? 'defer' : 'fix',
          rationale: 'explicit api feedback',
        },
      },
    })
    await supervisor.logEvent({
      event: 'feedback_received',
      feedbackId: id,
      severity: result.severity,
      remote: request.raw.socket.remoteAddress ?? undefined,
      hasContext: Boolean(result.context),
    })
    reply.send({ ok: true, id })
  })

  app.post('/api/evolve/code', async (request, reply) => {
    await resetEvolveFeedbackState(config.stateDir)
    const { id } = await appendRuntimeSignalFeedback({
      stateDir: config.stateDir,
      severity: 'high',
      message:
        'run self-evolution code round: identify highest ROI gap and apply minimal validated code change',
      extractedIssue: {
        kind: 'issue',
        issue: {
          title:
            'run self-evolution code round: identify highest ROI gap and apply minimal validated code change',
          category: 'quality',
          confidence: 0.9,
          roiScore: 80,
          action: 'fix',
          rationale: 'explicit manual trigger',
          fingerprint: 'manual_code_evolve_trigger',
        },
      },
      context: {
        note: 'code_evolve_required',
      },
    })
    await supervisor.logEvent({
      event: 'code_evolve_requested',
      feedbackId: id,
      remote: request.raw.socket.remoteAddress ?? undefined,
    })
    reply.send({ ok: true, id })
  })

  app.get('/api/messages', async (request) => {
    const query = request.query as Record<string, unknown> | undefined
    const limit = parseMessageLimit(query?.limit)
    const messages = await supervisor.getChatHistory(limit)
    return { messages }
  })

  registerMessagesExportRoute(app, supervisor)

  app.get('/api/tasks', (request) => {
    const query = request.query as Record<string, unknown> | undefined
    const limit = parseTaskLimit(query?.limit)
    return supervisor.getTasks(limit)
  })

  registerTaskArchiveRoute(app, supervisor, config)
  registerTaskCancelRoute(app, supervisor)
  registerControlRoutes(app, supervisor, config)
}

export const registerNotFoundHandler = (app: FastifyInstance): void => {
  app.setNotFoundHandler((request, reply) => {
    if (request.method === 'GET') {
      reply.code(404).type('text/plain').send('Not Found')
      return
    }
    reply.code(404).send({ error: 'not found' })
  })
}
