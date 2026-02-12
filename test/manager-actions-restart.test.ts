import { afterEach, beforeEach, expect, test, vi } from 'vitest'

vi.mock('../src/log/safe.js', () => ({
  bestEffort: vi.fn(async (_context: string, fn: () => Promise<unknown>) => {
    await fn()
  }),
}))

vi.mock('../src/orchestrator/core/runtime-persistence.js', () => ({
  persistRuntimeState: vi.fn(async () => {}),
}))

vi.mock('../src/orchestrator/core/worker-signal.js', () => ({
  notifyWorkerLoop: vi.fn(),
}))

vi.mock('../src/worker/cancel-task.js', () => ({
  cancelTask: vi.fn(async () => ({ ok: true, status: 'canceled', taskId: 'task-1' })),
}))

import { parseActions } from '../src/actions/protocol/parse.js'
import { applyTaskActions } from '../src/manager/action-apply.js'
import { persistRuntimeState } from '../src/orchestrator/core/runtime-persistence.js'
import { notifyWorkerLoop } from '../src/orchestrator/core/worker-signal.js'
import { cancelTask } from '../src/worker/cancel-task.js'

import type { RuntimeState } from '../src/orchestrator/core/runtime-state.js'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

test('applyTaskActions triggers restart flow from restart_server action', async () => {
  const exitSpy = vi
    .spyOn(process, 'exit')
    .mockImplementation((() => undefined) as never)
  const parsed = parseActions('<MIMIKIT:actions>\n@restart_server\n</MIMIKIT:actions>')
  const runtime = { stopped: false } as RuntimeState

  await applyTaskActions(runtime, parsed.actions)
  expect(exitSpy).not.toHaveBeenCalled()

  await vi.advanceTimersByTimeAsync(100)

  expect(runtime.stopped).toBe(true)
  expect(vi.mocked(notifyWorkerLoop)).toHaveBeenCalledWith(runtime)
  expect(vi.mocked(persistRuntimeState)).toHaveBeenCalledWith(runtime)
  expect(exitSpy).toHaveBeenCalledWith(75)
})

test('applyTaskActions stops processing later actions after restart_server', async () => {
  const exitSpy = vi
    .spyOn(process, 'exit')
    .mockImplementation((() => undefined) as never)
  const parsed = parseActions(
    '<MIMIKIT:actions>\n@restart_server\n@cancel_task task_id="task-1"\n</MIMIKIT:actions>',
  )
  const runtime = { stopped: false } as RuntimeState

  await applyTaskActions(runtime, parsed.actions)
  await vi.advanceTimersByTimeAsync(100)

  expect(vi.mocked(cancelTask)).not.toHaveBeenCalled()
  expect(exitSpy).toHaveBeenCalledWith(75)
})
