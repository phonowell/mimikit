import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { Task, TaskResult, WorkerProfile } from '../src/types/index.js'

const { notifyMock } = vi.hoisted(() => ({
  notifyMock: vi.fn(),
}))

vi.mock('node-notifier', () => ({
  default: {
    notify: notifyMock,
  },
}))

const createTmpLogPath = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mimikit-notify-'))
  return join(dir, 'log.jsonl')
}

const buildTask = (id: string, profile: WorkerProfile): Task => ({
  id,
  fingerprint: `${id}-fp`,
  prompt: 'prompt',
  title: `Task ${id}`,
  profile,
  status: 'running',
  createdAt: '2026-02-18T00:00:00.000Z',
})

const buildResult = (
  status: TaskResult['status'],
  durationMs: number,
  output: string,
): TaskResult => ({
  taskId: 'task',
  status,
  ok: status === 'succeeded',
  output,
  durationMs,
  completedAt: '2026-02-18T00:00:01.000Z',
})

describe('createTaskResultNotifier', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    notifyMock.mockReset()
    notifyMock.mockImplementation(
      (_options: unknown, callback?: (error?: unknown) => void) => {
        if (callback) callback()
      },
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('sends immediate notification for failed tasks', async () => {
    const logPath = await createTmpLogPath()
    const { createTaskResultNotifier } = await import(
      '../src/notify/node-notifier.js'
    )
    const notifier = createTaskResultNotifier(logPath)
    await notifier.notifyTaskResult(
      buildTask('fail-1', 'standard'),
      buildResult('failed', 25_000, 'boom'),
    )

    expect(notifyMock).toHaveBeenCalledTimes(1)
    const payload = notifyMock.mock.calls[0]?.[0] as { title?: string }
    expect(payload.title).toContain('[failed]')
  })

  test('does not notify quick standard success', async () => {
    const logPath = await createTmpLogPath()
    const { createTaskResultNotifier } = await import(
      '../src/notify/node-notifier.js'
    )
    const notifier = createTaskResultNotifier(logPath)
    await notifier.notifyTaskResult(
      buildTask('ok-1', 'standard'),
      buildResult('succeeded', 5_000, 'ok'),
    )

    await vi.advanceTimersByTimeAsync(6_000)
    expect(notifyMock).not.toHaveBeenCalled()
  })

  test('batches success notifications inside window', async () => {
    const logPath = await createTmpLogPath()
    const { createTaskResultNotifier } = await import(
      '../src/notify/node-notifier.js'
    )
    const notifier = createTaskResultNotifier(logPath)
    await notifier.notifyTaskResult(
      buildTask('spec-1', 'specialist'),
      buildResult('succeeded', 9_000, 'ok'),
    )
    await notifier.notifyTaskResult(
      buildTask('long-1', 'standard'),
      buildResult('succeeded', 80_000, 'ok'),
    )

    await vi.advanceTimersByTimeAsync(5_100)
    expect(notifyMock).toHaveBeenCalledTimes(1)
    const payload = notifyMock.mock.calls[0]?.[0] as { title?: string }
    expect(payload.title).toContain('2 tasks completed')
  })
})
