import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, test, vi } from 'vitest'

import { readHistory } from '../src/history/store.js'
import type { RuntimeState } from '../src/orchestrator/core/runtime-state.js'
import { requestTaskResumeChoice } from '../src/orchestrator/core/task-resume-choice.js'
import {
  resolvePendingUserChoiceTimeout,
  selectPendingUserChoiceFromUser,
} from '../src/orchestrator/core/user-choice.js'
import type { Task } from '../src/types/index.js'
import { pauseTask } from '../src/worker/pause-task.js'
import {
  resumeRecoverableTasks,
  resumeTask,
} from '../src/worker/resume-task.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

const tempDirs: string[] = []

const createTmpDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mimikit-pause-resume-'))
  tempDirs.push(dir)
  return dir
}

const createRuntime = async (params?: {
  queue?: Partial<RuntimeState['worker']['queue']>
}): Promise<RuntimeState> => {
  const workDir = await createTmpDir()
  const runtime = await createTestRuntimeState({
    workDir,
    runtimeId: 'runtime-pause-resume-test',
    withGlobalFocus: false,
  })
  runtime.worker.queue = {
    add: async () => undefined,
    clear: () => undefined,
    pause: () => undefined,
    sizeBy: () => 0,
    ...params?.queue,
  } as RuntimeState['worker']['queue']
  return runtime
}

const createTask = (id: string, overrides: Partial<Task> = {}): Task => ({
  id,
  fingerprint: `fp-${id}`,
  prompt: 'run task',
  title: 'Run Task',
  cwd: '/tmp/pause-resume-task',
  focusId: 'focus-global',
  profile: 'worker',
  provider: 'codex',
  status: 'pending',
  createdAt: '2026-03-06T00:00:00.000Z',
  ...overrides,
})

afterEach(async () => {
  for (const dir of tempDirs.splice(0, tempDirs.length))
    await rm(dir, { recursive: true, force: true })
})

