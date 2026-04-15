import { mergeTaskResults } from '../../foundation/prompting/build-prompts-helpers.js'
import { buildQuoteReferenceLookup } from '../../foundation/prompting/format.js'
import { buildPaths } from '../../persistence/fs/paths.js'
import { readHistory } from '../../persistence/history/store.js'
import { buildFocusPromptPayload } from '../../work/focus/index.js'
import { readMemoryEntries } from '../../work/memory/store.js'
import {
  formatProjectProfilePrompt,
  readProjectProfileEntries,
  resolveProjectProfilePath,
} from '../../work/project-profile/store.js'
import { buildMemoryPromptSections } from '../memory/prompt-sections.js'

import { hydratePromptHistoryResults } from './manager-prompt-history-hydrate.js'
import {
  buildMemoryPromptScoreContext,
  hasQuotedInputs,
  type ManagerPromptRuntimeData,
  type ManagerPromptRuntimeDemand,
  normalizeRuntimeDemand,
  normalizeWorkingFocusIds,
  summarizeRecentHistory,
} from './manager-prompt-runtime-helpers.js'

import type { BuildManagerPromptParams } from './manager-prompt-types.js'

export const prepareManagerPromptRuntimeData = async (
  params: BuildManagerPromptParams,
  demandInput?: Partial<ManagerPromptRuntimeDemand>,
): Promise<ManagerPromptRuntimeData> => {
  const demand = normalizeRuntimeDemand(demandInput)
  const normalizedWorkingFocusIds = normalizeWorkingFocusIds(
    params.workingFocusIds ?? [],
  )
  const hydratedHistory = await hydratePromptHistoryResults({
    stateDir: params.stateDir,
    workDir: params.workDir,
    inputs: params.inputs,
    results: params.results,
    tasks: params.tasks,
  })
  const pendingResults = mergeTaskResults(
    params.results,
    hydratedHistory.results,
  )
  const statePaths = buildPaths(params.stateDir)

  const requiresFocusHistory =
    (demand.includeWorkingFocuses && normalizedWorkingFocusIds.length > 0) ||
    demand.includeRecentHistory
  const requiresQuoteHistory =
    demand.includeInputs && hasQuotedInputs(params.inputs)
  const shouldReadHistory = requiresFocusHistory || requiresQuoteHistory
  const history = shouldReadHistory ? await readHistory(statePaths.history) : []

  const shouldLoadMemory =
    demand.includeRememberedMemory || demand.includeMemory
  const startupWorktree = params.startupWorktree?.trim()
  const shouldLoadProjectProfile =
    demand.includeProjectProfile && Boolean(startupWorktree)
  const memoryEntries = shouldLoadMemory
    ? await readMemoryEntries(statePaths.memoryFile)
    : []
  const projectProfileEntries = shouldLoadProjectProfile
    ? await readProjectProfileEntries(
        resolveProjectProfilePath(params.stateDir, startupWorktree ?? ''),
      )
    : []

  const focusHistory = requiresFocusHistory ? history : []
  const focusPayload = buildFocusPromptPayload({
    focuses: params.focuses ?? [],
    history: focusHistory,
    workingFocusIds: normalizedWorkingFocusIds,
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
          focusPayload,
          workingFocusIds: normalizedWorkingFocusIds,
        }),
        maxBytes: params.promptSectionLimits.memoryMaxBytes,
        includeRemembered: demand.includeRememberedMemory,
        includeMemory: demand.includeMemory,
      })
    : { rememberedMemory: '', memory: '' }
  return {
    pendingResults,
    historyHydratedTaskIds: hydratedHistory.hydratedTaskIds,
    normalizedWorkingFocusIds,
    focusPayload,
    quoteLookup,
    projectProfilePrompt: shouldLoadProjectProfile
      ? formatProjectProfilePrompt(projectProfileEntries)
      : '',
    memoryPrompts,
    recentHistorySource: demand.includeRecentHistory
      ? summarizeRecentHistory(focusPayload.recentHistory)
      : '',
  }
}
