import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { createRestartRequester } from '../webui/restart-request.js'

const createJsonResponse = (ok: boolean, status: number, payload: unknown) => ({
  ok,
  status,
  json: vi.fn().mockResolvedValue(payload),
})

const createRestartUiContext = (idle = true) => ({
  statusText: { textContent: '' },
  statusDot: { dataset: {} as Record<string, string> },
  messages: {
    stop: vi.fn(),
    start: vi.fn(),
  },
  isBusy: () => false,
  setBusy: vi.fn(),
  setRuntimeIdle: vi.fn(),
  refreshUiIdleState: vi.fn().mockReturnValue(idle),
  syncControlState: vi.fn(),
  closeToolsMenu: vi.fn(),
  closeAllDialogs: vi.fn(),
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

    const ctx = createRestartUiContext(false)

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

  test('includes busy stats in the blocked status message when server rejects with 409', async () => {
    const fetchMock = vi
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
      )
    globalThis.fetch = fetchMock as typeof fetch

    const ctx = createRestartUiContext()

    const requester = createRestartRequester(ctx)
    await requester.request('restart')

    expect(window.location.reload).toHaveBeenCalledTimes(0)
    expect(ctx.statusDot.dataset.state).toBe('running')
    expect(ctx.statusText.textContent).toContain('REQUIRES CLEAR SLOTS')
    expect(ctx.statusText.textContent).toContain('MANAGERRUNNING=TRUE')
    expect(ctx.statusText.textContent).toContain('ACTIVETASKS=1')
    expect(ctx.statusText.textContent).toContain('PENDINGTASKS=2')
    expect(ctx.statusText.textContent).toContain('PENDINGINPUTS=3')
  })
})
