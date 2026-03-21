import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { createRestartRequester } from '../webui/restart-request.js'

const createJsonResponse = (ok: boolean, status: number, payload: unknown) => ({
  ok,
  status,
  json: vi.fn().mockResolvedValue(payload),
})

describe('createRestartRequester', () => {
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

  test('uses /api/status as authority even when local idle state says blocked', async () => {
    const fetchMock = vi
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
      )
    globalThis.fetch = fetchMock as typeof fetch

    const ctx = {
      statusText: { textContent: '' },
      statusDot: { dataset: {} as Record<string, string> },
      messages: {
        stop: vi.fn(),
        start: vi.fn(),
      },
      isBusy: () => false,
      setBusy: vi.fn(),
      setRuntimeIdle: vi.fn(),
      refreshUiIdleState: vi.fn().mockReturnValue(false),
      syncControlState: vi.fn(),
      closeToolsMenu: vi.fn(),
      closeAllDialogs: vi.fn(),
    }

    const requester = createRestartRequester(ctx)
    await requester.request('restart')

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/status',
      expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/restart',
      expect.objectContaining({ method: 'POST', signal: expect.any(AbortSignal) }),
    )
    expect(window.location.reload).toHaveBeenCalledTimes(1)
  })
})
