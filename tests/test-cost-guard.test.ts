import { createServer } from 'node:http'

import { afterEach, expect, test } from 'vitest'

const servers = new Set<ReturnType<typeof createServer>>()

afterEach(async () => {
  await Promise.all(
    [...servers].map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) reject(error)
            else resolve()
          })
        }),
    ),
  )
  servers.clear()
})

test('test environment blocks external fetch by default', async () => {
  await expect(fetch('https://example.com')).rejects.toThrow(
    'external_fetch_blocked_in_tests',
  )
})

test('test environment still allows loopback fetch for local integration paths', async () => {
  const server = createServer((_, response) => {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ ok: true }))
  })
  servers.add(server)

  await new Promise<void>((resolve, reject) => {
    server.listen(0, '127.0.0.1', (error?: Error) => {
      if (error) reject(error)
      else resolve()
    })
  })

  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('expected tcp server address')

  const response = await fetch(`http://127.0.0.1:${address.port}/status`)

  await expect(response.json()).resolves.toEqual({ ok: true })
})
