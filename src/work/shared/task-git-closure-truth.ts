import {
  mergeTaskGitLifecycle,
  preserveVerifiedTaskGitLifecycleTimestamps,
} from './task-git-lifecycle-merge.js'
import {
  deriveTaskGitLifecycle,
  resolveTaskGitLifecycle,
  resolveTaskGitLifecycleRuntimeTruth,
} from './task-git-lifecycle.js'

import type { Task, TaskGitExecution } from '../../foundation/types/index.js'

type TaskGitReview = NonNullable<TaskGitExecution['lifecycle']>['review']

const TASK_CONTEXT_REF_PREFIX = 'task:'

const resolveClosureSourceTaskIds = (
  task: Pick<Task, 'id' | 'contract'>,
): string[] => {
  const sourceTaskIds = new Set<string>()
  for (const ref of task.contract?.contextRefs ?? []) {
    const normalized = ref.trim()
    if (!normalized.startsWith(TASK_CONTEXT_REF_PREFIX)) continue
    const taskId = normalized.slice(TASK_CONTEXT_REF_PREFIX.length).trim()
    if (!taskId || taskId === task.id) continue
    sourceTaskIds.add(taskId)
  }
  return [...sourceTaskIds]
}

const sameJson = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

const mergeLifecycleReview = (
  current: TaskGitExecution['lifecycle'] | undefined,
  review: TaskGitReview | undefined,
): TaskGitExecution['lifecycle'] | undefined =>
  mergeTaskGitLifecycle({
    current,
    patch: review ? { review } : undefined,
  })

const resolveSourceTaskClosureTruth = (
  task: Pick<Task, 'git' | 'repoKey' | 'result'>,
): TaskGitExecution['lifecycle'] | undefined => {
  const sourceGitIdentity = task.git ?? task.result?.handoff?.git
  let lifecycle = task.git
    ? resolveTaskGitLifecycle(task)
    : sourceGitIdentity
      ? deriveTaskGitLifecycle({
          git: sourceGitIdentity,
          repoKey: task.repoKey,
        })
      : undefined
  lifecycle = mergeLifecycleReview(
    lifecycle,
    task.result?.handoff?.git?.lifecycle?.review,
  )
  return preserveVerifiedTaskGitLifecycleTimestamps(
    task,
    resolveTaskGitLifecycleRuntimeTruth({
      git: sourceGitIdentity,
      repoKey: task.repoKey,
      lifecycle,
    }),
  )
}

export const hasTaskClosedGitLifecycle = (
  task: Pick<Task, 'git' | 'repoKey' | 'result'>,
): boolean => {
  const lifecycle = resolveSourceTaskClosureTruth(task)
  return lifecycle?.merged === true && lifecycle.cleaned === true
}

export const applyClosureTaskGitTruth = (
  tasks: Task[],
  closureTask: Pick<Task, 'id' | 'contract' | 'result'>,
): string[] => {
  const closureGit = closureTask.result?.handoff?.git
  const closureReview = closureGit?.lifecycle?.review
  if (!closureReview) return []
  const sourceTaskIds = resolveClosureSourceTaskIds(closureTask)
  if (sourceTaskIds.length === 0) return []

  const updatedTaskIds: string[] = []
  for (const sourceTaskId of sourceTaskIds) {
    const sourceTask = tasks.find((task) => task.id === sourceTaskId)
    if (!sourceTask) continue
    const sourceGitIdentity = sourceTask.git ?? sourceTask.result?.handoff?.git
    if (!sourceGitIdentity) continue

    const nextLifecycle = preserveVerifiedTaskGitLifecycleTimestamps(
      sourceTask,
      resolveTaskGitLifecycleRuntimeTruth({
        git: sourceGitIdentity,
        repoKey: sourceTask.repoKey,
        lifecycle: mergeLifecycleReview(
          resolveSourceTaskClosureTruth(sourceTask),
          closureReview,
        ),
      }),
    )
    if (!nextLifecycle) continue

    const nextGit: TaskGitExecution = {
      ...sourceGitIdentity,
      lifecycle: nextLifecycle,
    }
    const nextResultGit = sourceTask.result
      ? {
          ...(sourceTask.result.handoff?.git ?? nextGit),
          lifecycle: nextLifecycle,
        }
      : undefined
    if (
      sameJson(sourceTask.git ?? null, nextGit) &&
      sameJson(sourceTask.result?.handoff?.git ?? null, nextResultGit ?? null)
    )
      continue

    sourceTask.git = nextGit
    if (sourceTask.result) {
      sourceTask.result = {
        ...sourceTask.result,
        handoff: {
          ...(sourceTask.result.handoff ?? {}),
          ...(nextResultGit ? { git: nextResultGit } : {}),
        },
      }
    }
    updatedTaskIds.push(sourceTaskId)
  }
  return updatedTaskIds
}
