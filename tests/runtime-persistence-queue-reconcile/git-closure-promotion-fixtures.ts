import { join } from 'node:path'

import {
  appendTaskResultArchive,
  type TaskResultArchiveRecord,
} from '../../src/persistence/storage/task-results.js'
import { materializeTaskFixture } from '../helpers/execution-spec.js'
import { createMergedClosureRepo } from '../helpers/git-closure-truth.js'
import { createTaskFixture } from '../helpers/runtime-snapshot.js'

import type {
  Task,
  TaskGitLifecycle,
} from '../../src/foundation/types/index.js'

export const buildExpectedClosurePromotionLifecycle = (
  reviewSha: string,
): TaskGitLifecycle => ({
  review: {
    passed: true,
    at: '2026-04-01T03:21:30.000Z',
    sha: reviewSha,
  },
  merged: true,
  cleaned: true,
})

const sourceLifecycle = {
  review: { passed: false },
  merged: false,
  cleaned: false,
} satisfies TaskGitLifecycle

const buildSourceArchiveRecord = (
  sourceWorktreePath: string,
  sourceArchivePath: string | undefined,
): Omit<TaskResultArchiveRecord, 'archivePath'> => ({
  taskId: 'task-source-closure-truth',
  focusId: 'focus-global',
  title: 'Source Closure Truth',
  status: 'succeeded',
  taskStatus: 'paused',
  prompt: 'source task waiting for closure',
  output: 'waiting for closure',
  createdAt: '2026-02-06T00:00:00.000Z',
  completedAt: '2026-02-06T00:02:00.000Z',
  durationMs: 1,
  handoff: {
    summary: 'waiting for closure',
    git: {
      worktreePath: sourceWorktreePath,
      branch: 'task/source-closure-truth',
      closureRequired: true,
      lifecycle: sourceLifecycle,
    },
  },
  ...(sourceArchivePath ? { archivePath: sourceArchivePath } : {}),
})

export const buildClosurePromotionFixtures = async (
  stateDir: string,
): Promise<{
  sourceArchivePath: string
  sourceTask: Task
  closureTask: Task
  expectedClosurePromotionLifecycle: TaskGitLifecycle
}> => {
  const {
    repoRoot,
    worktreePath: sourceWorktreePath,
    branch,
    reviewSha,
  } = await createMergedClosureRepo()
  const expectedClosurePromotionLifecycle =
    buildExpectedClosurePromotionLifecycle(reviewSha)
  const sourceArchivePath = await appendTaskResultArchive(
    stateDir,
    buildSourceArchiveRecord(sourceWorktreePath, undefined),
  )
  const sourceTask = await materializeTaskFixture({
    stateDir,
    task: {
      ...createTaskFixture({
        id: 'task-source-closure-truth',
        status: 'paused',
        completedAt: '2026-02-06T00:02:00.000Z',
        repoKey: join(repoRoot, '.git'),
        branch,
        git: {
          worktreePath: sourceWorktreePath,
          branch,
          closureRequired: true,
          lifecycle: sourceLifecycle,
        },
        result: {
          taskId: 'task-source-closure-truth',
          status: 'succeeded',
          ok: true,
          output: 'waiting for closure',
          durationMs: 1,
          completedAt: '2026-02-06T00:02:00.000Z',
          taskStatus: 'paused',
          outcome: 'blocked',
          stopReason: 'closure_pending',
          archivePath: sourceArchivePath,
          handoff: buildSourceArchiveRecord(
            sourceWorktreePath,
            sourceArchivePath,
          ).handoff,
        },
      }),
      prompt: 'source task waiting for closure',
    },
  })
  const closureReportedLifecycle: TaskGitLifecycle = {
    review: expectedClosurePromotionLifecycle.review,
    merged: true,
    mergedAt: '2026-04-01T03:21:45.000Z',
    cleaned: true,
    cleanedAt: '2026-04-01T03:22:00.000Z',
  }
  const closureTask = await materializeTaskFixture({
    stateDir,
    task: {
      ...createTaskFixture({
        id: 'task-closure-source-closure-truth',
        title: '收尾：Source Closure Truth',
        cwd: '/tmp/source-closure-repo',
        status: 'succeeded',
        completedAt: '2026-02-06T00:05:00.000Z',
        contract: {
          goal: '收尾源任务 git 闭环',
          scope: '只做 merge/cleanup 收尾',
          acceptance: ['源任务 git 真相已回写'],
          contextRefs: ['task:task-source-closure-truth', sourceArchivePath],
        },
        result: {
          taskId: 'task-closure-source-closure-truth',
          status: 'succeeded',
          ok: true,
          output: 'closure completed',
          durationMs: 1,
          completedAt: '2026-02-06T00:05:00.000Z',
          handoff: {
            summary: 'closure completed',
            git: {
              worktreePath: sourceWorktreePath,
              branch,
              closureRequired: true,
              lifecycle: closureReportedLifecycle,
            },
          },
        },
      }),
      prompt: 'complete closure and cleanup',
    },
  })
  closureTask.contract = {
    goal: '收尾源任务 git 闭环',
    scope: '只做 merge/cleanup 收尾',
    acceptance: ['源任务 git 真相已回写'],
    contextRefs: ['task:task-source-closure-truth', sourceArchivePath],
  }
  return {
    sourceArchivePath,
    sourceTask,
    closureTask,
    expectedClosurePromotionLifecycle,
  }
}
