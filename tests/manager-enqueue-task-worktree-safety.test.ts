import { access, mkdir, writeFile } from 'node:fs/promises'

import { afterEach, expect, test } from 'vitest'

import { readHistory } from '../src/history/store.js'
import { applyTaskActions } from '../src/manager/action-apply.js'
import {
  cleanupGitRepos,
  createGitRepo,
  resolveExpectedWorktreePath,
} from './helpers/git-repo.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

const CONTRACT_ATTRS = {
  goal: 'Deliver requested outcome',
  in_scope: 'Single runnable worker task',
  done_when_1: 'Return concrete output',
}

const createRuntime = async () => {
  const runtime = await createTestRuntimeState({ pausedQueue: true })
  runtime.config.codex.enabled = true
  return runtime
}

afterEach(cleanupGitRepos)

test('enqueue_task does not create worktree before confirmation is granted', async () => {
  const cwd = await createGitRepo()
  const runtime = await createRuntime()
  const expectedWorktree = resolveExpectedWorktreePath(cwd, 'feat/high-cost-task')

  await applyTaskActions(runtime, [
    {
      name: 'enqueue_task',
      attrs: {
        worker_prompt: 'x'.repeat(1_300),
        title: 'high cost task',
        cwd,
        branch: 'feat/high-cost-task',
        ...CONTRACT_ATTRS,
      },
    },
  ])

  expect(runtime.tasks).toHaveLength(0)
  expect(runtime.ui.pendingUserChoices).toHaveLength(1)
  await expect(access(expectedWorktree)).rejects.toThrow()
})

test('enqueue_task worktree prepare failure appends action feedback without throwing', async () => {
  const cwd = await createGitRepo()
  const runtime = await createRuntime()
  const expectedWorktree = resolveExpectedWorktreePath(cwd, 'feat/conflict-task')

  await mkdir(expectedWorktree, { recursive: true })
  await writeFile(`${expectedWorktree}/occupied.txt`, 'conflict\n', 'utf8')

  await expect(
    applyTaskActions(runtime, [
      {
        name: 'enqueue_task',
        attrs: {
          worker_prompt: 'same prompt',
          title: 'conflict task',
          cwd,
          branch: 'feat/conflict-task',
          ...CONTRACT_ATTRS,
        },
      },
    ]),
  ).resolves.toBeUndefined()

  expect(runtime.tasks).toHaveLength(0)
  const history = await readHistory(runtime.paths.history)
  const actionFeedback = history.find(
    (item) => item.role === 'system' && item.systemEventName === 'action_feedback',
  )
  expect(actionFeedback?.text).toContain('无法为 branch=feat/conflict-task 准备 worktree')
})
