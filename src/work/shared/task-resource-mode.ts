import type { TaskResourceMode } from '../types/task-runtime-types.js'

export const DEFAULT_TASK_RESOURCE_MODE: TaskResourceMode = 'write'

export const resolveTaskResourceMode = (
  value?: TaskResourceMode,
): TaskResourceMode => (value === 'read' ? 'read' : DEFAULT_TASK_RESOURCE_MODE)

export const isWriteTaskResourceMode = (value?: TaskResourceMode): boolean =>
  resolveTaskResourceMode(value) === 'write'
