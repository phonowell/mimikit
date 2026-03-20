import { execFileSync } from 'node:child_process'
import { realpath } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, expect, test } from 'vitest'

import { applyTaskActions } from '../src/manager/action-apply.js'
import {
  cleanupGitRepos,
  createGitRepo,
  resolveExpectedWorktreePath,
} from './helpers/git-repo.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

import type { RuntimeState } from '../src/orchestrator/core/runtime-state.js'

const CONTRACT_ATTRS = {
  goal: 'Deliver requested outcome',
  in_scope: 'Single runnable worker task',
  done_when_1: 'Return concrete output',
}

const createRuntime = async (): Promise<RuntimeState> => {
  const runtime = await createTestRuntimeState({ pausedQueue: true })
  runtime.config.codex.enabled = true
  runtime.config.opencode.enabled = false
  return runtime
}

afterEach(cleanupGitRepos)

test('enqueue_task branch attr materializes worktree cwd', async () => {
  const cwd = await createGitRepo()
  const runtime = await createRuntime()
  const repoKey = join(await realpath(cwd), '.git')
  const expectedWorktree = resolveExpectedWorktreePath(
    cwd,
    'feat/webui-pending-reason',
  )

  await applyTaskActions(runtime, [
    {
      name: 'enqueue_task',
      attrs: {
        worker_prompt: 'same prompt',
        title: 'branch override task',
        cwd,
        branch: 'feat/webui-pending-reason',
        ...CONTRACT_ATTRS,
      },
    },
  ])

  expect(runtime.tasks).toHaveLength(1)
  expect(runtime.tasks[0]?.repoKey).toBe(repoKey)
  expect(runtime.tasks[0]?.branch).toBe('feat/webui-pending-reason')
  expect(runtime.tasks[0]?.cwd).toBe(await realpath(expectedWorktree))
  expect(
    execFileSync('git', ['branch', '--show-current'], {
      cwd: runtime.tasks[0]?.cwd,
      encoding: 'utf8',
    }).trim(),
  ).toBe('feat/webui-pending-reason')
})

test('enqueue_task keeps resolved cwd branch when branch attr is absent', async () => {
  const cwd = await createGitRepo()
  const runtime = await createRuntime()

  await applyTaskActions(runtime, [
    {
      name: 'enqueue_task',
      attrs: {
        worker_prompt: 'same prompt',
        title: 'default branch task',
        cwd,
        ...CONTRACT_ATTRS,
      },
    },
  ])

  expect(runtime.tasks).toHaveLength(1)
  expect(runtime.tasks[0]?.cwd).toBe(await realpath(cwd))
  expect(runtime.tasks[0]?.branch).toBe('main')
})

test('enqueue_task maps repo subdirectory into branch worktree cwd', async () => {
  const cwd = await createGitRepo()
  const nestedCwd = join(cwd, 'src')
  const runtime = await createRuntime()
  const expectedWorktree = resolveExpectedWorktreePath(cwd, 'docs/dev-handbook')

  await applyTaskActions(runtime, [
    {
      name: 'enqueue_task',
      attrs: {
        worker_prompt: 'same prompt',
        title: 'nested task',
        cwd: nestedCwd,
        branch: 'docs/dev-handbook',
        ...CONTRACT_ATTRS,
      },
    },
  ])

  expect(runtime.tasks).toHaveLength(1)
  expect(runtime.tasks[0]?.cwd).toBe(join(await realpath(expectedWorktree), 'src'))
  expect(runtime.tasks[0]?.branch).toBe('docs/dev-handbook')
})

test('enqueue_task reuses existing worktree for the requested branch', async () => {
  const cwd = await createGitRepo()
  const runtime = await createRuntime()
  const existingWorktree = resolveExpectedWorktreePath(
    cwd,
    'feat/webui-pending-reason',
  )

  execFileSync(
    'git',
    ['worktree', 'add', '-b', 'feat/webui-pending-reason', existingWorktree],
    { cwd, stdio: 'ignore' },
  )

  await applyTaskActions(runtime, [
    {
      name: 'enqueue_task',
      attrs: {
        worker_prompt: 'same prompt',
        title: 'reuse task',
        cwd,
        branch: 'feat/webui-pending-reason',
        ...CONTRACT_ATTRS,
      },
    },
  ])

  expect(runtime.tasks).toHaveLength(1)
  expect(runtime.tasks[0]?.cwd).toBe(await realpath(existingWorktree))
  expect(runtime.tasks[0]?.branch).toBe('feat/webui-pending-reason')
})

test('enqueue_task keeps same-batch tasks distinct across explicit branches', async () => {
  const cwd = await createGitRepo()
  const runtime = await createRuntime()

  await applyTaskActions(runtime, [
    {
      name: 'enqueue_task',
      attrs: {
        worker_prompt: 'same prompt',
        title: 'same title',
        cwd,
        branch: 'docs/dev-handbook',
        ...CONTRACT_ATTRS,
      },
    },
    {
      name: 'enqueue_task',
      attrs: {
        worker_prompt: 'same prompt',
        title: 'same title',
        cwd,
        branch: 'feat/webui-pending-reason',
        ...CONTRACT_ATTRS,
      },
    },
  ])

  expect(runtime.tasks).toHaveLength(2)
  expect(runtime.tasks.map((task) => task.branch)).toEqual([
    'docs/dev-handbook',
    'feat/webui-pending-reason',
  ])
  expect(new Set(runtime.tasks.map((task) => task.cwd)).size).toBe(2)
})
