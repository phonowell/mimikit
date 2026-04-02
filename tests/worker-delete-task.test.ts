import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, test } from 'vitest'

import { deleteTask } from '../src/execution/worker/delete-task.js'
import { appendHistory, readHistory } from '../src/persistence/history/store.js'
import { appendTaskSystemMessage } from '../src/persistence/history/task-events.js'
import { loadRuntimeSnapshot } from '../src/persistence/storage/runtime-snapshot.js'

import { createTestRuntimeState } from './helpers/runtime-state.js'

import type { Task } from '../src/foundation/types/index.js'
import type { RuntimeState } from '../src/kernel/orchestrator/runtime-state.js'

const tempDirs: string[] = []

const createTmpDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mimikit-delete-task-'))
  tempDirs.push(dir)
  return dir
}

const createRuntime = async (): Promise<RuntimeState> => {
  const workDir = await createTmpDir()
  const runtime = await createTestRuntimeState({
    workDir,
    runtimeId: 'runtime-delete-task-test',
    withGlobalFocus: false,
  })
  const queue: RuntimeState['process']['worker']['queue'] = {
    add: () => Promise.resolve(undefined),
    clear: () => undefined,
    pause: () => undefined,
    sizeBy: () => 0,
  }
  runtime.process.worker.queue = queue
  return runtime
}

const createTask = (id: string, overrides: Partial<Task> = {}): Task => ({
  id,
  fingerprint: `fp-${id}`,
  prompt: 'run task',
  title: 'Run Task',
  cwd: '/tmp/delete-task',
  focusId: 'focus-global',
  profile: 'worker',
  provider: 'codex',
  status: 'succeeded',
  createdAt: '2026-03-06T00:00:00.000Z',
  completedAt: '2026-03-06T00:01:00.000Z',
  durationMs: 1000,
  ...overrides,
})

afterEach(async () => {
  for (const dir of tempDirs.splice(0, tempDirs.length))
    await rm(dir, { recursive: true, force: true })
})

test('deleteTask rejects active task', async () => {
  const runtime = await createRuntime()
  const task = createTask('task-active-delete', { status: 'running' })
  runtime.domain.tasks = [task]

  const result = await deleteTask(runtime, task.id, { source: 'user' })

  expect(result).toMatchObject({
    ok: false,
    id: task.id,
    status: 'active_task',
  })
  expect(runtime.domain.tasks).toHaveLength(1)
})

test('deleteTask hard-deletes runtime, history, archives and generated files', async () => {
  const runtime = await createRuntime()
  const taskId = 'task-delete-hard'
  const archivePath = join(
    runtime.config.workDir,
    'tasks/2026-03-06',
    `${taskId}_run-task.md`,
  )
  const progressPath = join(
    runtime.config.workDir,
    'task-progress/2026-03-06',
    `${taskId}.jsonl`,
  )
  const promptPath = join(
    runtime.config.workDir,
    'generated/worker-task-prompts/2026-03-06',
    `${taskId}.md`,
  )
  await mkdir(join(runtime.config.workDir, 'tasks/2026-03-06'), {
    recursive: true,
  })
  await mkdir(join(runtime.config.workDir, 'task-progress/2026-03-06'), {
    recursive: true,
  })
  await mkdir(
    join(runtime.config.workDir, 'generated/worker-task-prompts/2026-03-06'),
    { recursive: true },
  )
  await writeFile(archivePath, '# archive', 'utf8')
  await writeFile(progressPath, '{"taskId":"x"}\n', 'utf8')
  await writeFile(promptPath, '# prompt', 'utf8')

  const task = createTask(taskId, {
    archivePath,
    result: {
      taskId,
      status: 'succeeded',
      ok: true,
      output: 'done',
      durationMs: 1000,
      completedAt: '2026-03-06T00:01:00.000Z',
      archivePath,
    },
  })
  runtime.domain.tasks = [task]
  await appendTaskSystemMessage(runtime.paths.history, 'created', task)
  await appendTaskSystemMessage(runtime.paths.history, 'completed', task, {
    status: 'succeeded',
  })
  await appendHistory(runtime.paths.history, {
    id: 'input-1',
    role: 'user',
    text: 'keep-me',
    createdAt: '2026-03-06T00:00:00.000Z',
    focusId: 'focus-global',
  })
  await appendTaskSystemMessage(runtime.paths.history, 'created', task)

  const result = await deleteTask(runtime, taskId, {
    source: 'user',
    reason: 'cleanup',
  })

  expect(result).toMatchObject({ ok: true, id: taskId, status: 'deleted' })
  expect(runtime.domain.tasks).toEqual([])
  const history = await readHistory(runtime.paths.history)
  expect(
    history.some(
      (item) => item.role === 'system' && item.text.includes(`"${taskId}"`),
    ),
  ).toBe(false)
  expect(
    history.some((item) => item.role === 'user' && item.text === 'keep-me'),
  ).toBe(true)
  await expect(access(archivePath)).rejects.toBeDefined()
  await expect(access(progressPath)).rejects.toBeDefined()
  await expect(access(promptPath)).rejects.toBeDefined()
  const snapshot = await loadRuntimeSnapshot(runtime.config.workDir)
  expect(snapshot.tasks.some((item) => item.id === taskId)).toBe(false)
})
