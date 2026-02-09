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
import {
  loadInjectionPrompt,
  loadPromptFile,
  loadSystemPrompt,
} from './prompt-loader.js'
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
  Task,
  TaskResult,
  ThinkerEnv,
  UserInput,
} from '../types/index.js'

export type { ThinkerEnv } from '../types/index.js'

export const buildThinkerPrompt = async (params: {
  stateDir: string
  workDir: string
  inputs: UserInput[]
  results: TaskResult[]
  tasks: Task[]
  history: HistoryMessage[]
  env?: ThinkerEnv
}): Promise<string> => {
  const pendingResults = dedupeTaskResults(params.results)
  const persistedResults = collectTaskResults(params.tasks)
  const knownResults = mergeTaskResults(pendingResults, persistedResults)
  const pendingResultIds = new Set(
    pendingResults.map((result) => result.taskId),
  )
  const tasksForPrompt = params.tasks
  const promptTasks = tasksForPrompt
  const resultTaskIds = collectResultTaskIds(promptTasks)
  const dateHints = buildTaskResultDateHints(promptTasks)
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
  const { inputs } = params
  const system = await loadSystemPrompt(params.workDir, 'thinker')
  const injectionTemplate = await loadInjectionPrompt(params.workDir, 'thinker')
  const injectionValues = Object.fromEntries<string>([
    [
      'environment',
      buildCdataBlock(
        'environment',
        formatEnvironment(params.workDir, params.env),
      ),
    ],
    [
      'teller_summary',
      buildCdataBlock(
        'teller_summary',
        params.env?.tellerDigestSummary?.trim() ?? '',
      ),
    ],
    ['inputs', buildCdataBlock('inputs', formatInputs(inputs))],
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
    params.task.profile === 'standard' ? 'worker-standard' : 'worker-expert'
  const system = await loadSystemPrompt(params.workDir, role)
  const injectionTemplate = await loadInjectionPrompt(params.workDir, role)
  const injectionValues = Object.fromEntries<string>([
    ['prompt', params.task.prompt],
  ])
  const injection = renderPromptTemplate(injectionTemplate, injectionValues)
  return joinPromptSections([system, injection])
}

export const buildTellerPrompt = async (params: {
  workDir: string
  inputs: UserInput[]
  tasks: Task[]
  history: HistoryMessage[]
  thinkerDecision: string
}): Promise<string> => {
  const system = await loadSystemPrompt(params.workDir, 'teller')
  const injectionTemplate = await loadInjectionPrompt(params.workDir, 'teller')
  const injectionValues = Object.fromEntries<string>([
    [
      'environment',
      buildCdataBlock('environment', formatEnvironment(params.workDir)),
    ],
    ['inputs', buildCdataBlock('inputs', formatInputs(params.inputs))],
    ['tasks', buildCdataBlock('tasks', formatTasksYaml(params.tasks, []))],
    ['history', buildCdataBlock('history', formatHistory(params.history))],
    ['thinker_decision', params.thinkerDecision],
  ])
  const injection = renderPromptTemplate(injectionTemplate, injectionValues)
  return joinPromptSections([system, injection])
}

export const buildTellerDigestPrompt = async (params: {
  workDir: string
  inputs: UserInput[]
  tasks: Task[]
  results: TaskResult[]
  history: HistoryMessage[]
}): Promise<string> => {
  const system = await loadPromptFile(params.workDir, 'teller', 'digest-system')
  const injectionTemplate = await loadPromptFile(
    params.workDir,
    'teller',
    'digest-injection',
  )
  const injectionValues = Object.fromEntries<string>([
    ['inputs', buildCdataBlock('inputs', formatInputs(params.inputs))],
    [
      'tasks',
      buildCdataBlock('tasks', formatTasksYaml(params.tasks, params.results)),
    ],
    ['history', buildCdataBlock('history', formatHistory(params.history))],
  ])
  const injection = renderPromptTemplate(injectionTemplate, injectionValues)
  return joinPromptSections([system, injection])
}
