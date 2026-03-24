import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { requestRuntimeControl } from '../webui-src/lib/restart.js'

const createJsonResponse = (ok: boolean, status: number, payload: unknown) => ({
  ok,
  status,
  json: vi.fn().mockResolvedValue(payload),
})

describe('requestRuntimeControl', () => {
  const originalWindow = globalThis.window
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.window = {
      setTimeout,
      clearTimeout,
      location: { reload: vi.fn() },
    } as typeof window
  })

  afterEach(() => {
    globalThis.window = originalWindow
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  test('reloads when runtime id changes after restart request', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse(true, 200, {
          runtimeId: 'runtime-1',
          managerRunning: false,
          activeTasks: 0,
          pendingTasks: 0,
        }),
      )
      .mockResolvedValueOnce(createJsonResponse(true, 200, { ok: true }))
      .mockResolvedValueOnce(
        createJsonResponse(true, 200, {
          runtimeId: 'runtime-2',
          managerRunning: false,
          activeTasks: 0,
          pendingTasks: 0,
        }),
      ) as typeof fetch

    await expect(requestRuntimeControl('restart')).resolves.toEqual({
      ok: true,
    })
    expect(window.location.reload).toHaveBeenCalledTimes(1)
  })

  test('returns blocked details when server rejects restart with busy stats', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse(true, 200, {
          runtimeId: 'runtime-1',
          managerRunning: false,
          activeTasks: 0,
          pendingTasks: 0,
          pendingInputs: 0,
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse(false, 409, {
          error:
            'restart requires clear slots: wait for manager to stop and pending/running tasks to clear',
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse(true, 200, {
          runtimeId: 'runtime-1',
          managerRunning: true,
          activeTasks: 1,
          pendingTasks: 2,
          pendingInputs: 3,
        }),
      ) as typeof fetch

    await expect(requestRuntimeControl('restart')).resolves.toEqual({
      ok: false,
      status: {
        agentStatus: 'running',
        activeTasks: 1,
        pendingTasks: 2,
        pendingInputs: 3,
        managerRunning: true,
      },
      message:
        'restart blocked: restart requires clear slots: wait for manager to stop and pending/running tasks to clear (managerRunning=true, activeTasks=1, pendingTasks=2, pendingInputs=3)',
    })
    expect(window.location.reload).not.toHaveBeenCalled()
  })
})
