import { resolve } from 'node:path'

import { readErrorCode } from '../../foundation/shared/error-code.js'
import {
  checkExistingPathBoundary,
  resolveFromRoot,
} from '../../persistence/fs/path-safety.js'
import { readTextFile } from '../../persistence/fs/read-text.js'

import { resolveWorkspaceRootFromStateDir } from './state-dir.js'

import type { AppConfig } from '../../bootstrap/config.js'
import type { FastifyInstance, FastifyReply } from 'fastify'

const MARKDOWN_CONTENT_TYPE = 'text/markdown; charset=utf-8'
const TEXT_CONTENT_TYPE = 'text/plain; charset=utf-8'
const WORKSPACE_FILE_ROUTE = '/api/workspace-file'
const SUPPORTED_WORKSPACE_FILE_EXTENSIONS = [
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.json',
  '.markdown',
  '.md',
  '.mjs',
  '.sh',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
] as const

const isMarkdownPath = (value: string): boolean =>
  /\.(md|markdown)$/i.test(value)

const isSupportedWorkspaceFilePath = (value: string): boolean =>
  SUPPORTED_WORKSPACE_FILE_EXTENSIONS.some((extension) =>
    value.toLowerCase().endsWith(extension),
  )

const resolveWorkspaceFilePath = (
  query: unknown,
  reply: FastifyReply,
): string | undefined => {
  if (typeof query !== 'object' || !query) {
    reply.code(400).send({ error: 'path is required' })
    return undefined
  }
  const { path } = query as { path?: unknown }
  if (typeof path !== 'string' || path.trim().length === 0) {
    reply.code(400).send({ error: 'path is required' })
    return undefined
  }
  return path.trim()
}

export const registerWorkspaceFileRoute = (
  app: FastifyInstance,
  config: AppConfig,
): void => {
  app.get(WORKSPACE_FILE_ROUTE, async (request, reply) => {
    const workspaceRoot = resolveWorkspaceRootFromStateDir(config.workDir)
    if (!workspaceRoot) {
      reply.code(404).send({ error: 'workspace file route unavailable' })
      return
    }

    const rawPath = resolveWorkspaceFilePath(request.query, reply)
    if (!rawPath) return
    if (!isSupportedWorkspaceFilePath(rawPath)) {
      reply.code(400).send({ error: 'unsupported workspace file' })
      return
    }

    const targetPath = resolveFromRoot(workspaceRoot, rawPath)
    const boundary = await checkExistingPathBoundary({
      rootPath: workspaceRoot,
      targetPath,
    })

    if (boundary === 'outside') {
      reply.code(400).send({ error: 'invalid workspace path' })
      return
    }

    if (boundary === 'missing') {
      reply.code(404).send({ error: 'workspace file not found' })
      return
    }

    try {
      const content = await readTextFile(resolve(targetPath))
      reply
        .type(
          isMarkdownPath(targetPath)
            ? MARKDOWN_CONTENT_TYPE
            : TEXT_CONTENT_TYPE,
        )
        .send(content)
    } catch (error) {
      if (readErrorCode(error) === 'ENOENT') {
        reply.code(404).send({ error: 'workspace file not found' })
        return
      }
      throw error
    }
  })
}
