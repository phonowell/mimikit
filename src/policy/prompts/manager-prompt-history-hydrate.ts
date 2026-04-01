import { join } from 'node:path'

import { buildTaskResultDateHints } from '../../foundation/prompting/build-prompts-helpers.js'
import { TASK_ID_PATTERN } from '../../foundation/shared/id-schema.js'
import {
  checkExistingPathBoundary,
  resolveFromRoot,
} from '../../persistence/fs/path-safety.js'
import {
  readTaskResultArchive,
  readTaskResultsForTasks,
} from '../../persistence/storage/task-results.js'

import type {
  Task,
  TaskResult,
  UserInput,
} from '../../foundation/types/index.js'

const TASK_ID_REFERENCE_RE = /\btask-[a-zA-Z0-9._-]+\b/g
const TASK_ARCHIVE_REFERENCE_RE = /((?:[A-Za-z]:)?[^\s"'`]+?\.md)/g

const latestUserInput = (inputs: UserInput[]): UserInput | undefined =>
  [...inputs].reverse().find((item) => item.role === 'user')

const extractTaskIds = (text: string): string[] => {
  const ids = new Set<string>()
  for (const candidate of text.match(TASK_ID_REFERENCE_RE) ?? []) {
    const taskId = candidate.trim()
    if (TASK_ID_PATTERN.test(taskId)) ids.add(taskId)
  }
  return Array.from(ids)
}

const extractArchivePaths = (workDir: string, text: string): string[] => {
  const paths = new Set<string>()
  for (const candidate of text.match(TASK_ARCHIVE_REFERENCE_RE) ?? []) {
    const resolved = resolveFromRoot(workDir, candidate.trim())
    paths.add(resolved)
  }
  return Array.from(paths)
}

const isArchiveInsideStateTasks = async (
  stateDir: string,
  archivePath: string,
): Promise<boolean> =>
  (await checkExistingPathBoundary({
    rootPath: join(stateDir, 'tasks'),
    targetPath: archivePath,
  })) === 'inside'

const readSucceededArchive = async (
  stateDir: string,
  archivePath: string,
): Promise<TaskResult | undefined> => {
  if (!(await isArchiveInsideStateTasks(stateDir, archivePath)))
    return undefined
  const result = await readTaskResultArchive(archivePath)
  if (result?.status !== 'succeeded') return undefined
  return result
}

const resolveTaskArchivePath = (
  workDir: string,
  task: Task,
): string | undefined => {
  const rawPath = task.archivePath?.trim() ?? task.result?.archivePath?.trim()
  if (!rawPath) return undefined
  return resolveFromRoot(workDir, rawPath)
}

export const hydratePromptHistoryResults = async (params: {
  stateDir: string
  workDir: string
  inputs: UserInput[]
  results: TaskResult[]
  tasks: Task[]
}): Promise<{ results: TaskResult[]; hydratedTaskIds: string[] }> => {
  const latestInput = latestUserInput(params.inputs)
  const text = latestInput?.text.trim()
  if (!text) return { results: [], hydratedTaskIds: [] }

  const existingTaskIds = new Set(
    params.results.map((result) => result.taskId.trim()).filter(Boolean),
  )
  const byTaskId = new Map<string, TaskResult>()
  const referencedTaskIds = extractTaskIds(text)
  const referencedArchivePaths = extractArchivePaths(params.workDir, text)

  for (const archivePath of referencedArchivePaths) {
    const result = await readSucceededArchive(params.stateDir, archivePath)
    if (!result || existingTaskIds.has(result.taskId)) continue
    byTaskId.set(result.taskId, result)
  }

  if (referencedTaskIds.length === 0) {
    return {
      results: Array.from(byTaskId.values()),
      hydratedTaskIds: Array.from(byTaskId.keys()),
    }
  }

  const taskById = new Map(params.tasks.map((task) => [task.id, task]))
  const dateHints = buildTaskResultDateHints(params.tasks)

  for (const taskId of referencedTaskIds) {
    if (existingTaskIds.has(taskId) || byTaskId.has(taskId)) continue

    const task = taskById.get(taskId)
    const archivePath = task
      ? resolveTaskArchivePath(params.workDir, task)
      : undefined
    const direct = archivePath
      ? await readSucceededArchive(params.stateDir, archivePath)
      : undefined
    if (direct) {
      byTaskId.set(taskId, direct)
      continue
    }

    const [fallback] = await readTaskResultsForTasks(
      params.stateDir,
      [taskId],
      {
        maxFiles: 1,
        ...(dateHints[taskId]
          ? { dateHints: { [taskId]: dateHints[taskId] } }
          : {}),
      },
    )
    if (fallback?.status === 'succeeded') byTaskId.set(taskId, fallback)
  }

  return {
    results: Array.from(byTaskId.values()),
    hydratedTaskIds: Array.from(byTaskId.keys()),
  }
}
