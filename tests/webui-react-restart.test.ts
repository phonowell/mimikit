import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  STATUS_POLL_INTERVAL_MS,
  STATUS_POLL_TIMEOUT_MS,
} from '../webui-src/lib/restart-config.js'
import { requestRuntimeControl } from '../webui-src/lib/restart.js'

import {
  createJsonResponse,
  createStatusResponse,
  installRestartWindow,
} from './helpers/webui-restart.js'

describe('requestRuntimeControl', () => {
  const originalWindow = globalThis.window
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    installRestartWindow()
  })

  afterEach(() => {
    vi.useRealTimers()
    globalThis.window = originalWindow
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  test('reloads when runtime id changes after restart request', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(createStatusResponse('runtime-1'))
      .mockResolvedValueOnce(createJsonResponse(true, 200, { ok: true }))
      .mockResolvedValueOnce(createStatusResponse('runtime-2')) as typeof fetch

    await expect(requestRuntimeControl('restart')).resolves.toEqual({
      ok: true,
    })
    expect(window.location.reload).toHaveBeenCalledTimes(1)
  })

  test('reloads when status disconnects and then reconnects', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(createStatusResponse('runtime-1'))
      .mockResolvedValueOnce(createJsonResponse(true, 200, { ok: true }))
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(createStatusResponse('runtime-2')) as typeof fetch

    await expect(requestRuntimeControl('restart')).resolves.toEqual({
      ok: true,
    })
    expect(window.location.reload).toHaveBeenCalledTimes(1)
  })

  test('does not reload on transient disconnect until a new runtime id appears', async () => {
    vi.useFakeTimers()
    installRestartWindow()
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(createStatusResponse('runtime-1'))
      .mockResolvedValueOnce(createJsonResponse(true, 200, { ok: true }))
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(createStatusResponse('runtime-1'))
      .mockResolvedValueOnce(createStatusResponse('runtime-2')) as typeof fetch

    const result = requestRuntimeControl('restart')
    await vi.advanceTimersByTimeAsync(STATUS_POLL_INTERVAL_MS * 4)

    await expect(result).resolves.toEqual({ ok: true })
    expect(window.location.reload).toHaveBeenCalledTimes(1)
  })

  test('returns blocked details when server rejects restart with busy stats', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(createStatusResponse('runtime-1'))
      .mockResolvedValueOnce(
        createJsonResponse(false, 409, {
          error:
            'restart requires clear slots: wait for manager to stop and pending/running tasks to clear',
        }),
      )
      .mockResolvedValueOnce(
        createStatusResponse('runtime-1', {
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

  test('fails after the polling window if restart never exposes a new runtime', async () => {
    vi.useFakeTimers()
    installRestartWindow()
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(createStatusResponse('runtime-1'))
      .mockResolvedValueOnce(createJsonResponse(true, 200, { ok: true }))
      .mockResolvedValue(createStatusResponse('runtime-1')) as typeof fetch

    const result = requestRuntimeControl('restart')
    await vi.advanceTimersByTimeAsync(STATUS_POLL_TIMEOUT_MS + 1_000)

    await expect(result).resolves.toEqual({
      ok: false,
      status: {
        agentStatus: 'disconnected',
        activeTasks: 0,
        pendingTasks: 0,
        pendingInputs: 0,
        managerRunning: false,
      },
      message: 'restart failed',
    })
    expect(window.location.reload).not.toHaveBeenCalled()
  })
})
