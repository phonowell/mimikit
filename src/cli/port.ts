import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'

import getPort, { portNumbers } from 'get-port'

export const parsePort = (value: string): number => {
  const num = Number(value)
  if (!Number.isInteger(num) || num <= 0 || num > 65535) {
    console.error(`[cli] invalid port: ${value}`)
    process.exit(1)
  }
  return num
}

export const resolveHttpPort = async (target: number): Promise<number> => {
  const max = Math.min(65535, target + 20)
  const port = await getPort({ port: portNumbers(target, max) })
  if (port !== target)
    console.warn(`[cli] port ${target} is in use, fallback to ${port}`)
  return port
}

export const waitForPortRelease = async (port: number): Promise<void> => {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const released = await new Promise<boolean>((resolveRelease, reject) => {
      const probe = createServer()
      probe.once('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          resolveRelease(false)
          return
        }
        reject(error)
      })
      probe.listen(port, '127.0.0.1', () => {
        probe.close((error) => {
          if (error) reject(error)
          else resolveRelease(true)
        })
      })
    })
    if (released) return
    await delay(100)
  }
  throw new Error(`[cli] port ${port} did not release in time`)
}
