import { beforeEach, describe, expect, test, vi } from 'vitest'

import { applyTaskActions } from '../src/manager/action-apply.js'

import type { RuntimeState } from '../src/manager/runtime-adapter.js'
import type { Parsed } from '../src/actions/model/spec.js'
import type { ApplyResult } from '../src/manager/action-registrations.js'

const { loggerMock, applyMock } = vi.hoisted(() => ({
  loggerMock: {
    logLifecycle: vi.fn(),
    logFeedback: vi.fn(),
  },
  applyMock: vi.fn<
    (
      runtime: RuntimeState,
      item: Parsed,
      context: { seen: Set<string> },
    ) => Promise<ApplyResult>
  >(),
}))

vi.mock('../src/manager/action-cli-log.js', () => ({
  managerActionCliLogger: loggerMock,
}))

vi.mock('../src/manager/action-registrations.js', async () => {
  const actual = await vi.importActual<typeof import('../src/manager/action-registrations.js')>(
    '../src/manager/action-registrations.js',
  )
  return {
    ...actual,
    applyRegisteredManagerAction: (
      runtime: RuntimeState,
      item: Parsed,
      context: { seen: Set<string> },
    ) => applyMock(runtime, item, context),
  }
})

vi.mock('../src/focus/index.js', () => ({
  ensureFocus: vi.fn(),
  enforceFocusCapacity: vi.fn(async () => undefined),
  resolveDefaultFocusId: vi.fn(() => 'focus-global'),
}))

const runtime = {} as RuntimeState

beforeEach(() => {
  applyMock.mockReset()
  loggerMock.logLifecycle.mockReset()
  loggerMock.logFeedback.mockReset()
})

describe('applyTaskActions cli lifecycle logging', () => {
  test('logs dispatch/running/applied in order for continue action', async () => {
    applyMock.mockResolvedValue('continue')

    await applyTaskActions(runtime, [
      {
        name: 'enqueue_task',
        attrs: { prompt: 'hello' },
      },
    ])

    expect(loggerMock.logLifecycle).toHaveBeenCalledTimes(3)
    expect(loggerMock.logLifecycle).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        stage: 'dispatch',
        index: 1,
        total: 1,
      }),
    )
    expect(loggerMock.logLifecycle).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        stage: 'running',
        index: 1,
        total: 1,
      }),
    )
    expect(loggerMock.logLifecycle).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        stage: 'applied',
        result: 'continue',
        index: 1,
        total: 1,
      }),
    )
  })

  test('logs stopped when action requests stop', async () => {
    applyMock.mockResolvedValue('stop')

    await applyTaskActions(runtime, [
      {
        name: 'ask_user_choice',
        attrs: { id: 'choice-1' },
      },
      {
        name: 'enqueue_task',
        attrs: { prompt: 'must-not-run' },
      },
    ])

    expect(applyMock).toHaveBeenCalledTimes(1)
    expect(loggerMock.logLifecycle).toHaveBeenCalledTimes(3)
    expect(loggerMock.logLifecycle).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        stage: 'stopped',
        result: 'stop',
        index: 1,
        total: 2,
      }),
    )
  })

  test('logs failed and rethrows when action apply throws', async () => {
    const error = new Error('apply exploded')
    applyMock.mockRejectedValue(error)

    await expect(
      applyTaskActions(runtime, [
        {
          name: 'mutate_task',
          attrs: { id: 'task-1', op: 'cancel' },
        },
      ]),
    ).rejects.toThrow('apply exploded')

    expect(loggerMock.logLifecycle).toHaveBeenCalledTimes(3)
    expect(loggerMock.logLifecycle).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        stage: 'failed',
        error,
        index: 1,
        total: 1,
      }),
    )
  })
})
