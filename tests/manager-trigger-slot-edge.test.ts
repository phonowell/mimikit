import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import PQueue from 'p-queue'
import { beforeEach, expect, test, vi } from 'vitest'

import { safeProcessLoopTriggers } from '../src/policy/manager/loop-triggers.js'
import { GLOBAL_FOCUS_ID } from '../src/work/focus/constants.js'

import { createTestRuntimeState } from './helpers/runtime-state.js'

import type { WorkerLlmResult } from '../src/execution/worker/run-retry.js'
import type { RuntimeState } from '../src/kernel/orchestrator/runtime-state.js'

const { runTaskWithRetryMock } = vi.hoisted(() => ({
  runTaskWithRetryMock: vi.fn(),
}))

vi.mock('../src/execution/worker/run-retry.js', () => ({
  runTaskWithRetry: runTaskWithRetryMock,
}))

const buildTaskDraft = (title: string, cwd: string) => ({
  title,
  cwd,
  mode: 'write' as const,
  goal: `Deliver ${title}`,
  in_scope: [`Only handle ${title}`],
  out_of_scope: [],
  done_when: [`${title} finished`],
  context_refs: [],
  instructions: [],
})

const createRuntime = async (): Promise<RuntimeState> => {
  const runtime = await createTestRuntimeState({ maxConcurrent: 2 })
  runtime.config.codex.enabled = true
  runtime.process.worker.queue = new PQueue({
    concurrency: runtime.config.worker.maxConcurrent,
  })
  return runtime
}

const createEnqueuePlan = async (
  id: string,
  title: string,
  runtime: RuntimeState,
) => {
  const now = new Date().toISOString()
  const taskCwd = join(runtime.config.workDir, title)
  await mkdir(taskCwd, { recursive: true })
  const task = buildTaskDraft(title, taskCwd)
  await import('../src/policy/manager/action-plan-effect-enqueue.js').then(
    async ({ buildPlanEnqueueTaskEffect }) => {
      const effect = await buildPlanEnqueueTaskEffect({
        stateDir: runtime.config.workDir,
        focusId: GLOBAL_FOCUS_ID,
        task,
      })
      runtime.domain.taskPlans.push({
        id,
        title,
        focusId: GLOBAL_FOCUS_ID,
        priority: 'normal',
        status: 'active',
        trigger: { mode: 'on_worker_slot_freed' },
        effect,
        createdAt: now,
        updatedAt: now,
        runtime: { runCount: 0 },
      })
    },
  )
}

const waitForCondition = async (
  check: () => boolean,
  timeoutMs = 3_000,
): Promise<void> => {
  const startedAt = Date.now()
  while (!check()) {
    if (Date.now() - startedAt > timeoutMs)
      throw new Error(`wait_timeout_${timeoutMs}ms`)
    await new Promise<void>((resolve) => setTimeout(resolve, 10))
  }
}

beforeEach(() => {
  runTaskWithRetryMock.mockReset()
})

test('safeProcessLoopTriggers preserves release-edge detection after a plan consumes the freed slot', async () => {
  const runtime = await createRuntime()
  await createEnqueuePlan('plan-edge-1', 'task-one', runtime)
  await createEnqueuePlan('plan-edge-2', 'task-two', runtime)

  let resolveFirstRun: (() => void) | undefined
  const firstRunDone = new Promise<void>((resolve) => {
    resolveFirstRun = resolve
  })
  runTaskWithRetryMock.mockImplementationOnce(
    async (): Promise<WorkerLlmResult> => {
      await firstRunDone
      return { output: 'done', elapsedMs: 1 }
    },
  )

  runtime.process.worker.runningControllers.set(
    'task-busy-initial',
    new AbortController(),
  )
  const triggerState = {
    lastAvailableSlots: null,
    workerSlotEventPending: false,
    lastWorkerSlotEventAtMs: 0,
  }

  const firstChanged = await safeProcessLoopTriggers(runtime, triggerState)

  await waitForCondition(() =>
    runtime.process.worker.runningControllers.has(
      runtime.domain.tasks[0]?.id ?? '',
    ),
  )
  expect(firstChanged).toBe(true)
  expect(runtime.domain.taskPlans[0]?.runtime.runCount).toBe(1)
  expect(runtime.domain.taskPlans[1]?.runtime.runCount).toBe(0)
  expect(triggerState.lastAvailableSlots).toBe(0)

  runtime.process.worker.runningControllers.delete('task-busy-initial')
  triggerState.lastWorkerSlotEventAtMs = 0

  const secondChanged = await safeProcessLoopTriggers(runtime, triggerState)

  expect(secondChanged).toBe(true)
  expect(runtime.domain.taskPlans[1]?.runtime.runCount).toBe(1)
  expect(runtime.domain.tasks.map((task) => task.title)).toEqual([
    'task-one',
    'task-two',
  ])

  resolveFirstRun?.()
  await runtime.process.worker.queue.onIdle()
})
