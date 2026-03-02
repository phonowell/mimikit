import { buildFocusPromptPayload } from '../focus/index.js'
import { buildPaths } from '../fs/paths.js'
import { readTextFileIfExists } from '../fs/read-text.js'
import { readHistory } from '../history/store.js'
import { readErrorCode } from '../shared/error-code.js'
import { readTaskResultsForTasks } from '../storage/task-results.js'

import { escapeCdata } from './format-base.js'
import {
  formatActionFeedback,
  formatEnvironment,
  formatFocusContexts,
  formatFocusList,
  formatHistoryLookup,
  formatInputs,
  formatMemoryLookup,
  formatReadFileLookup,
  formatRecentHistory,
  formatResultsYaml,
  formatPlansYaml,
  formatTasksYaml,
  renderPromptTemplate,
} from './format.js'
import { loadPromptFile, loadPromptSource } from './prompt-loader.js'

import type { AppConfig } from '../config.js'
import type {
  FocusContext,
  FocusId,
  FocusMeta,
  HistoryLookupMessage,
  ManagerActionFeedback,
  ManagerEnv,
  MemoryLookupMessage,
  ReadFileLookupMessage,
  Task,
  TaskResult,
  TaskPlan,
  UserInput,
} from '../types/index.js'

export type { ManagerEnv } from '../types/index.js'

export type PromptSectionLimits = AppConfig['manager']['promptSections']

const clipUtf8ByBytes = (value: string, maxBytes: number): string => {
  if (maxBytes <= 0) return ''
  const buffer = Buffer.from(value, 'utf8')
  if (buffer.byteLength <= maxBytes) return value
  return buffer.subarray(0, maxBytes).toString('utf8').trimEnd()
}

const encodePromptSection = (value: string, maxBytes: number): string =>
  escapeCdata(clipUtf8ByBytes(value, maxBytes))

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

const collectTaskResults = (tasks: Task[]): TaskResult[] =>
  tasks
    .filter((task): task is Task & { result: TaskResult } =>
      Boolean(task.result),
    )
    .map((task) => task.result)

const collectResultTaskIds = (tasks: Task[]): string[] =>
  tasks
    .filter((task) => task.status !== 'pending' && task.status !== 'running')
    .map((task) => task.id)

const buildTaskResultDateHints = (tasks: Task[]): Record<string, string> =>
  Object.fromEntries(
    tasks
      .filter(
        (task): task is Task & { completedAt: string } =>
          typeof task.completedAt === 'string' && task.completedAt.length > 0,
      )
      .map((task) => [task.id, task.completedAt.slice(0, 10)]),
  )

const readOptionalMarkdown = async (path: string): Promise<string> => {
  try {
    return await readTextFileIfExists(path)
  } catch (error) {
    if (readErrorCode(error) === 'ENOENT') return ''
    throw error
  }
}

export const buildManagerPrompt = async (params: {
  stateDir: string
  workDir: string
  inputs: UserInput[]
  results: TaskResult[]
  tasks: Task[]
  promptSectionLimits: PromptSectionLimits
  plans?: TaskPlan[]
  historyLookup?: HistoryLookupMessage[]
  memoryLookup?: MemoryLookupMessage[]
  readFileLookup?: ReadFileLookupMessage[]
  actionFeedback?: ManagerActionFeedback[]
  compressedContext?: string
  env?: ManagerEnv
  focuses?: FocusMeta[]
  focusContexts?: FocusContext[]
  activeFocusIds?: FocusId[]
  workingFocusIds?: FocusId[]
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
  const history = await readHistory(statePaths.history)
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

  const focusPayload = buildFocusPromptPayload({
    focuses: params.focuses ?? [],
    focusContexts: params.focusContexts ?? [],
    activeFocusIds: params.activeFocusIds ?? [],
    history,
    workingFocusIds: params.workingFocusIds ?? [],
  })

  const systemSource = await loadPromptSource('manager/system.md')
  const templateValues: Record<string, string> = {
    environment: encodePromptSection(
      formatEnvironment({
        workDir: params.workDir,
        ...(params.env ? { env: params.env } : {}),
      }),
      params.promptSectionLimits.environmentMaxBytes,
    ),
    inputs: encodePromptSection(
      formatInputs(params.inputs),
      params.promptSectionLimits.inputsMaxBytes,
    ),
    batch_results: encodePromptSection(
      formatResultsYaml(params.tasks, pendingResults),
      params.promptSectionLimits.batchResultsMaxBytes,
    ),
    tasks: encodePromptSection(
      formatTasksYaml(params.tasks, resultsForTasks),
      params.promptSectionLimits.tasksMaxBytes,
    ),
    plans: encodePromptSection(
      formatPlansYaml(params.plans ?? []),
      params.promptSectionLimits.plansMaxBytes,
    ),
    recent_history: encodePromptSection(
      formatRecentHistory(focusPayload.recentHistory),
      params.promptSectionLimits.recentHistoryMaxBytes,
    ),
    focus_list: encodePromptSection(
      formatFocusList(focusPayload.focusList),
      params.promptSectionLimits.focusListMaxBytes,
    ),
    focus_contexts: encodePromptSection(
      formatFocusContexts(focusPayload.focusContexts),
      params.promptSectionLimits.focusContextsMaxBytes,
    ),
    history_lookup: encodePromptSection(
      formatHistoryLookup(params.historyLookup ?? []),
      params.promptSectionLimits.historyLookupMaxBytes,
    ),
    memory_lookup: encodePromptSection(
      formatMemoryLookup(params.memoryLookup ?? []),
      params.promptSectionLimits.memoryLookupMaxBytes,
    ),
    file_lookup: encodePromptSection(
      formatReadFileLookup(params.readFileLookup ?? []),
      params.promptSectionLimits.fileLookupMaxBytes,
    ),
    action_feedback: encodePromptSection(
      formatActionFeedback(params.actionFeedback ?? []),
      params.promptSectionLimits.actionFeedbackMaxBytes,
    ),
    compressed_context: encodePromptSection(
      params.compressedContext?.trim() ?? '',
      params.promptSectionLimits.compressedContextMaxBytes,
    ),
    persona: encodePromptSection(
      persona.trim(),
      params.promptSectionLimits.personaMaxBytes,
    ),
    user_profile: encodePromptSection(
      userProfile.trim(),
      params.promptSectionLimits.userProfileMaxBytes,
    ),
  }
  return renderPromptTemplate(
    systemSource.template,
    templateValues,
    systemSource.path,
  )
}

export const buildWorkerPrompt = async (params: {
  workDir: string
  task: Task
}): Promise<string> => {
  const systemSource = await loadPromptSource('worker/system.md')
  let taskPrompt = params.task.prompt
  if (params.task.cron || params.task.scheduledAt) {
    const prefix = await loadPromptFile('worker', 'cron-trigger-context')
    if (prefix) taskPrompt = `${prefix.trim()}\n\n${taskPrompt}`
  }
  return renderPromptTemplate(
    systemSource.template,
    {
      environment: escapeCdata(formatEnvironment({ workDir: params.workDir })),
      prompt: escapeCdata(taskPrompt),
    },
    systemSource.path,
  )
}
