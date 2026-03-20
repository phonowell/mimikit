import { buildFocusPromptPayload } from '../focus/index.js'
import { buildPaths } from '../fs/paths.js'
import { readHistory } from '../history/store.js'
import { buildMemoryPromptSections } from '../memory/prompt-sections.js'
import { readMemoryEntries } from '../memory/store.js'
import { readTaskResultsForTasks } from '../storage/task-results.js'

import {
  buildTaskResultDateHints,
  collectResultTaskIds,
  collectTaskResults,
  mergeTaskResults,
} from './build-prompts-helpers.js'
import { buildQuoteReferenceLookup } from './format.js'
import {
  buildMemoryPromptScoreContext,
  hasQuotedInputs,
  type ManagerPromptRuntimeData,
  type ManagerPromptRuntimeDemand,
  normalizeRuntimeDemand,
  summarizeRecentHistory,
} from './manager-prompt-runtime-helpers.js'

import type { BuildManagerPromptParams } from './manager-prompt-types.js'

export const prepareManagerPromptRuntimeData = async (
  params: BuildManagerPromptParams,
  demandInput?: Partial<ManagerPromptRuntimeDemand>,
): Promise<ManagerPromptRuntimeData> => {
  const demand = normalizeRuntimeDemand(demandInput)
  const workingFocusIds = params.workingFocusIds ?? []
  const pendingResults = mergeTaskResults(params.results, [])
  const knownResults = mergeTaskResults(
    pendingResults,
    collectTaskResults(params.tasks),
  )
  const statePaths = buildPaths(params.stateDir)

  const requiresFocusHistory =
    (demand.includeWorkingFocuses && workingFocusIds.length > 0) ||
    demand.includeRecentHistory
  const requiresQuoteHistory =
    demand.includeInputs && hasQuotedInputs(params.inputs)
  const shouldReadHistory = requiresFocusHistory || requiresQuoteHistory
  const history = shouldReadHistory ? await readHistory(statePaths.history) : []

  const shouldLoadMemory =
    demand.includeRememberedMemory || demand.includeMemory
  const memoryEntries = shouldLoadMemory
    ? await readMemoryEntries(statePaths.memoryFile)
    : []

  const resultTaskIds = demand.includeTasks
    ? collectResultTaskIds(params.tasks)
    : []
  const dateHints = buildTaskResultDateHints(params.tasks)
  const archivedResults =
    resultTaskIds.length > 0
      ? await readTaskResultsForTasks(params.stateDir, resultTaskIds, {
          dateHints,
        })
      : []
  const pendingResultIds = new Set(
    pendingResults.map((result) => result.taskId),
  )
  const mergedResults = mergeTaskResults(knownResults, archivedResults)
  const resultsForTasks = demand.includeTasks
    ? mergedResults.filter((result) => !pendingResultIds.has(result.taskId))
    : []

  const focusHistory = requiresFocusHistory ? history : []
  const focusPayload = buildFocusPromptPayload({
    focuses: params.focuses ?? [],
    history: focusHistory,
    workingFocusIds,
  })
  const quoteLookup =
    demand.includeInputs && hasQuotedInputs(params.inputs)
      ? buildQuoteReferenceLookup({
          history,
          inputs: params.inputs,
        })
      : new Map()
  const memoryPrompts = shouldLoadMemory
    ? buildMemoryPromptSections({
        entries: memoryEntries,
        context: buildMemoryPromptScoreContext({
          inputs: params.inputs,
          tasks: params.tasks,
          plans: params.plans ?? [],
          focusPayload,
          workingFocusIds,
        }),
        maxBytes: params.promptSectionLimits.memoryMaxBytes,
        includeRemembered: demand.includeRememberedMemory,
        includeMemory: demand.includeMemory,
      })
    : { rememberedMemory: '', memory: '' }
  return {
    pendingResults,
    resultsForTasks,
    focusPayload,
    quoteLookup,
    memoryPrompts,
    recentHistorySource: demand.includeRecentHistory
      ? summarizeRecentHistory(focusPayload.recentHistory)
      : '',
  }
}
