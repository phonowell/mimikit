import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

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
  selectTasksForPrompt,
} from './prompt-format.js'

import type {
  HistoryMessage,
  Task,
  TaskResult,
  UserInput,
} from '../types/index.js'

export type ManagerEnv = {
  lastUser?: {
    source?: string
    remote?: string
    userAgent?: string
    language?: string
    clientLocale?: string
    clientTimeZone?: string
    clientOffsetMinutes?: number
    clientNowIso?: string
  }
}

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

const dedupeInputs = (
  inputs: UserInput[],
  history: HistoryMessage[],
): UserInput[] => {
  const historyIds = new Set(history.map((item) => item.id))
  const unique = new Map<string, UserInput>()
  for (const input of inputs) {
    if (historyIds.has(input.id)) continue
    unique.set(input.id, input)
  }
  return Array.from(unique.values())
}

const dedupeResults = (results: TaskResult[]): TaskResult[] => {
  const unique = new Map<string, TaskResult>()
  for (const result of results) {
    const existing = unique.get(result.taskId)
    if (!existing) {
      unique.set(result.taskId, result)
      continue
    }
    const existingTs = Date.parse(existing.completedAt)
    const nextTs = Date.parse(result.completedAt)
    if (Number.isFinite(nextTs) && nextTs >= existingTs)
      unique.set(result.taskId, result)
  }
  return Array.from(unique.values())
}

const loadPromptFile = async (
  workDir: string,
  role: string,
  name: string,
): Promise<string> => {
  const path = join(workDir, 'prompts', 'agents', role, `${name}.md`)
  try {
    return await readFile(path, 'utf8')
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

export const buildManagerPrompt = async (params: {
  stateDir: string
  workDir: string
  inputs: UserInput[]
  results: TaskResult[]
  tasks: Task[]
  history: HistoryMessage[]
  env?: ManagerEnv
}): Promise<string> => {
  const pendingResults = dedupeResults(params.results)
  const pendingResultIds = new Set(
    pendingResults.map((result) => result.taskId),
  )
  const tasksForPrompt = params.tasks
  const promptTasks = selectTasksForPrompt(tasksForPrompt, 50)
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
  const mergedResults = mergeTaskResults(pendingResults, archivedResults)
  const resultsForTasks = mergedResults.filter(
    (result) => !pendingResultIds.has(result.taskId),
  )
  const inputs = dedupeInputs(params.inputs, params.history)
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
  const system = await loadSystemPrompt(params.workDir, 'worker')
  const injectionTemplate = await loadInjectionPrompt(params.workDir, 'worker')
  const injectionValues = Object.fromEntries<string>([
    ['任务描述', params.task.prompt],
  ])
  const injection = renderPromptTemplate(injectionTemplate, injectionValues)
  return joinPromptSections([system, injection])
}
