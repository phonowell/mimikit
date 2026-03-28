import { resolve } from 'node:path'

import { resolveTaskResourceMode } from '../../work/shared/task-resource-mode.js'

import type { Task } from '../../foundation/types/index.js'

const pushLine = (
  lines: string[],
  label: string,
  value: string | undefined,
): void => {
  const trimmed = value?.trim()
  if (!trimmed) return
  lines.push(`- ${label}: ${trimmed}`)
}

export const formatWorkerRuntimeContract = (params: {
  task: Task
  workspaceDir: string
}): string => {
  const lines: string[] = []
  const resourceMode = resolveTaskResourceMode(params.task.resourceMode)
  const workingDirectory = resolve(params.workspaceDir)
  const taskCwd = resolve(params.task.cwd)
  const worktreeRoot = params.task.git?.worktreePath
    ? resolve(params.task.git.worktreePath)
    : undefined
  const gitBranch = params.task.git?.branch
  const branch = gitBranch ? gitBranch.trim() : params.task.branch?.trim()

  pushLine(lines, 'resource_mode', resourceMode)
  pushLine(
    lines,
    'write_policy',
    resourceMode === 'read' ? 'forbidden' : 'allowed_within_work_dir',
  )
  pushLine(lines, 'working_directory', workingDirectory)
  if (taskCwd !== workingDirectory) pushLine(lines, 'task_cwd', taskCwd)
  pushLine(lines, 'worktree_root', worktreeRoot)
  pushLine(lines, 'branch', branch)

  return lines.join('\n')
}
