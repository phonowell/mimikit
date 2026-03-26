import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import getPort from 'get-port'
import { afterEach, expect, test } from 'vitest'

const CLI_STARTUP_TIMEOUT_MS = 25_000
const RUNTIME_TRANSITION_TIMEOUT_MS = 25_000
const POLL_INTERVAL_MS = 300

type RuntimeStatus = {
  runtimeId?: string
}

type StartedCli = {
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
  await new Promise<void>((resolve) => {
    child.once('exit', () => resolve())
    try {
      process.kill(-child.pid!, signal)
    } catch {
      resolve()
    }
  })
}

const createRuntimeStatusFetcher = (port: number) => async (): Promise<RuntimeStatus> => {
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

const startCli = async (): Promise<StartedCli> => {
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

  child.stdout?.setEncoding('utf8')
  child.stderr?.setEncoding('utf8')
  child.stdout?.on('data', (chunk: string) => logs.push(chunk))
  child.stderr?.on('data', (chunk: string) => logs.push(chunk))

  const stop = async (): Promise<void> => {
    await waitForExit(child)
  }
  activeStops.push(stop)

  const fetchStatus = createRuntimeStatusFetcher(port)
  await waitFor(fetchStatus, (status) => typeof status.runtimeId === 'string', CLI_STARTUP_TIMEOUT_MS)

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

const readLeaseOwnerPid = async (workDir: string): Promise<number> => {
  const raw = await readFile(join(workDir, 'runtime', 'lease.json'), 'utf8')
  const parsed = JSON.parse(raw) as { ownerPid?: unknown }
  if (!Number.isInteger(parsed.ownerPid) || parsed.ownerPid <= 0)
    throw new Error(`invalid runtime lease ownerPid: ${raw}`)
  return parsed.ownerPid
}

afterEach(async () => {
  while (activeStops.length > 0) {
    const stop = activeStops.pop()
    await stop?.()
  }
})

test(
  'CLI supervisor restarts a fresh runtime child after restart and crash',
  async () => {
    const cli = await startCli()

    const first = await cli.waitForStatus()
    expect(first.runtimeId).toMatch(/^runtime-/)

    const restartResponse = await fetch(`http://127.0.0.1:${cli.port}/api/restart`, {
      method: 'POST',
    })
    expect(restartResponse.status).toBe(200)
    await expect(restartResponse.json()).resolves.toEqual({ ok: true })

    const second = await cli.waitForRuntimeChange(first.runtimeId!)
    expect(second.runtimeId).toMatch(/^runtime-/)

    const childPid = await readLeaseOwnerPid(cli.workDir)
    process.kill(childPid, 'SIGKILL')

    const third = await cli.waitForRuntimeChange(second.runtimeId!)
    expect(third.runtimeId).toMatch(/^runtime-/)
  },
  70_000,
)
