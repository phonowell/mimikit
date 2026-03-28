import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import { afterEach, expect, test } from 'vitest'

import { readHistory } from '../src/persistence/history/store.js'
import { readJsonl } from '../src/persistence/storage/jsonl.js'
import { applyTaskActions } from '../src/policy/manager/action-apply.js'
import { resolveRunTaskTarget } from '../src/policy/manager/run-task-target.js'
import {
  buildTaskContractFromDraft,
  resolveWorkerPromptFromDraft,
} from '../src/policy/manager/task-contract.js'
import { INBOX_FOCUS_ID } from '../src/work/focus/constants.js'

import { cleanupGitRepos, createGitRepo } from './helpers/git-repo.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

import type { ManagerTaskDraft } from '../src/policy/manager/manager-turn-schema.js'

const createRuntime = async () => {
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
  use_worktree: false,
  ...overrides,
})

afterEach(cleanupGitRepos)

test('enqueue_task write mode rejects a nonexistent future worktree cwd', async () => {
  const cwd = await createGitRepo()
  const runtime = await createRuntime()
  const futureWorktreeCwd = join(dirname(cwd), `${basename(cwd)}-future-wt`)

  await expect(
    applyTaskActions(runtime, [
      {
        type: 'enqueue_task',
        task: buildTaskDraft(futureWorktreeCwd, {
          title: 'future worktree task',
        }),
      },
    ]),
  ).resolves.toBeUndefined()

  expect(runtime.tasks).toHaveLength(0)
  const logs = await readJsonl<Record<string, unknown>>(runtime.paths.log, {
    ensureFile: true,
  })
  const feedback = logs.find(
    (entry) => entry.event === 'manager_action_apply_feedback',
  )
  expect(feedback).toMatchObject({
    action: 'enqueue_task',
    error: 'action_execution_rejected',
  })
})

test('enqueue_task worktree prepare failure appends action feedback without throwing', async () => {
  const cwd = await createGitRepo()
  const runtime = await createRuntime()
  const task = buildTaskDraft(cwd, { title: 'conflict task' })
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
    useWorktree: true,
  })

  if (!target.branch) throw new Error('expected auto-generated branch')
  execFileSync('git', ['worktree', 'remove', '--force', target.cwd], {
    cwd,
    stdio: 'ignore',
  })
  await mkdir(target.cwd, { recursive: true })
  await writeFile(`${target.cwd}/occupied.txt`, 'conflict\n', 'utf8')

  await expect(
    applyTaskActions(runtime, [
      {
        type: 'enqueue_task',
        task: {
          ...task,
          use_worktree: true,
        },
      },
    ]),
  ).resolves.toBeUndefined()

  expect(runtime.tasks).toHaveLength(0)
  const history = await readHistory(runtime.paths.history)
  const triggerFire = history.find(
    (item) => item.role === 'system' && item.systemEventName === 'trigger_fire',
  )
  expect(triggerFire).toBeUndefined()
}, 15_000)

test('enqueue_task rejects repo-internal cwd when mapped worktree subpath is missing', async () => {
  const cwd = await createGitRepo()
  const runtime = await createRuntime()
  const stateDirCwd = join(cwd, '.mimikit')
  await mkdir(stateDirCwd, { recursive: true })

  await expect(
    applyTaskActions(runtime, [
      {
        type: 'enqueue_task',
        task: buildTaskDraft(stateDirCwd, {
          title: 'state dir task',
        }),
      },
    ]),
  ).resolves.toBeUndefined()

  expect(runtime.tasks).toHaveLength(0)
  const logs = await readJsonl<Record<string, unknown>>(runtime.paths.log, {
    ensureFile: true,
  })
  const feedback = logs.find(
    (entry) => entry.event === 'manager_action_apply_feedback',
  ) as { hint?: string } | undefined
  expect(feedback?.hint).toContain('映射后的 cwd')
  expect(feedback?.hint).toContain('.mimikit')
  expect(feedback?.hint).toContain('不存在')
})
