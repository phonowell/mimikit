import { execFileSync } from 'node:child_process'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, test } from 'vitest'

import { applyTaskActions } from '../src/manager/action-apply.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

import type { RuntimeState } from '../src/orchestrator/core/runtime-state.js'

const CONTRACT_ATTRS = {
  goal: 'Deliver requested outcome',
  in_scope: 'Single runnable worker task',
  done_when_1: 'Return concrete output',
}

const tempDirs: string[] = []

const createGitRepo = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mimikit-branch-override-'))
  tempDirs.push(dir)
  execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' })
  execFileSync('git', ['checkout', '-b', 'main'], { cwd: dir, stdio: 'ignore' })
  return dir
}

const createRuntime = async (): Promise<RuntimeState> => {
  const runtime = await createTestRuntimeState({ pausedQueue: true })
  runtime.config.codex.enabled = true
  runtime.config.opencode.enabled = false
  return runtime
}

afterEach(async () => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    await rm(dir, { recursive: true, force: true })
  }
})

test('enqueue_task branch attr overrides resolved cwd branch', async () => {
  const cwd = await createGitRepo()
  const runtime = await createRuntime()
  const repoKey = join(await realpath(cwd), '.git')

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
  expect(runtime.tasks[0]?.branch).toBe('main')
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
})
