import { expect, test, vi } from 'vitest'

import { recoverUnhealthyRuntimeOwner } from '../src/bootstrap/cli/runtime-owner-health.js'

type RecoverOwnerDeps = NonNullable<
  Parameters<typeof recoverUnhealthyRuntimeOwner>[1]
>

const createBaseRuntimeOwnerInput = (port?: number) => ({
  workDir: '/tmp/mimikit-state',
  owner: {
    lockPath: '/tmp/mimikit-state/.instance.lock',
    ownerPid: 411,
    runtimeId: 'runtime-411-live',
    updatedAt: '2026-03-26T04:50:00.000Z',
    ...(port ? { port } : {}),
  },
  port: 8787,
})

const createReachableDeps = (params?: {
  killPidBestEffort?: RecoverOwnerDeps['killPidBestEffort']
  resolveOwnerPort?: RecoverOwnerDeps['resolveOwnerPort']
  isPortReachable?: RecoverOwnerDeps['isPortReachable']
}): RecoverOwnerDeps => ({
  isPidAlive: () => true,
  killPidBestEffort:
    params?.killPidBestEffort ?? vi.fn(() => Promise.resolve(true)),
  resolveControlPid: () => 410,
  resolveOwnerPort: params?.resolveOwnerPort ?? (() => null),
  isPortReachable: params?.isPortReachable ?? (() => Promise.resolve(true)),
  removeLockPath: () => Promise.resolve(),
  removeLeasePath: () => Promise.resolve(),
})

test('recoverUnhealthyRuntimeOwner clears an unreachable webui runtime owner', async () => {
  const killPidBestEffort = vi
    .fn<RecoverOwnerDeps['killPidBestEffort']>()
    .mockResolvedValue(true)
  const removeLeasePath = vi.fn(() => Promise.resolve())
  const removeLockPath = vi.fn(() => Promise.resolve())

  const alive = new Set<number>([410, 411])
  killPidBestEffort.mockImplementation(({ pid }: { pid: number }) => {
    alive.delete(pid)
    return Promise.resolve(true)
  })

  await expect(
    recoverUnhealthyRuntimeOwner(
      {
        workDir: '/tmp/mimikit-state',
        owner: {
          lockPath: '/tmp/mimikit-state/.instance.lock',
          ownerPid: 411,
          runtimeId: 'runtime-411-stuck',
          updatedAt: '2026-03-26T04:50:00.000Z',
        },
        port: 8787,
      },
      {
        isPidAlive: (pid) => alive.has(pid),
        killPidBestEffort,
        resolveControlPid: () => 410,
        resolveOwnerPort: () => null,
        isPortReachable: () => Promise.resolve(false),
        removeLockPath,
        removeLeasePath,
      },
    ),
  ).resolves.toBe(true)

  expect(killPidBestEffort).toHaveBeenCalledTimes(2)
  expect(killPidBestEffort).toHaveBeenNthCalledWith(1, {
    pid: 410,
    signal: 'SIGTERM',
    waitMs: 1500,
  })
  expect(killPidBestEffort).toHaveBeenNthCalledWith(2, {
    pid: 411,
    signal: 'SIGTERM',
    waitMs: 1500,
  })
  expect(removeLeasePath).toHaveBeenCalledWith('/tmp/mimikit-state')
  expect(removeLockPath).toHaveBeenCalledWith(
    '/tmp/mimikit-state/.instance.lock',
  )
})

test('recoverUnhealthyRuntimeOwner leaves a reachable runtime untouched', async () => {
  const killPidBestEffort = vi.fn(() => Promise.resolve(true))

  await expect(
    recoverUnhealthyRuntimeOwner(
      createBaseRuntimeOwnerInput(),
      createReachableDeps({
        killPidBestEffort,
      }),
    ),
  ).resolves.toBe(false)

  expect(killPidBestEffort).not.toHaveBeenCalled()
})

test('recoverUnhealthyRuntimeOwner probes the lease port before falling back to target port', async () => {
  const killPidBestEffort = vi.fn(() => Promise.resolve(true))

  await expect(
    recoverUnhealthyRuntimeOwner(
      createBaseRuntimeOwnerInput(9898),
      createReachableDeps({
        killPidBestEffort,
        resolveOwnerPort: () => 7777,
        isPortReachable: (port) => Promise.resolve(port === 9898),
      }),
    ),
  ).resolves.toBe(false)

  expect(killPidBestEffort).not.toHaveBeenCalled()
})

test('recoverUnhealthyRuntimeOwner uses the owner command port when lease lacks one', async () => {
  const killPidBestEffort = vi.fn(() => Promise.resolve(true))

  await expect(
    recoverUnhealthyRuntimeOwner(
      createBaseRuntimeOwnerInput(),
      createReachableDeps({
        killPidBestEffort,
        resolveOwnerPort: () => 9898,
        isPortReachable: (port) => Promise.resolve(port === 9898),
      }),
    ),
  ).resolves.toBe(false)

  expect(killPidBestEffort).not.toHaveBeenCalled()
})