test('pauseTask marks pending task as paused and writes task_paused event', async () => {
  const runtime = await createRuntime()
  const task = createTask('task-pause-pending')
  runtime.tasks = [task]

  const result = await pauseTask(runtime, task.id, { source: 'user' })

  expect(result).toMatchObject({
    ok: true,
    id: task.id,
    status: 'paused',
  })
  expect(task.status).toBe('paused')
  expect(task.pausedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  expect(runtime.ui.wakeVersion).toBe(1)
  const history = await readHistory(runtime.paths.history)
  const event = history
    .map((item) =>
      item.role === 'system'
        ? {
            name: item.systemEventName,
            payload: item.systemEventPayload,
          }
        : null,
    )
    .find((item) => item.name === 'task_paused')
  expect(event?.payload?.task_id).toBe(task.id)
})

test('pauseTask aborts running controller', async () => {
  const runtime = await createRuntime()
  const task = createTask('task-pause-running', {
    status: 'running',
    startedAt: '2026-03-06T00:00:02.000Z',
  })
  runtime.tasks = [task]
  const controller = new AbortController()
  runtime.worker.runningControllers.set(task.id, controller)

  const result = await pauseTask(runtime, task.id, { source: 'user' })

  expect(result).toMatchObject({
    ok: true,
    id: task.id,
    status: 'paused',
  })
  expect(controller.signal.aborted).toBe(true)
  expect(task.status).toBe('paused')
})

test('resumeTask re-queues paused task and writes task_resumed event', async () => {
  const queueAdd = vi.fn(async () => undefined)
  const runtime = await createRuntime({
    queue: {
      add: queueAdd as RuntimeState['worker']['queue']['add'],
      sizeBy: () => 0,
    },
  })
  const task = createTask('task-resume', {
    status: 'paused',
    pausedAt: '2026-03-06T00:00:03.000Z',
    archivePath: '/tmp/task-partial.md',
    result: {
      taskId: 'task-resume',
      status: 'partial',
      taskStatus: 'paused',
      outcome: 'partial',
      stopReason: 'budget_exhausted',
      ok: false,
      output: 'partial',
      durationMs: 12,
      completedAt: '2026-03-06T00:00:04.000Z',
      archivePath: '/tmp/task-partial.md',
    },
  })
  runtime.tasks = [task]

  const result = await resumeTask(runtime, task.id, { source: 'user' })

  expect(result).toMatchObject({
    ok: true,
    id: task.id,
    status: 'pending',
  })
  expect(task.status).toBe('pending')
  expect(task.pausedAt).toBeUndefined()
  expect(task.archivePath).toBeUndefined()
  expect(task.result).toBeUndefined()
  expect(queueAdd).toHaveBeenCalledTimes(1)
  const history = await readHistory(runtime.paths.history)
  const event = history
    .map((item) =>
      item.role === 'system'
        ? {
            name: item.systemEventName,
            payload: item.systemEventPayload,
          }
        : null,
    )
    .find((item) => item.name === 'task_resumed')
  expect(event?.payload?.task_id).toBe(task.id)
})

test('budget pause choice can resume paused partial task directly', async () => {
  const queueAdd = vi.fn(async () => undefined)
  const runtime = await createRuntime({
    queue: {
      add: queueAdd as RuntimeState['worker']['queue']['add'],
      sizeBy: () => 0,
    },
  })
  const task = createTask('task-budget-resume', {
    status: 'paused',
    pausedAt: '2026-03-06T00:00:03.000Z',
    archivePath: '/tmp/task-budget-resume.md',
    result: {
      taskId: 'task-budget-resume',
      status: 'partial',
      taskStatus: 'paused',
      outcome: 'partial',
      stopReason: 'budget_exhausted',
      ok: false,
      output: 'partial',
      durationMs: 12,
      completedAt: '2026-03-06T00:00:04.000Z',
      archivePath: '/tmp/task-budget-resume.md',
    },
  })
  runtime.tasks = [task]

  const requested = await requestTaskResumeChoice({
    runtime,
    task,
  })

  expect(requested).toBe(true)
  expect(runtime.ui.pendingUserChoice?.effect).toMatchObject({
    type: 'resume_task',
    taskId: task.id,
  })
  expect(runtime.ui.pendingUserChoice?.expiresAt).toBeUndefined()

  const choice = runtime.ui.pendingUserChoice
  if (!choice?.effect || choice.effect.type !== 'resume_task')
    throw new Error('expected resume_task choice')

  const result = await selectPendingUserChoiceFromUser(
    runtime,
    choice.id,
    choice.effect.optionId,
  )

  expect(result).toMatchObject({
    ok: true,
    choiceId: choice.id,
    optionId: choice.effect.optionId,
    source: 'user',
    effect: {
      type: 'resume_task',
      taskId: task.id,
      ok: true,
      status: 'pending',
    },
  })
  expect(runtime.ui.pendingUserChoice).toBeNull()
  expect(task.status).toBe('pending')
  expect(task.result).toBeUndefined()
  expect(queueAdd).toHaveBeenCalledTimes(1)

  const systemInput = runtime.session.inflightInputs.find(
    (item) => item.role === 'system',
  )
  expect(systemInput?.role).toBe('system')
  if (systemInput?.role !== 'system') return
  expect(systemInput.systemEventName).toBe('user_choice')
  expect(systemInput.systemEventPayload).toMatchObject({
    choice_id: choice.id,
    choice_effect_type: 'resume_task',
    choice_effect_task_id: task.id,
    choice_effect_ok: true,
    choice_effect_status: 'pending',
    selected_option_id: choice.effect.optionId,
  })
})

test('pending resume choice persists without timeout until a user selects it', async () => {
  const runtime = await createRuntime()
  const task = createTask('task-budget-persist', {
    status: 'paused',
    pausedAt: '2026-03-06T00:00:03.000Z',
    result: {
      taskId: 'task-budget-persist',
      status: 'partial',
      taskStatus: 'paused',
      outcome: 'partial',
      stopReason: 'budget_exhausted',
      ok: false,
      output: 'partial',
      durationMs: 12,
      completedAt: '2026-03-06T00:00:04.000Z',
    },
  })
  runtime.tasks = [task]

  const requested = await requestTaskResumeChoice({
    runtime,
    task,
    createdAt: '2026-03-06T00:00:04.000Z',
  })

  expect(requested).toBe(true)
  expect(
    await resolvePendingUserChoiceTimeout(
      runtime,
      Date.parse('2026-03-07T00:00:04.000Z'),
    ),
  ).toBe(false)
  expect(runtime.ui.pendingUserChoice?.id).toBe(
    'choice-task-resume-task-budget-persist',
  )
})

test('resumeRecoverableTasks requeues all budget-recoverable tasks only', async () => {
  const queueAdd = vi.fn(async () => undefined)
  const runtime = await createRuntime({
    queue: {
      add: queueAdd as RuntimeState['worker']['queue']['add'],
      sizeBy: () => 0,
    },
  })
  const recoverableA = createTask('task-budget-a', {
    status: 'paused',
    pausedAt: '2026-03-06T00:00:03.000Z',
    result: {
      taskId: 'task-budget-a',
      status: 'partial',
      taskStatus: 'paused',
      outcome: 'partial',
      stopReason: 'budget_exhausted',
      ok: false,
      output: 'partial a',
      durationMs: 12,
      completedAt: '2026-03-06T00:00:04.000Z',
    },
  })
  const recoverableB = createTask('task-budget-b', {
    status: 'paused',
    pausedAt: '2026-03-06T00:00:05.000Z',
    result: {
      taskId: 'task-budget-b',
      status: 'partial',
      taskStatus: 'paused',
      outcome: 'partial',
      stopReason: 'budget_exhausted',
      ok: false,
      output: 'partial b',
      durationMs: 12,
      completedAt: '2026-03-06T00:00:06.000Z',
    },
  })
  const manualPaused = createTask('task-manual-pause', {
    status: 'paused',
    pausedAt: '2026-03-06T00:00:07.000Z',
  })
  runtime.tasks = [recoverableA, recoverableB, manualPaused]

  const result = await resumeRecoverableTasks(runtime)

  expect(result).toMatchObject({
    ok: true,
    resumedCount: 2,
    skippedCount: 0,
  })
  expect(recoverableA.status).toBe('pending')
  expect(recoverableB.status).toBe('pending')
  expect(manualPaused.status).toBe('paused')
  expect(queueAdd).toHaveBeenCalledTimes(2)
})

test('budget pause writes visible fallback note when another choice is pending', async () => {
  const runtime = await createRuntime()
  runtime.ui.pendingUserChoice = {
    id: 'choice-existing',
    question: 'Choose output format',
    options: [
      { id: 'option-a', label: 'A', reason: 'reason-a' },
      { id: 'option-b', label: 'B', reason: 'reason-b' },
    ],
    defaultOptionId: 'option-a',
    createdAt: '2026-03-06T00:00:00.000Z',
    expiresAt: '2026-03-06T00:05:00.000Z',
    focusId: 'focus-global',
  }
  const task = createTask('task-budget-busy', {
    status: 'paused',
    pausedAt: '2026-03-06T00:00:03.000Z',
  })

  const requested = await requestTaskResumeChoice({
    runtime,
    task,
    createdAt: '2026-03-06T00:00:04.000Z',
  })

  expect(requested).toBe(false)
  const history = await readHistory(runtime.paths.history)
  const note = history.find((item) =>
    item.text.includes('Use Continue in the task list to resume when ready.'),
  )
  expect(note?.role).toBe('system')
})
