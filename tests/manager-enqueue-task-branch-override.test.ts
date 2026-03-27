import { execFileSync } from 'node:child_process'
import { realpath } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, expect, test } from 'vitest'

import { INBOX_FOCUS_ID } from '../src/work/focus/constants.js'
import { applyTaskActions } from '../src/policy/manager/action-apply.js'
import { resolveRunTaskTarget } from '../src/policy/manager/run-task-target.js'
import {
  buildTaskContractFromDraft,
  resolveWorkerPromptFromDraft,
} from '../src/policy/manager/task-contract.js'
import {
  cleanupGitRepos,
  createGitRepo,
  resolveExpectedWorktreePath,
} from './helpers/git-repo.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

import type { RuntimeState } from '../src/kernel/orchestrator/runtime-state.js'
import type { ManagerTaskDraft } from '../src/policy/manager/manager-turn-schema.js'

const createRuntime = async (): Promise<RuntimeState> => {
  const runtime = await createTestRuntimeState({ pausedQueue: true })
  runtime.config.codex.enabled = true
  return runtime
}

const buildTaskDraft = (
  cwd: string,
  overrides: Partial<ManagerTaskDraft> = {},
): ManagerTaskDraft => ({
  title: 'manager action task',
  cwd,
  mode: 'write',
  goal: 'Deliver requested outcome',
  in_scope: ['Single runnable worker task'],
  out_of_scope: [],
  done_when: ['Return concrete output'],
  context_refs: [],
  instructions: [],
  ...overrides,
})

const enqueueTask = async (
  runtime: RuntimeState,
  task: ManagerTaskDraft,
): Promise<void> =>
  applyTaskActions(runtime, [
    {
      type: 'enqueue_task',
      task,
    },
  ])

afterEach(cleanupGitRepos)

test('enqueue_task write mode auto-materializes worktree cwd', async () => {
  const cwd = await createGitRepo()
  const runtime = await createRuntime()
  const repoKey = join(await realpath(cwd), '.git')

  await enqueueTask(runtime, buildTaskDraft(cwd, { title: 'auto worktree task' }))

  expect(runtime.tasks).toHaveLength(1)
  const task = runtime.tasks[0]
  expect(task?.repoKey).toBe(repoKey)
  expect(task?.resourceMode).toBe('write')
  expect(task?.branch).toMatch(/^task\//)
  const expectedWorktree = resolveExpectedWorktreePath(cwd, task?.branch ?? '')
  expect(task?.cwd).toBe(await realpath(expectedWorktree))
  expect(
    execFileSync('git', ['branch', '--show-current'], {
      cwd: task?.cwd,
      encoding: 'utf8',
    }).trim(),
  ).toBe(task?.branch)
}, 15_000)

test('enqueue_task read mode keeps repo cwd without creating a worktree', async () => {
  const cwd = await createGitRepo()
  const runtime = await createRuntime()

  await enqueueTask(runtime, buildTaskDraft(cwd, { title: 'read task', mode: 'read' }))

  expect(runtime.tasks).toHaveLength(1)
  expect(runtime.tasks[0]?.resourceMode).toBe('read')
  expect(runtime.tasks[0]?.cwd).toBe(await realpath(cwd))
  expect(runtime.tasks[0]?.branch).toBe('main')
})

test('enqueue_task maps repo subdirectory into auto-generated worktree cwd', async () => {
  const cwd = await createGitRepo()
  const nestedCwd = join(cwd, 'src')
  const runtime = await createRuntime()

  await enqueueTask(runtime, buildTaskDraft(nestedCwd, { title: 'nested task' }))

  expect(runtime.tasks).toHaveLength(1)
  const task = runtime.tasks[0]
  const expectedWorktree = resolveExpectedWorktreePath(cwd, task?.branch ?? '')
  expect(task?.cwd).toBe(join(await realpath(expectedWorktree), 'src'))
  expect(task?.branch).toMatch(/^task\//)
})

test('enqueue_task reuses existing auto-generated worktree for the same semantic task', async () => {
  const cwd = await createGitRepo()
  const runtime = await createRuntime()
  const task = buildTaskDraft(cwd, { title: 'reuse task' })
  const contract = buildTaskContractFromDraft(task)
  const prompt = resolveWorkerPromptFromDraft(task)
  if (!contract || !prompt) throw new Error('expected task contract and prompt')

  const target = await resolveRunTaskTarget({
    actionName: 'enqueue_task',
    cwd: task.cwd,
    resourceMode: task.mode,
    prompt,
    title: task.title,
    focusId: INBOX_FOCUS_ID,
    contract,
  })
  if (!target.branch) throw new Error('expected auto-generated branch')

  await enqueueTask(runtime, task)

  expect(runtime.tasks).toHaveLength(1)
  expect(runtime.tasks[0]?.cwd).toBe(await realpath(target.cwd))
  expect(runtime.tasks[0]?.branch).toBe(target.branch)
})

test('enqueue_task keeps same-batch tasks distinct across unique task drafts', async () => {
  const cwd = await createGitRepo()
  const runtime = await createRuntime()

  await applyTaskActions(runtime, [
    {
      type: 'enqueue_task',
      task: buildTaskDraft(cwd, { title: 'same title a' }),
    },
    {
      type: 'enqueue_task',
      task: buildTaskDraft(cwd, { title: 'same title b' }),
    },
  ])

  expect(runtime.tasks).toHaveLength(2)
  expect(runtime.tasks[0]?.branch).not.toBe(runtime.tasks[1]?.branch)
  expect(runtime.tasks[0]?.cwd).not.toBe(runtime.tasks[1]?.cwd)
})
