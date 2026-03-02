import { buildFocusPromptPayload } from '../focus/index.js'
import { buildPaths } from '../fs/paths.js'
import { readHistory } from '../history/store.js'
import { readTaskResultsForTasks } from '../storage/task-results.js'

import {
  buildTaskResultDateHints,
  collectResultTaskIds,
  collectTaskResults,
  encodePromptSection,
  mergeTaskResults,
  readOptionalMarkdown,
} from './build-prompts-helpers.js'
import {
  formatActionFeedback,
  formatEnvironment,
  formatFocusContexts,
  formatFocusList,
  formatHistoryLookup,
  formatInputs,
  formatPlansYaml,
  formatReadFileLookup,
  formatRecentHistory,
  formatResultsYaml,
  formatTasksYaml,
  renderPromptTemplate,
} from './format.js'
import { escapeCdata } from './format-base.js'
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
  const section = (value: string, maxBytes: number): string =>
    encodePromptSection(value, maxBytes)
  const templateValues: Record<string, string> = {
    environment: section(
      formatEnvironment({
        workDir: params.workDir,
        ...(params.env ? { env: params.env } : {}),
      }),
      limits.environmentMaxBytes,
    ),
    inputs: section(formatInputs(params.inputs), limits.inputsMaxBytes),
    batch_results: section(
      formatResultsYaml(params.tasks, pendingResults),
      limits.batchResultsMaxBytes,
    ),
    tasks: section(
      formatTasksYaml(params.tasks, resultsForTasks),
      limits.tasksMaxBytes,
    ),
    plans: section(formatPlansYaml(params.plans ?? []), limits.plansMaxBytes),
    recent_history: section(
      formatRecentHistory(focusPayload.recentHistory),
      limits.recentHistoryMaxBytes,
    ),
    focus_list: section(
      formatFocusList(focusPayload.focusList),
      limits.focusListMaxBytes,
    ),
    focus_contexts: section(
      formatFocusContexts(focusPayload.focusContexts),
      limits.focusContextsMaxBytes,
    ),
    history_lookup: section(
      formatHistoryLookup(params.historyLookup ?? []),
      limits.historyLookupMaxBytes,
    ),
    memory: section(memory.trim(), limits.memoryMaxBytes),
    file_lookup: section(
      formatReadFileLookup(params.readFileLookup ?? []),
      limits.fileLookupMaxBytes,
    ),
    action_feedback: section(
      formatActionFeedback(params.actionFeedback ?? []),
      limits.actionFeedbackMaxBytes,
    ),
    compressed_context: section(
      params.compressedContext?.trim() ?? '',
      limits.compressedContextMaxBytes,
    ),
    persona: section(persona.trim(), limits.personaMaxBytes),
    user_profile: section(userProfile.trim(), limits.userProfileMaxBytes),
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
