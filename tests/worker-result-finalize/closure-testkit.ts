import { join } from 'node:path'

import { createTestRuntimeState } from '../helpers/runtime-state.js'

import type { Task, TaskResult } from '../../src/foundation/types/index.js'

export const LOCAL_FOCUS = {
  id: 'focus-local',
  title: 'Local',
  status: 'active' as const,
  createdAt: '2026-04-01T03:00:00.000Z',
  updatedAt: '2026-04-01T03:00:00.000Z',
  lastActivityAt: '2026-04-01T03:00:00.000Z',
}

export const createClosureSourceTask = (params: {
  id: string
  title: string
  executionSpecId: string
  worktreeRoot: string
  branch: string
  repoKey?: string
  acceptance: string[]
}): Task => ({
  id: params.id,
  fingerprint: params.id,
  semanticKey: params.id,
  executionSpecId: params.executionSpecId,
  title: params.title,
  cwd: params.worktreeRoot,
  resourceMode: 'write',
  ...(params.repoKey ? { repoKey: params.repoKey } : {}),
  branch: params.branch,
  git: {
    worktreePath: params.worktreeRoot,
    branch: params.branch,
    closureRequired: true,
  },
  contract: {
    goal: '完成实现并给出结果说明',
    scope: '在独立 wt 完成实现与验证',
    acceptance: params.acceptance,
  },
  focusId: LOCAL_FOCUS.id,
  profile: 'worker',
  provider: 'codex',
  status: 'running',
  createdAt: '2026-04-01T03:00:00.000Z',
  startedAt: '2026-04-01T03:00:10.000Z',
})

export const createClosureRuntime = (repoRoot: string, task: Task) =>
  createTestRuntimeState({
    workDir: repoRoot,
    withGlobalFocus: false,
    pausedQueue: true,
    patch: {
      tasks: [task],
      focuses: [LOCAL_FOCUS],
    },
  })

export const createClosureSuccessResult = (taskId: string): TaskResult => ({
  taskId,
  status: 'succeeded',
  ok: true,
  output: '实现与门禁都已完成，等待主仓收尾。',
  durationMs: 90,
  completedAt: '2026-04-01T03:30:00.000Z',
})

export const createRepoKey = (repoRoot: string): string =>
  join(repoRoot, '.git')
