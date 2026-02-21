import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
const require = createRequire(import.meta.url)
const OPENCODE_ENTRY = require.resolve('opencode-ai/bin/opencode')
const OPENCODE_HOST = '127.0.0.1'
const PREFLIGHT_CACHE_MS = 30_000
type PreflightState = {
  checkedAt: number
  ok: boolean
  error?: string
}
export type StartedServer = {
  url: string
  close: () => void
}

type SharedServerState = {
  server: StartedServer | null
  pending: Promise<StartedServer> | null
  cleanupRegistered: boolean
}

let preflightState: PreflightState | undefined
const sharedServerState: SharedServerState = {
  server: null,
  pending: null,
  cleanupRegistered: false,
}
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

export const ensureOpencodePreflight = (): void => {
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

export const isAbortLikeError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false
  if (error.name === 'AbortError') return true
  return (
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string' &&
    (error as { code: string }).code === 'ABORT_ERR'
  )
}

export const unwrapSdkData = <T>(value: T | { data: T }): T => {
  if (
    value &&
    typeof value === 'object' &&
    'data' in value &&
    (value as { data?: T }).data !== undefined
  )
    return (value as { data: T }).data
  return value as T
}

export const resolveServerTimeout = (requestTimeoutMs: number): number => {
  if (requestTimeoutMs <= 0) return 5_000
  return Math.max(1_000, Math.min(requestTimeoutMs, 15_000))
}

const OPENCODE_SERVER_FAILURE_PATTERN =
  /(ECONNREFUSED|ECONNRESET|EPIPE|ENOTFOUND|socket hang up|fetch failed|server exited|connection refused|connect ECONN)/i

export const isOpencodeServerFailure = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error)
  return OPENCODE_SERVER_FAILURE_PATTERN.test(message)
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

export const startOpencodeServer = async (
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

const clearSharedServerState = (): void => {
  sharedServerState.server = null
  sharedServerState.pending = null
}

const registerSharedServerCleanup = (): void => {
  if (sharedServerState.cleanupRegistered) return
  sharedServerState.cleanupRegistered = true
  process.once('exit', () => {
    if (sharedServerState.server) sharedServerState.server.close()
  })
}

const wrapSharedServer = (server: StartedServer): StartedServer => {
  let closed = false
  return {
    url: server.url,
    close: () => {
      if (closed) return
      closed = true
      clearSharedServerState()
      server.close()
    },
  }
}

export const getSharedOpencodeServer = (
  timeoutMs: number,
): Promise<StartedServer> => {
  if (sharedServerState.server) return Promise.resolve(sharedServerState.server)
  if (!sharedServerState.pending) {
    registerSharedServerCleanup()
    const controller = new AbortController()
    sharedServerState.pending = startOpencodeServer(
      controller.signal,
      timeoutMs,
    )
      .then((server) => {
        const wrapped = wrapSharedServer(server)
        sharedServerState.server = wrapped
        sharedServerState.pending = null
        return wrapped
      })
      .catch((error) => {
        sharedServerState.pending = null
        throw error
      })
  }
  if (sharedServerState.pending) return sharedServerState.pending
  return Promise.reject(
    new Error('[provider:opencode] shared server is unavailable'),
  )
}

export const resetSharedOpencodeServer = (): void => {
  const { server } = sharedServerState
  clearSharedServerState()
  if (server) server.close()
}
