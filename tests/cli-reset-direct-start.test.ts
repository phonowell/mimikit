import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import net from 'node:net'

import { afterEach, expect, test } from 'vitest'

const ROOT_DIR = resolve(fileURLToPath(new URL('..', import.meta.url)))
const CLI_ENTRY = resolve(ROOT_DIR, 'src/cli/index.ts')

const createFreePort = async (): Promise<number> =>
  new Promise((resolvePort, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('free_port_address_missing'))
        return
      }
      server.close((error) => {
        if (error) reject(error)
        else resolvePort(address.port)
      })
    })
  })

const waitForStatus = async (
  port: number,
  timeoutMs: number,
): Promise<{
  runtimeId: string
}> => {
  const deadline = Date.now() + timeoutMs
  let lastError = 'status timeout'
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/status`)
      if (!response.ok) {
        lastError = `status ${response.status}`
      } else {
        const payload = (await response.json()) as { runtimeId?: unknown }
        if (typeof payload.runtimeId === 'string' && payload.runtimeId.trim())
          return { runtimeId: payload.runtimeId }
        lastError = 'runtimeId missing'
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await delay(150)
  }
  throw new Error(lastError)
}

const waitForRuntimeRestart = async (
  port: number,
  previousRuntimeId: string,
  timeoutMs: number,
): Promise<{
  runtimeId: string
}> => {
  const deadline = Date.now() + timeoutMs
  let sawDisconnect = false
  let lastError = 'runtime restart timeout'
  while (Date.now() < deadline) {
    try {
      const status = await waitForStatus(port, 500)
      if (status.runtimeId !== previousRuntimeId) return status
      lastError = 'runtimeId unchanged'
    } catch (error) {
      sawDisconnect = true
      lastError = error instanceof Error ? error.message : String(error)
    }
    await delay(sawDisconnect ? 150 : 100)
  }
  throw new Error(lastError)
}

const runningChildren = new Set<ReturnType<typeof spawn>>()

afterEach(async () => {
  await Promise.all(
    [...runningChildren].map(
      (child) =>
        new Promise<void>((resolveExit) => {
          if (child.exitCode !== null) {
            runningChildren.delete(child)
            resolveExit()
            return
          }
          child.once('exit', () => {
            runningChildren.delete(child)
            resolveExit()
          })
          child.kill('SIGTERM')
        }),
    ),
  )
})

test(
  'direct cli start keeps reset available without wrapper restart loop',
  async () => {
    const workDir = await mkdtemp(join(tmpdir(), 'mimikit-cli-reset-'))
    const port = await createFreePort()
    const child = spawn(
      process.execPath,
      ['--import', 'tsx/esm', CLI_ENTRY, '--work-dir', workDir, '--port', String(port)],
      {
        cwd: ROOT_DIR,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    runningChildren.add(child)

    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      output += chunk.toString()
    })

    try {
      const beforeReset = await waitForStatus(port, 15_000)

      const response = await fetch(`http://127.0.0.1:${port}/api/reset`, {
        method: 'POST',
      })
      expect(response.status).toBe(200)

      const afterReset = await waitForRuntimeRestart(
        port,
        beforeReset.runtimeId,
        20_000,
      )
      expect(afterReset.runtimeId).not.toBe(beforeReset.runtimeId)
      expect(child.exitCode).toBeNull()
    } catch (error) {
      throw new Error(
        `${
          error instanceof Error ? error.message : String(error)
        }\ncli output:\n${output}`,
      )
    } finally {
      await rm(workDir, { recursive: true, force: true })
    }
  },
  30_000,
)
