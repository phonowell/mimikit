import { join } from 'node:path'

import read from 'fire-keeper/read'

import { logSafeError } from '../log/safe.js'
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

import type { ThinkerEnv } from '../thinker/env-types.js'
import type {
  HistoryMessage,
  Task,
  TaskResult,
  UserInput,
} from '../types/index.js'

export type { ThinkerEnv } from '../thinker/env-types.js'

const mergeTaskResults = (
  primary: TaskResult[],
  secondary: TaskResult[],
): TaskResult[] => {
  const merged = new Map<string, TaskResult>()
  for (const result of secondary) merged.set(result.taskId, result)
  for (const result of primary) merged.set(result.taskId, result)
  const values = Array.from(merged.values())
  values.sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt))
  return values
}

const dedupeTaskResults = (results: TaskResult[]): TaskResult[] =>
  mergeTaskResults(results, [])

const collectTaskResults = (tasks: Task[]): TaskResult[] =>
  tasks
    .filter((task): task is Task & { result: TaskResult } =>
      Boolean(task.result),
    )
    .map((task) => task.result)

const loadPromptFile = async (
  workDir: string,
  role: string,
  name: string,
): Promise<string> => {
  const path = join(workDir, 'prompts', 'agents', role, `${name}.md`)
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
    await logSafeError('loadPromptFile', error, { meta: { path } })
    throw error
  }
}

const loadSystemPrompt = (workDir: string, role: string): Promise<string> =>
  loadPromptFile(workDir, role, 'system')

const loadInjectionPrompt = (workDir: string, role: string): Promise<string> =>
  loadPromptFile(workDir, role, 'injection')

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
  const resultTaskIds = promptTasks
    .filter((task) => task.status !== 'pending' && task.status !== 'running')
    .map((task) => task.id)
  const dateHints = Object.fromEntries(
    promptTasks
      .filter(
        (task): task is Task & { completedAt: string } =>
          typeof task.completedAt === 'string' && task.completedAt.length > 0,
      )
      .map((task) => [task.id, task.completedAt.slice(0, 10)]),
  )
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

export const buildWorkerStandardPlannerPrompt = async (params: {
  workDir: string
  taskPrompt: string
  transcript: string[]
  tools: string[]
  checkpointRecovered: boolean
}): Promise<string> => {
  const system = await loadPromptFile(
    params.workDir,
    'worker-standard',
    'planner-system',
  )
  const injectionTemplate = await loadPromptFile(
    params.workDir,
    'worker-standard',
    'planner-injection',
  )
  const transcript =
    params.transcript.length > 0 ? params.transcript.join('\n\n') : '(empty)'
  const injectionValues = Object.fromEntries<string>([
    ['checkpoint_recovered', params.checkpointRecovered ? 'true' : 'false'],
    ['task_prompt', params.taskPrompt],
    ['available_tools', params.tools.join(', ')],
    ['transcript', transcript],
  ])
  const injection = renderPromptTemplate(injectionTemplate, injectionValues)
  return joinPromptSections([system, injection])
}

export const buildIdleReviewPrompt = async (params: {
  workDir: string
  historyTexts: string[]
}): Promise<string> => {
  const system = await loadPromptFile(
    params.workDir,
    'thinker',
    'idle-review-system',
  )
  const injectionTemplate = await loadPromptFile(
    params.workDir,
    'thinker',
    'idle-review-injection',
  )
  const historySnippets =
    params.historyTexts.length > 0
      ? params.historyTexts
          .map((line, index) => `${index + 1}. ${line}`)
          .join('\n')
      : '(empty)'
  const injection = renderPromptTemplate(injectionTemplate, {
    history_snippets: historySnippets,
  })
  return joinPromptSections([system, injection])
}

export const buildCodeEvolveTaskPrompt = async (params: {
  workDir: string
  feedbackMessages: string[]
}): Promise<string> => {
  const template = await loadPromptFile(
    params.workDir,
    'worker-expert',
    'code-evolve-task',
  )
  const feedbackList =
    params.feedbackMessages.length > 0
      ? params.feedbackMessages
          .slice(0, 20)
          .map((item, index) => `${index + 1}. ${item}`)
          .join('\n')
      : '(empty)'
  return renderPromptTemplate(template, { feedback_list: feedbackList })
}

export const buildPromptOptimizerPrompt = async (params: {
  workDir: string
  source: string
}): Promise<string> => {
  const template = await loadPromptFile(
    params.workDir,
    'thinker',
    'prompt-optimizer',
  )
  return renderPromptTemplate(template, {
    source_prompt: params.source,
  })
}
