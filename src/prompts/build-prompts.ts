import { readTaskResultsForTasks } from '../storage/task-results.js'

import {
  buildCdataBlock,
  formatEnvironment,
  formatHistory,
  formatInputs,
  formatResultsYaml,
  formatTasksYaml,
  joinPromptSections,
  renderPromptTemplate,
} from './format.js'
import { loadInjectionPrompt, loadSystemPrompt } from './prompt-loader.js'
import {
  buildTaskResultDateHints,
  collectResultTaskIds,
  collectTaskResults,
  dedupeTaskResults,
  mergeTaskResults,
} from './task-results-merge.js'
export { buildWorkerStandardPlannerPrompt } from './build-prompts-extra.js'

import type {
  HistoryMessage,
  ManagerEnv,
  Task,
  TaskResult,
  UserInput,
} from '../types/index.js'

export type { ManagerEnv } from '../types/index.js'

export const buildManagerPrompt = async (params: {
  stateDir: string
  workDir: string
  inputs: UserInput[]
  results: TaskResult[]
  tasks: Task[]
  history: HistoryMessage[]
  env?: ManagerEnv
}): Promise<string> => {
  const pendingResults = dedupeTaskResults(params.results)
  const persistedResults = collectTaskResults(params.tasks)
  const knownResults = mergeTaskResults(pendingResults, persistedResults)
  const pendingResultIds = new Set(
    pendingResults.map((result) => result.taskId),
  )
  const tasksForPrompt = params.tasks
  const resultTaskIds = collectResultTaskIds(tasksForPrompt)
  const dateHints = buildTaskResultDateHints(tasksForPrompt)
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
  const system = await loadSystemPrompt(params.workDir, 'manager')
  const injectionTemplate = await loadInjectionPrompt(params.workDir, 'manager')
  const injectionValues = Object.fromEntries<string>([
    [
      'environment',
      buildCdataBlock(
        'environment',
        formatEnvironment(params.workDir, params.env),
      ),
    ],
    ['inputs', buildCdataBlock('inputs', formatInputs(params.inputs))],
    [
      'results',
      buildCdataBlock(
        'results',
        formatResultsYaml(params.tasks, pendingResults),
      ),
    ],
    [
      'tasks',
      buildCdataBlock(
        'tasks',
        formatTasksYaml(tasksForPrompt, resultsForTasks),
      ),
    ],
    ['history', buildCdataBlock('history', formatHistory(params.history))],
  ])
  const injection = renderPromptTemplate(injectionTemplate, injectionValues)
  return joinPromptSections([system, injection])
}

export const buildWorkerPrompt = async (params: {
  workDir: string
  task: Task
}): Promise<string> => {
  const role =
    params.task.profile === 'standard' ? 'worker-standard' : 'worker-specialist'
  const system = await loadSystemPrompt(params.workDir, role)
  const injectionTemplate = await loadInjectionPrompt(params.workDir, role)
  const injectionValues = Object.fromEntries<string>([
    ['prompt', params.task.prompt],
  ])
  const injection = renderPromptTemplate(injectionTemplate, injectionValues)
  return joinPromptSections([system, injection])
}
