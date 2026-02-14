import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'

import { createOpencodeClient } from '@opencode-ai/sdk/v2'
import CircuitBreaker from 'opossum'
import pRetry from 'p-retry'

import {
  extractOpencodeOutput,
  mapOpencodeUsage,
  mapOpencodeUsageFromEvent,
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
const PREFLIGHT_CACHE_MS = 30_000
const RETRY_MAX_ATTEMPTS = 3

type PreflightState = {
  checkedAt: number
  ok: boolean
  error?: string
}

type StartedServer = {
  url: string
  close: () => void
}

type UsageStreamMonitor = {
  stop: () => void
  done: Promise<void>
}

let preflightState: PreflightState | undefined

const readExitCode = (status: number | null): string =>
  status === null ? 'unknown' : String(status)

const parseStderr = (value: unknown): string => {
  if (!value) return ''
  if (typeof value === 'string') return value.trim()
  if (Buffer.isBuffer(value)) return value.toString('utf8').trim()
  return String(value)
}

const runOpencodePreflight = (): PreflightState => {
  const now = Date.now()
  const result = spawnSync(process.execPath, [OPENCODE_ENTRY, '--version'], {
    encoding: 'utf8',
    timeout: 5_000,
    windowsHide: true,
    env: process.env,
  })
  const stderr = parseStderr(result.stderr)
  if (result.error) {
    return {
      checkedAt: now,
      ok: false,
      error: result.error.message,
    }
  }
  if (result.status !== 0) {
    return {
      checkedAt: now,
      ok: false,
      error: `exit=${readExitCode(result.status)}${stderr ? ` ${stderr}` : ''}`,
    }
  }
  return { checkedAt: now, ok: true }
}

const ensureOpencodePreflight = (): void => {
  const now = Date.now()
  if (preflightState && now - preflightState.checkedAt < PREFLIGHT_CACHE_MS) {
    if (preflightState.ok) return
    throw new Error(
      `[provider:opencode] preflight failed: ${preflightState.error ?? 'unknown'}`,
    )
  }
  preflightState = runOpencodePreflight()
  if (!preflightState.ok) {
    throw new Error(
      `[provider:opencode] preflight failed: ${preflightState.error ?? 'unknown'}`,
    )
  }
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

const isTransientProviderError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error)
  return (
    /fetch failed/i.test(message) ||
    /socket hang up/i.test(message) ||
    /ECONNRESET/i.test(message) ||
    /ECONNREFUSED/i.test(message) ||
    /EAI_AGAIN/i.test(message) ||
    /ETIMEDOUT/i.test(message) ||
    /timed out/i.test(message) ||
    /network/i.test(message)
  )
}

const shouldSkipFailureCount = (error: Error): boolean =>
  isAbortLikeError(error) || /preflight failed/i.test(error.message)

const isSameUsage = (
  left: ReturnType<typeof mapOpencodeUsage> | undefined,
  right: ReturnType<typeof mapOpencodeUsage> | undefined,
): boolean =>
  left?.input === right?.input &&
  left?.output === right?.output &&
  left?.total === right?.total

const isAbortLikeStreamError = (
  error: unknown,
  signal: AbortSignal,
): boolean => {
  if (signal.aborted) return true
  return isAbortLikeError(error)
}

const startUsageStreamMonitor = (params: {
  client: ReturnType<typeof createOpencodeClient>
  workDir: string
  sessionID: string
  minCreatedAt: number
  abortSignal: AbortSignal
  onUsage: (usage: ReturnType<typeof mapOpencodeUsage>) => void
}): UsageStreamMonitor => {
  const streamAbort = new AbortController()

  const forwardAbort = (): void => streamAbort.abort()
  if (params.abortSignal.aborted) streamAbort.abort()
  else params.abortSignal.addEventListener('abort', forwardAbort)

  const done = (async () => {
    try {
      const eventStream = await params.client.event.subscribe(
        { directory: params.workDir },
        {
          signal: streamAbort.signal,
          throwOnError: true,
        },
      )
      for await (const event of eventStream.stream) {
        const usage = mapOpencodeUsageFromEvent(
          event,
          params.sessionID,
          params.minCreatedAt,
        )
        if (usage) params.onUsage(usage)
      }
    } catch (error) {
      if (!isAbortLikeStreamError(error, streamAbort.signal)) throw error
    } finally {
      params.abortSignal.removeEventListener('abort', forwardAbort)
    }
  })()

  return {
    stop: () => streamAbort.abort(),
    done,
  }
}

const runOpencodeOnce = async (
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
  let usageMonitor: UsageStreamMonitor | undefined
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

    let latestUsage: ReturnType<typeof mapOpencodeUsage> | undefined
    const reportUsage = (usage: ReturnType<typeof mapOpencodeUsage>): void => {
      if (!usage || isSameUsage(latestUsage, usage)) return
      latestUsage = usage
      request.onUsage?.(usage)
    }

    usageMonitor = startUsageStreamMonitor({
      client,
      workDir: request.workDir,
      sessionID,
      minCreatedAt: Date.now(),
      abortSignal: controller.signal,
      onUsage: reportUsage,
    })

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

    const promptUsage = mapOpencodeUsage(promptResponse.info)
    reportUsage(promptUsage)
    const usage = promptUsage ?? latestUsage
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
    if (usageMonitor) {
      usageMonitor.stop()
      await usageMonitor.done.catch(() => undefined)
    }
    if (closeServer) closeServer()
  }
}

const runOpencodeWithRetry = (
  request: OpencodeProviderRequest,
): Promise<ProviderResult> =>
  pRetry(() => runOpencodeOnce(request), {
    retries: Math.max(0, RETRY_MAX_ATTEMPTS - 1),
    factor: 2,
    minTimeout: 300,
    maxTimeout: 3_000,
    randomize: true,
    shouldConsumeRetry: ({ error }) =>
      !(isAbortLikeError(error) || !isTransientProviderError(error)),
    shouldRetry: ({ error }) =>
      !isAbortLikeError(error) && isTransientProviderError(error),
    onFailedAttempt: (attempt) => {
      if (attempt.retriesLeft <= 0) return
      const message =
        attempt.error instanceof Error
          ? attempt.error.message
          : String(attempt.error)
      console.warn(
        `[provider:opencode] transient failure, retry ${attempt.attemptNumber}/${RETRY_MAX_ATTEMPTS}: ${message}`,
      )
    },
  })

const opencodeBreaker = new CircuitBreaker(runOpencodeWithRetry, {
  timeout: 0,
  resetTimeout: 30_000,
  volumeThreshold: 3,
  errorThresholdPercentage: 50,
  errorFilter: shouldSkipFailureCount,
})

opencodeBreaker.on('open', () => {
  console.warn('[provider:opencode] circuit opened')
})
opencodeBreaker.on('halfOpen', () => {
  console.warn('[provider:opencode] circuit half-open')
})
opencodeBreaker.on('close', () => {
  console.warn('[provider:opencode] circuit closed')
})

const runOpencode = async (
  request: OpencodeProviderRequest,
): Promise<ProviderResult> => {
  ensureOpencodePreflight()
  try {
    return await opencodeBreaker.fire(request)
  } catch (error) {
    if (isAbortLikeError(error)) throw new Error('[provider:opencode] aborted')
    if (error instanceof Error && /breaker is open/i.test(error.message)) {
      throw new Error(
        '[provider:opencode] circuit is open due to consecutive failures',
      )
    }
    throw error
  }
}

export const opencodeProvider: Provider<OpencodeProviderRequest> = {
  id: 'opencode',
  run: runOpencode,
}
