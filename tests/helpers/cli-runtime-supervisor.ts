import { spawn } from 'node:child_process'
import { mkdtemp, readFile } from 'node:fs/promises'
import { get as httpGet, type IncomingMessage } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import getPort from 'get-port'

const CLI_STARTUP_TIMEOUT_MS = 25_000
const RUNTIME_TRANSITION_TIMEOUT_MS = 25_000
const POLL_INTERVAL_MS = 300

export type RuntimeStatus = {
  runtimeId?: string
}

export type StartedCli = {
  logs: string[]
  port: number
  workDir: string
  stop: () => Promise<void>
  waitForRuntimeChange: (previousRuntimeId: string) => Promise<RuntimeStatus>
  waitForStatus: () => Promise<RuntimeStatus>
}

const activeStops: Array<() => Promise<void>> = []

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

const waitForExit = async (
  child: ReturnType<typeof spawn>,
  signal: NodeJS.Signals = 'SIGTERM',
): Promise<void> => {
  if (child.exitCode !== null || child.signalCode !== null) return
  const { pid } = child
  if (pid === undefined) return
  await new Promise<void>((resolve) => {
    child.once('exit', () => resolve())
    try {
      process.kill(-pid, signal)
    } catch {
      resolve()
    }
  })
}

const createRuntimeStatusFetcher =
  (port: number) => async (): Promise<RuntimeStatus> => {
    const response = await fetch(`http://127.0.0.1:${port}/api/status`)
    if (!response.ok)
      throw new Error(`status request failed (${response.status})`)
    return (await response.json()) as RuntimeStatus
  }

const waitFor = async <T>(
  read: () => Promise<T>,
  accept: (value: T) => boolean,
  timeoutMs: number,
): Promise<T> => {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown = null
  while (Date.now() < deadline) {
    try {
      const value = await read()
      if (accept(value)) return value
    } catch (error) {
      lastError = error
    }
    await delay(POLL_INTERVAL_MS)
  }
  throw lastError instanceof Error ? lastError : new Error('timed out')
}

export const requireRuntimeId = (status: RuntimeStatus): string => {
  if (typeof status.runtimeId !== 'string')
    throw new Error('runtimeId missing from status response')
  return status.runtimeId
}

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0

export const startCli = async (): Promise<StartedCli> => {
  const workDir = await mkdtemp(join(tmpdir(), 'mimikit-cli-supervisor-'))
  const port = await getPort()
  const logs: string[] = []
  const child = spawn(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    [
      'exec',
      'tsx',
      'src/bootstrap/cli/index.ts',
      '--port',
      String(port),
      '--work-dir',
      workDir,
    ],
    {
      cwd: process.cwd(),
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => logs.push(chunk))
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => logs.push(chunk))

  const stop = async (): Promise<void> => {
    await waitForExit(child)
  }
  activeStops.push(stop)

  const fetchStatus = createRuntimeStatusFetcher(port)
  await waitFor(
    fetchStatus,
    (status) => typeof status.runtimeId === 'string',
    CLI_STARTUP_TIMEOUT_MS,
  )

  return {
    logs,
    port,
    workDir,
    stop,
    waitForStatus: () =>
      waitFor(
        fetchStatus,
        (status) => typeof status.runtimeId === 'string',
        CLI_STARTUP_TIMEOUT_MS,
      ),
    waitForRuntimeChange: (previousRuntimeId: string) =>
      waitFor(
        fetchStatus,
        (status) =>
          typeof status.runtimeId === 'string' &&
          status.runtimeId !== previousRuntimeId,
        RUNTIME_TRANSITION_TIMEOUT_MS,
      ),
  }
}

export const readLeaseOwnerPid = async (workDir: string): Promise<number> => {
  const raw = await readFile(join(workDir, 'runtime', 'lease.json'), 'utf8')
  const parsed = JSON.parse(raw) as { ownerPid?: unknown }
  const { ownerPid } = parsed
  if (!isPositiveInteger(ownerPid))
    throw new Error(`invalid runtime lease ownerPid: ${raw}`)
  return ownerPid
}

const ignoreResponseError = (): void => {
  /* stream is intentionally torn down by the test during restart */
}

export const connectEventStream = (port: number): Promise<IncomingMessage> =>
  new Promise<IncomingMessage>((resolve, reject) => {
    const request = httpGet(
      `http://127.0.0.1:${port}/api/events`,
      {
        headers: { accept: 'text/event-stream' },
      },
      (response) => {
        response.once('error', ignoreResponseError)
        resolve(response)
      },
    )
    request.once('error', reject)
  })

export const stopAllStartedClis = async (): Promise<void> => {
  while (activeStops.length > 0) {
    const stop = activeStops.pop()
    await stop?.()
  }
}
