import { expect } from 'vitest'

import { createTaskFixture } from './helpers/runtime-snapshot.js'

import type { Task } from '../src/foundation/types/index.js'

const SOURCE_LIFECYCLE = {
  review: { passed: false },
  merged: false,
  cleaned: false,
} as const

export const createSourceTaskFixture = (params: {
  id: string
  repoKey: string
  branch: string
  worktreePath: string
}): Task =>
  createTaskFixture({
    id: params.id,
    repoKey: params.repoKey,
    branch: params.branch,
    git: {
      worktreePath: params.worktreePath,
      branch: params.branch,
      closureRequired: true,
      lifecycle: SOURCE_LIFECYCLE,
    },
    result: {
      taskId: params.id,
      status: 'succeeded',
      ok: true,
      output: 'waiting for closure',
      durationMs: 1,
      completedAt: '2026-02-06T00:02:00.000Z',
      handoff: {
        summary: 'waiting for closure',
        git: {
          worktreePath: params.worktreePath,
          branch: params.branch,
          closureRequired: true,
          lifecycle: SOURCE_LIFECYCLE,
        },
      },
    },
  })

export const createClosureTaskFixture = (params: {
  id: string
  sourceTaskId: string
}): Task =>
  createTaskFixture({
    id: params.id,
    contract: {
      goal: '收尾源任务 git 闭环',
      scope: '只做 merge/cleanup 收尾',
      acceptance: ['源任务 git 真相已回写'],
      contextRefs: [`task:${params.sourceTaskId}`],
    },
    result: {
      taskId: params.id,
      status: 'succeeded',
      ok: true,
      output: 'closure completed',
      durationMs: 1,
      completedAt: '2026-02-06T00:05:00.000Z',
      handoff: {
        summary: 'closure completed',
        git: {
          worktreePath: '/tmp/irrelevant-closure-worktree',
          branch: 'task/irrelevant-closure-branch',
          closureRequired: false,
          lifecycle: {
            review: {
              passed: true,
              at: '2026-02-06T00:04:00.000Z',
              sha: 'abc123',
            },
            merged: true,
            mergedAt: '2026-02-06T00:04:30.000Z',
            cleaned: true,
            cleanedAt: '2026-02-06T00:05:00.000Z',
          },
        },
      },
    },
  })

export const expectPromotedReviewOnlyTruth = (
  task: Task,
  params: {
    worktreePath: string
    branch: string
    merged: boolean
    cleaned: boolean
    reviewAt?: string
    reviewSha?: string
    mergedAt?: string
    cleanedAt?: string
  },
): void => {
  const reviewAt = params.reviewAt ?? '2026-02-06T00:04:00.000Z'
  const reviewSha = params.reviewSha ?? 'abc123'
  expect(task.git).toMatchObject({
    worktreePath: params.worktreePath,
    branch: params.branch,
    closureRequired: true,
    lifecycle: {
      review: {
        passed: true,
        at: reviewAt,
        sha: reviewSha,
      },
      merged: params.merged,
      cleaned: params.cleaned,
    },
  })
  expect(task.result?.handoff?.git).toMatchObject({
    worktreePath: params.worktreePath,
    branch: params.branch,
    closureRequired: true,
    lifecycle: {
      review: {
        passed: true,
        at: reviewAt,
        sha: reviewSha,
      },
      merged: params.merged,
      cleaned: params.cleaned,
    },
  })
  if (params.mergedAt) {
    expect(task.git?.lifecycle?.mergedAt).toBe(params.mergedAt)
    expect(task.result?.handoff?.git?.lifecycle?.mergedAt).toBe(params.mergedAt)
  } else {
    expect(task.git?.lifecycle).not.toHaveProperty('mergedAt')
    expect(task.result?.handoff?.git?.lifecycle).not.toHaveProperty('mergedAt')
  }
  if (params.cleanedAt) {
    expect(task.git?.lifecycle?.cleanedAt).toBe(params.cleanedAt)
    expect(task.result?.handoff?.git?.lifecycle?.cleanedAt).toBe(
      params.cleanedAt,
    )
  } else {
    expect(task.git?.lifecycle).not.toHaveProperty('cleanedAt')
    expect(task.result?.handoff?.git?.lifecycle).not.toHaveProperty('cleanedAt')
  }
}
