import { buildFocusPromptPayload } from '../focus/index.js'
import { buildPaths } from '../fs/paths.js'
import { readHistory } from '../history/store.js'
import { readTaskResultsForTasks } from '../storage/task-results.js'

import {
  buildTaskResultDateHints,
  collectResultTaskIds,
  collectTaskResults,
  encodePromptJsonSection,
  encodePromptTextSection,
  mergeTaskResults,
  readOptionalMarkdown,
} from './build-prompts-helpers.js'
import { prepareWorkerTaskPrompt } from './build-worker-task-prompt.js'
import { escapeCdata } from './format-base.js'
import {
  formatWorkerFocusContext,
  type WorkerCompressedFocusContext,
} from './format-worker-focus-context.js'
import {
  formatActionFeedback,
  formatEnvironment,
  formatFocusContexts,
  formatFocusList,
  formatHistoryLookup,
  formatInputs,
  formatPlansJson,
  formatReadFileLookup,
  formatRecentHistory,
  formatResultsJson,
  formatTaskArchiveLookup,
  formatTasksJson,
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
  ReadFileLookupMessage,
  Task,
  TaskArchiveLookupMessage,
  TaskPlan,
  TaskResult,
  UserInput,
} from '../types/index.js'

export type { ManagerEnv } from '../types/index.js'

export type PromptSectionLimits = AppConfig['manager']['promptSections']

export const buildManagerPrompt = async (params: {
  stateDir: string
  workDir: string
  inputs: UserInput[]
  results: TaskResult[]
  tasks: Task[]
  promptSectionLimits: PromptSectionLimits
  plans?: TaskPlan[]
  historyLookup?: HistoryLookupMessage[]
  readFileLookup?: ReadFileLookupMessage[]
  taskArchiveLookup?: TaskArchiveLookupMessage[]
  actionFeedback?: ManagerActionFeedback[]
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
  const memory = await readOptionalMarkdown(statePaths.memoryFile)
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
  const limits = params.promptSectionLimits
  const sectionText = (value: string, maxBytes: number): string =>
    encodePromptTextSection(value, maxBytes)
  const sectionJson = (value: string, maxBytes: number): string =>
    encodePromptJsonSection(value, maxBytes)
  const templateValues: Record<string, string> = {
    environment: sectionText(
      formatEnvironment({
        workDir: params.workDir,
        ...(params.env ? { env: params.env } : {}),
      }),
      limits.environmentMaxBytes,
    ),
    inputs: sectionJson(formatInputs(params.inputs), limits.inputsMaxBytes),
    batch_results: sectionJson(
      formatResultsJson(params.tasks, pendingResults, params.workDir),
      limits.batchResultsMaxBytes,
    ),
    tasks: sectionJson(
      formatTasksJson(params.tasks, resultsForTasks, params.workDir),
      limits.tasksMaxBytes,
    ),
    plans: sectionJson(
      formatPlansJson(params.plans ?? []),
      limits.plansMaxBytes,
    ),
    recent_history: sectionJson(
      formatRecentHistory(focusPayload.recentHistory),
      limits.recentHistoryMaxBytes,
    ),
    focus_list: sectionJson(
      formatFocusList(focusPayload.focusList),
      limits.focusListMaxBytes,
    ),
    focus_contexts: sectionJson(
      formatFocusContexts(focusPayload.focusContexts),
      limits.focusContextsMaxBytes,
    ),
    history_lookup: sectionJson(
      formatHistoryLookup(params.historyLookup ?? []),
      limits.historyLookupMaxBytes,
    ),
    memory: sectionText(memory.trim(), limits.memoryMaxBytes),
    file_lookup: sectionJson(
      formatReadFileLookup(params.readFileLookup ?? []),
      limits.fileLookupMaxBytes,
    ),
    task_archive_lookup: sectionJson(
      formatTaskArchiveLookup(params.taskArchiveLookup ?? [], params.workDir),
      limits.taskArchiveLookupMaxBytes,
    ),
    action_feedback: sectionJson(
      formatActionFeedback(params.actionFeedback ?? []),
      limits.actionFeedbackMaxBytes,
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
  focusMeta?: FocusMeta
  focusContext?: FocusContext
  compressedFocusContext?: WorkerCompressedFocusContext
}): Promise<string> => {
  const systemSource = await loadPromptSource('worker/system.md')
  let taskPrompt = await prepareWorkerTaskPrompt({
    workDir: params.workDir,
    taskId: params.task.id,
    taskCreatedAt: params.task.createdAt,
    taskPrompt: params.task.prompt,
  })
  if (params.task.cron || params.task.scheduledAt) {
    const prefix = await loadPromptFile('worker', 'cron-trigger-context')
    if (prefix) taskPrompt = `${prefix.trim()}\n\n${taskPrompt}`
  }
  const focusContext = formatWorkerFocusContext({
    focusId: params.task.focusId,
    ...(params.focusMeta ? { focusMeta: params.focusMeta } : {}),
    ...(params.focusContext ? { focusContext: params.focusContext } : {}),
    ...(params.compressedFocusContext
      ? { compressedFocusContext: params.compressedFocusContext }
      : {}),
  })
  return renderPromptTemplate(
    systemSource.template,
    {
      environment: escapeCdata(formatEnvironment({ workDir: params.workDir })),
      prompt: escapeCdata(taskPrompt),
      focus_context: focusContext ? escapeCdata(focusContext) : '',
    },
    systemSource.path,
  )
}
