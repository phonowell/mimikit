import read from 'fire-keeper/read'

import { buildPaths } from '../fs/paths.js'
import { readTaskResultsForTasks } from '../storage/task-results.js'

import { escapeCdata } from './format-base.js'
import {
  formatActionFeedback,
  formatEnvironment,
  formatFocusControlYaml,
  formatFocusesYaml,
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
  ConversationFocus,
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
  focuses?: ConversationFocus[]
  focusMemory?: ConversationFocus[]
  focusControl?: {
    turn: number
    maxSlots: number
    updateRequired: boolean
    reason: 'periodic' | 'result_event' | 'bootstrap' | 'idle'
  }
  cronJobs?: CronJob[]
  historyLookup?: HistoryLookupMessage[]
  actionFeedback?: ManagerActionFeedback[]
  env?: ManagerEnv
}): Promise<string> => {
  const pendingResults = mergeTaskResults(params.results, [])
  const knownResults = mergeTaskResults(
    pendingResults,
    collectTaskResults(params.tasks),
  )
  const pendingResultIds = new Set(
    pendingResults.map((result) => result.taskId),
  )
  const resultTaskIds = collectResultTaskIds(params.tasks)
  const dateHints = buildTaskResultDateHints(params.tasks)
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
  const templateValues: Record<string, string> = {
    environment: escapeCdata(
      formatEnvironment({
        workDir: params.workDir,
        ...(params.env ? { env: params.env } : {}),
      }),
    ),
    inputs: escapeCdata(formatInputs(params.inputs)),
    results: escapeCdata(formatResultsYaml(params.tasks, pendingResults)),
    tasks: escapeCdata(
      formatTasksYaml(params.tasks, resultsForTasks, params.cronJobs ?? []),
    ),
    focuses: escapeCdata(formatFocusesYaml(params.focuses ?? [])),
    focus_memory: escapeCdata(formatFocusesYaml(params.focusMemory ?? [])),
    focus_control: params.focusControl
      ? escapeCdata(formatFocusControlYaml(params.focusControl))
      : '',
    history_lookup: escapeCdata(
      formatHistoryLookup(params.historyLookup ?? []),
    ),
    action_feedback: escapeCdata(
      formatActionFeedback(params.actionFeedback ?? []),
    ),
    persona: escapeCdata(persona.trim()),
    user_profile: escapeCdata(userProfile.trim()),
  }
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
  return renderPromptTemplate(systemTemplate, {
    environment: escapeCdata(formatEnvironment({ workDir: params.workDir })),
    prompt: escapeCdata(taskPrompt),
  })
}
