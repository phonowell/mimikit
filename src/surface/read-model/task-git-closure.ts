import { resolveTaskGitLifecycle } from '../../work/shared/task-git-lifecycle.js'

import type { Task } from '../../foundation/types/index.js'

export type TaskGitClosureView = NonNullable<Task['git']>['lifecycle']

export const deriveTaskGitClosure = (
  task: Task,
): TaskGitClosureView | undefined => resolveTaskGitLifecycle(task)
