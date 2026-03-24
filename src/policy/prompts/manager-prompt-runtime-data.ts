import { mergeTaskResults } from '../../foundation/prompting/build-prompts-helpers.js'
import { buildQuoteReferenceLookup } from '../../foundation/prompting/format.js'
import { buildPaths } from '../../persistence/fs/paths.js'
import { readHistory } from '../../persistence/history/store.js'
import { buildFocusPromptPayload } from '../../work/focus/index.js'
import { readMemoryEntries } from '../../work/memory/store.js'
import { buildMemoryPromptSections } from '../memory/prompt-sections.js'

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
    focusPayload,
    quoteLookup,
    memoryPrompts,
    recentHistorySource: demand.includeRecentHistory
      ? summarizeRecentHistory(focusPayload.recentHistory)
      : '',
  }
}
