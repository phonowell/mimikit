/**
 * @file Shared task state helpers.
 * @description Provides reusable task timestamp resolution logic across modules.
 *
 * Key exports:
 * - resolveTaskChangeAt() - Resolves latest effective task state-change timestamp
 */

import type { Task } from '../types/index.js'

/** Resolves the latest state-change timestamp for a task. */
export const resolveTaskChangeAt = (task: Task): string =>
  task.completedAt ?? task.pausedAt ?? task.startedAt ?? task.createdAt
