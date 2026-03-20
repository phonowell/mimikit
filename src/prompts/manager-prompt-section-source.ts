import {
  encodePromptJsonSection,
  encodePromptTextSection,
} from './build-prompts-helpers.js'
import {
  formatActionFeedback,
  formatEnvironment,
  formatFocusList,
  formatHistoryLookup,
  formatInputs,
  formatPlansJson,
  formatQueryLookup,
  formatReadFileLookup,
  formatResultsJson,
  formatTasksJson,
  formatWorkingFocuses,
} from './format.js'
import { buildManagerEventDigests } from './manager-event-digests.js'

import type { ManagerPromptRuntimeData } from './manager-prompt-runtime-helpers.js'
import type { BuildManagerPromptParams } from './manager-prompt-types.js'
import type {
  PacketSectionPolicy,
  PacketSections,
} from './select-packet-sections.js'

export const buildManagerPacketSectionSource = (params: {
  workDir: string
  limits: BuildManagerPromptParams['promptSectionLimits']
  runtime: ManagerPromptRuntimeData
  inputs: BuildManagerPromptParams['inputs']
  tasks: BuildManagerPromptParams['tasks']
  plans: BuildManagerPromptParams['plans']
  historyLookup: BuildManagerPromptParams['historyLookup']
  queryLookup: BuildManagerPromptParams['queryLookup']
  readFileLookup: BuildManagerPromptParams['readFileLookup']
  actionFeedback: BuildManagerPromptParams['actionFeedback']
  env: BuildManagerPromptParams['env']
  sectionPolicy: PacketSectionPolicy
}): {
  environmentSource: string
  digestSections: ReturnType<typeof buildManagerEventDigests>
  sectionSources: PacketSections
} => {
  const sectionText = (value: string, maxBytes: number): string =>
    encodePromptTextSection(value, maxBytes)
  const sectionJson = (value: string, maxBytes: number): string =>
    encodePromptJsonSection(value, maxBytes)
  const environmentSource = params.sectionPolicy.environment
    ? formatEnvironment({
        workDir: params.workDir,
        ...(params.env ? { env: params.env } : {}),
      })
    : ''
  const queryLookupSource = params.sectionPolicy.query_lookup
    ? formatQueryLookup(params.queryLookup)
    : ''
  const batchResults = params.sectionPolicy.batch_results
    ? sectionJson(
        formatResultsJson(
          params.tasks,
          params.runtime.pendingResults,
          params.workDir,
        ),
        params.limits.batchResultsMaxBytes,
      )
    : ''
  const digestSections = buildManagerEventDigests({
    recentHistory: params.sectionPolicy.recent_history
      ? params.runtime.focusPayload.recentHistory
      : [],
    recentHistorySource: params.sectionPolicy.recent_history
      ? params.runtime.recentHistorySource
      : '',
    ...(params.queryLookup ? { queryLookup: params.queryLookup } : {}),
    queryLookupSource,
    tasks: params.tasks,
    pendingResults: params.runtime.pendingResults,
    batchResultsSource: batchResults,
  })

  return {
    environmentSource,
    digestSections,
    sectionSources: {
      packet_summary: '',
      environment: sectionText(
        environmentSource,
        params.limits.environmentMaxBytes,
      ),
      focus_list: params.sectionPolicy.focus_list
        ? sectionJson(
            formatFocusList(params.runtime.focusPayload.focusList),
            params.limits.focusListMaxBytes,
          )
        : '',
      working_focuses: params.sectionPolicy.working_focuses
        ? sectionJson(
            formatWorkingFocuses(params.runtime.focusPayload.workingFocuses),
            params.limits.workingFocusesMaxBytes,
          )
        : '',
      remembered_memory: params.sectionPolicy.remembered_memory
        ? sectionText(
            params.runtime.memoryPrompts.rememberedMemory,
            params.limits.memoryMaxBytes,
          )
        : '',
      memory: params.sectionPolicy.memory
        ? sectionText(
            params.runtime.memoryPrompts.memory,
            params.limits.memoryMaxBytes,
          )
        : '',
      tasks: params.sectionPolicy.tasks
        ? sectionJson(
            formatTasksJson(
              params.tasks,
              [],
              params.workDir,
            ),
            params.limits.tasksMaxBytes,
          )
        : '',
      plans: params.sectionPolicy.plans
        ? sectionJson(
            formatPlansJson(params.plans ?? []),
            params.limits.plansMaxBytes,
          )
        : '',
      inputs: params.sectionPolicy.inputs
        ? sectionJson(
            formatInputs(params.inputs, params.runtime.quoteLookup),
            params.limits.inputsMaxBytes,
          )
        : '',
      batch_results: digestSections.batchResults,
      recent_history: digestSections.recentHistory,
      history_lookup: params.sectionPolicy.history_lookup
        ? sectionJson(
            formatHistoryLookup(params.historyLookup ?? []),
            params.limits.historyLookupMaxBytes,
          )
        : '',
      query_lookup: digestSections.queryLookup,
      file_lookup: params.sectionPolicy.file_lookup
        ? sectionJson(
            formatReadFileLookup(params.readFileLookup ?? []),
            params.limits.fileLookupMaxBytes,
          )
        : '',
      action_feedback: params.sectionPolicy.action_feedback
        ? sectionJson(
            formatActionFeedback(params.actionFeedback ?? []),
            params.limits.actionFeedbackMaxBytes,
          )
        : '',
    },
  }
}
