import { afterEach, expect, test } from 'vitest'

import {
  connectEventStream,
  readLeaseOwnerPid,
  requireRuntimeId,
  startCli,
  stopAllStartedClis,
} from './helpers/cli-runtime-supervisor.js'

const postJson = async (port: number, path: string): Promise<Response> => {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
  })
  if (!response.ok)
    throw new Error(`request to ${path} failed (${response.status})`)
  return response
}

afterEach(async () => {
  await stopAllStartedClis()
})

test('CLI supervisor restarts with a connected event stream and after child crash', async () => {
  const cli = await startCli()

  const first = await cli.waitForStatus()
  const firstRuntimeId = requireRuntimeId(first)
  expect(firstRuntimeId).toMatch(/^runtime-/)

  const eventsResponse = await connectEventStream(cli.port)
  expect(eventsResponse.statusCode).toBe(200)

  let secondRuntimeId = ''
  try {
    const restartResponse = await postJson(cli.port, '/api/restart')
    await expect(restartResponse.json()).resolves.toEqual({ ok: true })

    const second = await cli.waitForRuntimeChange(firstRuntimeId)
    secondRuntimeId = requireRuntimeId(second)
    expect(secondRuntimeId).toMatch(/^runtime-/)
  } finally {
    eventsResponse.destroy()
  }

  const childPid = await readLeaseOwnerPid(cli.workDir)
  process.kill(childPid, 'SIGKILL')

  const third = await cli.waitForRuntimeChange(secondRuntimeId)
  expect(requireRuntimeId(third)).toMatch(/^runtime-/)
}, 70_000)
