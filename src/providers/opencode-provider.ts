import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'

import { createOpencodeClient } from '@opencode-ai/sdk/v2'

import {
  extractOpencodeOutput,
  mapOpencodeUsage,
  resolveOpencodeModelRef,
} from './opencode-provider-utils.js'

import type {
  OpencodeProviderRequest,
  Provider,
  ProviderResult,
} from './types.js'

const require = createRequire(import.meta.url)
const OPENCODE_ENTRY = require.resolve('opencode-ai/bin/opencode')
const OPENCODE_HOST = '127.0.0.1'

type StartedServer = {
  url: string
  close: () => void
}

const isAbortLikeError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false
  if (error.name === 'AbortError') return true
  return (
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string' &&
    (error as { code: string }).code === 'ABORT_ERR'
  )
}

const unwrapSdkData = <T>(value: T | { data: T }): T => {
  if (
    value &&
    typeof value === 'object' &&
    'data' in value &&
    (value as { data?: T }).data !== undefined
  )
    return (value as { data: T }).data
  return value as T
}

const resolveServerTimeout = (requestTimeoutMs: number): number => {
  if (requestTimeoutMs <= 0) return 5_000
  return Math.max(1_000, Math.min(requestTimeoutMs, 15_000))
}

const parseServerUrl = (line: string): string | undefined => {
  const normalized = line.trim()
  if (!normalized.startsWith('opencode server listening')) return undefined
  const match = normalized.match(/on\s+(https?:\/\/[^\s]+)/)
  return match?.[1]
}

const allocatePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, OPENCODE_HOST, () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('failed to allocate server port')))
        return
      }
      const { port } = address
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve(port)
      })
    })
  })

const startOpencodeServer = async (
  signal: AbortSignal,
  timeoutMs: number,
): Promise<StartedServer> => {
  const port = await allocatePort()
  const args = [
    OPENCODE_ENTRY,
    'serve',
    `--hostname=${OPENCODE_HOST}`,
    `--port=${port}`,
    '--log-level=ERROR',
  ]
  const child = spawn(process.execPath, args, {
    signal,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  })

  return new Promise<StartedServer>((resolve, reject) => {
    let done = false
    let output = ''
    const cleanup = (): void => {
      clearTimeout(timeout)
      child.stdout.removeAllListeners('data')
      child.stderr.removeAllListeners('data')
      child.removeAllListeners('exit')
      signal.removeEventListener('abort', onAbort)
    }
    const fail = (error: Error): void => {
      if (done) return
      done = true
      cleanup()
      reject(error)
    }
    const succeed = (url: string): void => {
      if (done) return
      done = true
      cleanup()
      resolve({
        url,
        close: () => {
          if (!child.killed) child.kill('SIGTERM')
        },
      })
    }
    const onData = (chunk: Buffer | string): void => {
      const text = chunk.toString()
      output += text
      for (const line of text.split('\n')) {
        const url = parseServerUrl(line)
        if (url) {
          succeed(url)
          return
        }
      }
    }
    const onAbort = (): void => fail(new Error('aborted'))

    const timeout = setTimeout(() => {
      fail(new Error(`timeout waiting for server after ${timeoutMs}ms`))
    }, timeoutMs)

    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('error', (error) => {
      if (done && isAbortLikeError(error)) return
      fail(error)
    })
    child.once('exit', (code) => {
      const suffix = output.trim() ? `: ${output.trim()}` : ''
      fail(new Error(`server exited with code ${String(code)}${suffix}`))
    })
    signal.addEventListener('abort', onAbort)
  })
}

const wrapSdkError = (error: unknown): Error => {
  const message = error instanceof Error ? error.message : String(error)
  if (message.startsWith('[provider:opencode]')) return new Error(message)
  return new Error(`[provider:opencode] sdk run failed: ${message}`)
}

const runOpencode = async (
  request: OpencodeProviderRequest,
): Promise<ProviderResult> => {
  const startedAt = Date.now()
  const controller = new AbortController()
  const lifecycle = {
    timedOut: false,
    externallyAborted: false,
  }
  const onAbort = (): void => {
    lifecycle.externallyAborted = true
    controller.abort()
  }

  let timeoutTimer: ReturnType<typeof setTimeout> | undefined
  if (request.timeoutMs > 0) {
    timeoutTimer = setTimeout(() => {
      lifecycle.timedOut = true
      controller.abort()
    }, request.timeoutMs)
  }
  if (request.abortSignal) {
    if (request.abortSignal.aborted) onAbort()
    else request.abortSignal.addEventListener('abort', onAbort)
  }

  let closeServer: (() => void) | undefined
  try {
    const model = resolveOpencodeModelRef(request.model)
    const server = await startOpencodeServer(
      controller.signal,
      resolveServerTimeout(request.timeoutMs),
    )
    closeServer = server.close
    const client = createOpencodeClient({ baseUrl: server.url })

    let sessionID = request.threadId ?? undefined
    if (!sessionID) {
      const created = await client.session.create(
        {
          directory: request.workDir,
        },
        {
          signal: controller.signal,
          responseStyle: 'data',
          throwOnError: true,
        },
      )
      sessionID = unwrapSdkData(created).id
    }
    if (!sessionID) throw new Error('[provider:opencode] missing session id')

    const response = await client.session.prompt(
      {
        sessionID,
        directory: request.workDir,
        model,
        ...(request.modelReasoningEffort
          ? { variant: request.modelReasoningEffort }
          : {}),
        parts: [{ type: 'text', text: request.prompt }],
      },
      {
        signal: controller.signal,
        responseStyle: 'data',
        throwOnError: true,
      },
    )
    const promptResponse = unwrapSdkData(response)

    const usage = mapOpencodeUsage(promptResponse.info)
    if (usage) request.onUsage?.(usage)
    return {
      output: extractOpencodeOutput(promptResponse.parts),
      elapsedMs: Math.max(0, Date.now() - startedAt),
      ...(usage ? { usage } : {}),
      threadId: sessionID,
    }
  } catch (error) {
    if (lifecycle.timedOut) {
      throw new Error(
        `[provider:opencode] timed out after ${request.timeoutMs}ms`,
      )
    }
    if (lifecycle.externallyAborted || controller.signal.aborted)
      throw new Error('[provider:opencode] aborted')
    throw wrapSdkError(error)
  } finally {
    clearTimeout(timeoutTimer)
    if (request.abortSignal)
      request.abortSignal.removeEventListener('abort', onAbort)
    if (closeServer) closeServer()
  }
}

export const opencodeProvider: Provider<OpencodeProviderRequest> = {
  id: 'opencode',
  run: runOpencode,
}
