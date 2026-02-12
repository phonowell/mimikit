import read from 'fire-keeper/read'

import { buildPaths, ensureFile } from '../fs/paths.js'
import { readTaskResultsForTasks } from '../storage/task-results.js'

import {
  buildCdataBlock,
  buildRawBlock,
  formatEnvironment,
  formatHistory,
  formatInputs,
  formatMarkdownReference,
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

import type {
  HistoryMessage,
  ManagerEnv,
  Task,
  TaskResult,
  UserInput,
} from '../types/index.js'

export type { ManagerEnv } from '../types/index.js'

const readOptionalMarkdown = async (path: string): Promise<string> => {
  await ensureFile(path, '')
  try {
    const content = await read(path, { raw: true })
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
  const system = await loadSystemPrompt('manager')
  const injectionTemplate = await loadInjectionPrompt('manager')
  const injectionValues = Object.fromEntries<string>([
    [
      'environment',
      buildRawBlock(
        'environment',
        formatEnvironment({
          workDir: params.workDir,
          ...(params.env ? { env: params.env } : {}),
        }),
        true,
      ),
    ],
    ['inputs', buildCdataBlock('inputs', formatInputs(params.inputs), true)],
    [
      'results',
      buildCdataBlock(
        'results',
        formatResultsYaml(params.tasks, pendingResults),
        true,
      ),
    ],
    [
      'tasks',
      buildCdataBlock(
        'tasks',
        formatTasksYaml(tasksForPrompt, resultsForTasks),
        true,
      ),
    ],
    [
      'history',
      buildCdataBlock('history', formatHistory(params.history), true),
    ],
    [
      'persona',
      buildRawBlock('persona', formatMarkdownReference(persona), true),
    ],
    [
      'user_profile',
      buildRawBlock('user_profile', formatMarkdownReference(userProfile), true),
    ],
  ])
  const injection = renderPromptTemplate(injectionTemplate, injectionValues)
  return joinPromptSections([system, injection])
}

export const buildWorkerPrompt = async (params: {
  workDir: string
  task: Task
}): Promise<string> => {
  const system = await loadSystemPrompt('worker')
  const injectionTemplate = await loadInjectionPrompt('worker')
  const injectionValues = Object.fromEntries<string>([
    [
      'environment',
      buildRawBlock(
        'environment',
        formatEnvironment({ workDir: params.workDir }),
        true,
      ),
    ],
    ['prompt', buildRawBlock('prompt', params.task.prompt, true)],
  ])
  const injection = renderPromptTemplate(injectionTemplate, injectionValues)
  return joinPromptSections([system, injection])
}
