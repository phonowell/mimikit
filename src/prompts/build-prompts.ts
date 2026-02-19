import read from 'fire-keeper/read'

import { buildPaths, ensureFile } from '../fs/paths.js'
import { readTaskResultsForTasks } from '../storage/task-results.js'

import { escapeCdata } from './format-base.js'
import {
  formatActionFeedback,
  formatEnvironment,
  formatHistoryLookup,
  formatInputs,
  formatResultsYaml,
  formatTasksYaml,
  renderPromptTemplate,
} from './format.js'
import { loadPromptFile, loadSystemPrompt } from './prompt-loader.js'
import {
  buildTaskResultDateHints,
  collectResultTaskIds,
  collectTaskResults,
  mergeTaskResults,
} from './task-results-merge.js'

import type {
  CronJob,
  HistoryLookupMessage,
  ManagerActionFeedback,
  ManagerEnv,
  Task,
  TaskResult,
  UserInput,
} from '../types/index.js'

export type { ManagerEnv } from '../types/index.js'

const readOptionalMarkdown = async (path: string): Promise<string> => {
  await ensureFile(path, '')
  try {
    const content = await read(path, { raw: true, echo: false })
    if (!content) return ''
    if (Buffer.isBuffer(content)) return content.toString('utf8')
    return typeof content === 'string' ? content : ''
  } catch (error) {
    const code =
      typeof error === 'object' && error && 'code' in error
        ? String((error as { code?: string }).code)
        : undefined
    if (code === 'ENOENT') return ''
    throw error
  }
}

export const buildManagerPrompt = async (params: {
  stateDir: string
  workDir: string
  inputs: UserInput[]
  results: TaskResult[]
  tasks: Task[]
  cronJobs?: CronJob[]
  historyLookup?: HistoryLookupMessage[]
  actionFeedback?: ManagerActionFeedback[]
  env?: ManagerEnv
}): Promise<string> => {
  const pendingResults = mergeTaskResults(params.results, [])
  const persistedResults = collectTaskResults(params.tasks)
  const knownResults = mergeTaskResults(pendingResults, persistedResults)
  const pendingResultIds = new Set(
    pendingResults.map((result) => result.taskId),
  )
  const tasksForPrompt = params.tasks
  const resultTaskIds = collectResultTaskIds(tasksForPrompt)
  const dateHints = buildTaskResultDateHints(tasksForPrompt)
  const statePaths = buildPaths(params.stateDir)
  const [persona, userProfile] = await Promise.all([
    readOptionalMarkdown(statePaths.agentPersona),
    readOptionalMarkdown(statePaths.userProfile),
  ])
  const archivedResults =
    resultTaskIds.length > 0
      ? await readTaskResultsForTasks(params.stateDir, resultTaskIds, {
          dateHints,
        })
      : []
  const mergedResults = mergeTaskResults(knownResults, archivedResults)
  const resultsForTasks = mergedResults.filter(
    (result) => !pendingResultIds.has(result.taskId),
  )
  const systemTemplate = await loadSystemPrompt('manager')
  const templateValues = Object.fromEntries<string>([
    [
      'environment',
      escapeCdata(
        formatEnvironment({
          workDir: params.workDir,
          ...(params.env ? { env: params.env } : {}),
        }),
      ),
    ],
    ['inputs', escapeCdata(formatInputs(params.inputs))],
    ['results', escapeCdata(formatResultsYaml(params.tasks, pendingResults))],
    [
      'tasks',
      escapeCdata(
        formatTasksYaml(tasksForPrompt, resultsForTasks, params.cronJobs ?? []),
      ),
    ],
    [
      'history_lookup',
      escapeCdata(formatHistoryLookup(params.historyLookup ?? [])),
    ],
    [
      'action_feedback',
      escapeCdata(formatActionFeedback(params.actionFeedback ?? [])),
    ],
    ['persona', escapeCdata(persona.trim())],
    ['user_profile', escapeCdata(userProfile.trim())],
  ])
  return renderPromptTemplate(systemTemplate, templateValues)
}

export const buildWorkerPrompt = async (params: {
  workDir: string
  task: Task
}): Promise<string> => {
  const systemTemplate = await loadSystemPrompt('worker')
  let taskPrompt = params.task.prompt
  if (params.task.cron) {
    const prefix = await loadPromptFile('worker', 'cron-trigger-context')
    if (prefix) taskPrompt = `${prefix.trim()}\n\n${taskPrompt}`
  }
  const templateValues = Object.fromEntries<string>([
    [
      'environment',
      escapeCdata(formatEnvironment({ workDir: params.workDir })),
    ],
    ['prompt', escapeCdata(taskPrompt)],
  ])
  return renderPromptTemplate(systemTemplate, templateValues)
}
