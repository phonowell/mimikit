import type {
  Task,
  TaskGitLifecycle,
  TaskGitReview,
} from '../../foundation/types/index.js'

export type TaskGitLifecyclePatch = {
  review?: Partial<TaskGitReview> | undefined
  merged?: boolean | undefined
  mergedAt?: string | undefined
  cleaned?: boolean | undefined
  cleanedAt?: string | undefined
}

export const mergeTaskGitLifecycle = (params: {
  current?: TaskGitLifecycle | undefined
  patch?: TaskGitLifecyclePatch | undefined
}): TaskGitLifecycle | undefined => {
  const { current, patch } = params
  if (!current && !patch) return undefined
  return {
    review: {
      passed: Boolean(
        (current?.review.passed ?? false) || (patch?.review?.passed ?? false),
      ),
      ...(patch?.review?.at
        ? { at: patch.review.at }
        : current?.review.at
          ? { at: current.review.at }
          : {}),
      ...(patch?.review?.sha
        ? { sha: patch.review.sha }
        : current?.review.sha
          ? { sha: current.review.sha }
          : {}),
    },
    merged: Boolean((current?.merged ?? false) || (patch?.merged ?? false)),
    ...(patch?.mergedAt
      ? { mergedAt: patch.mergedAt }
      : current?.mergedAt
        ? { mergedAt: current.mergedAt }
        : {}),
    cleaned: Boolean((current?.cleaned ?? false) || (patch?.cleaned ?? false)),
    ...(patch?.cleanedAt
      ? { cleanedAt: patch.cleanedAt }
      : current?.cleanedAt
        ? { cleanedAt: current.cleanedAt }
        : {}),
  }
}

export const preserveVerifiedTaskGitLifecycleTimestamps = (
  task: Pick<Task, 'git' | 'result'>,
  lifecycle: TaskGitLifecycle | undefined,
): TaskGitLifecycle | undefined => {
  if (!lifecycle) return lifecycle
  const mergedAt = lifecycle.merged
    ? (task.git?.lifecycle?.mergedAt ??
      task.result?.handoff?.git?.lifecycle?.mergedAt)
    : undefined
  const cleanedAt = lifecycle.cleaned
    ? (task.git?.lifecycle?.cleanedAt ??
      task.result?.handoff?.git?.lifecycle?.cleanedAt)
    : undefined
  return mergeTaskGitLifecycle({
    current: lifecycle,
    patch: {
      ...(mergedAt ? { mergedAt } : {}),
      ...(cleanedAt ? { cleanedAt } : {}),
    },
  })
}
