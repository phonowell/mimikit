import { encodePromptTextSection } from './build-prompts-helpers.js'
import { buildManagerContextPacket } from './manager-context-packet.js'
import {
  buildEventPacketPayload,
  buildStatePacketPayload,
} from './manager-prompt-packet-content.js'
import { buildManagerPacketSectionSource } from './manager-prompt-section-source.js'
import {
  selectPacketSections,
  type PacketSectionPolicy,
} from './select-packet-sections.js'

import type { ManagerPromptRuntimeData } from './manager-prompt-runtime-data.js'
import type {
  BuildManagerPromptParams,
  ManagerPromptPacketBuildResult,
} from './manager-prompt-types.js'
import type { ManagerEnv, ManagerPacketMode } from '../types/index.js'

export const buildManagerPromptPackets = (params: {
  workDir: string
  wakeProfile: NonNullable<ManagerEnv['wakeProfile']>
  packetMode: ManagerPacketMode
  limits: BuildManagerPromptParams['promptSectionLimits']
  runtime: ManagerPromptRuntimeData
  inputs: BuildManagerPromptParams['inputs']
  tasks: BuildManagerPromptParams['tasks']
  plans: BuildManagerPromptParams['plans']
  historyLookup: BuildManagerPromptParams['historyLookup']
  queryLookup: BuildManagerPromptParams['queryLookup']
  readFileLookup: BuildManagerPromptParams['readFileLookup']
  actionFeedback: BuildManagerPromptParams['actionFeedback']
  workingFocusIds: BuildManagerPromptParams['workingFocusIds']
  env: BuildManagerPromptParams['env']
  sectionPolicy: PacketSectionPolicy
}): ManagerPromptPacketBuildResult => {
  const { environmentSource, digestSections, sectionSources } =
    buildManagerPacketSectionSource({
      workDir: params.workDir,
      limits: params.limits,
      runtime: params.runtime,
      inputs: params.inputs,
      tasks: params.tasks,
      plans: params.plans,
      historyLookup: params.historyLookup,
      queryLookup: params.queryLookup,
      readFileLookup: params.readFileLookup,
      actionFeedback: params.actionFeedback,
      env: params.env,
      sectionPolicy: params.sectionPolicy,
    })
  const { selectedSections, includedSections, prunedSections } =
    selectPacketSections({
      sections: sectionSources,
      mode: params.packetMode,
      wakeProfile: params.wakeProfile,
    })
  const includedSectionSet = new Set(includedSections)
  const includedSectionDigests = digestSections.sectionDigests.filter((item) =>
    includedSectionSet.has(item.section),
  )
  const packetBundle = buildManagerContextPacket({
    wakeProfile: params.wakeProfile,
    mode: params.packetMode,
    inputs: params.inputs,
    results: params.runtime.pendingResults,
    tasks: params.tasks,
    plans: params.plans ?? [],
    workingFocusIds: params.workingFocusIds ?? [],
    includedSections: ['packet_summary', ...includedSections],
    prunedSections,
    ...(includedSectionDigests.length > 0
      ? { sectionDigests: includedSectionDigests }
      : {}),
  })
  const sectionText = (value: string, maxBytes: number): string =>
    encodePromptTextSection(value, maxBytes)
  const statePacket = sectionText(
    buildStatePacketPayload({
      selectedSections,
      focusPayload: params.runtime.focusPayload,
      tasks: params.tasks,
      resultsForTasks: params.runtime.resultsForTasks,
      workDir: params.workDir,
      plans: params.plans,
    }),
    params.limits.focusListMaxBytes +
      params.limits.workingFocusesMaxBytes +
      params.limits.tasksMaxBytes +
      params.limits.plansMaxBytes +
      params.limits.packetSummaryMaxBytes,
  )
  const eventPacket = sectionText(
    buildEventPacketPayload({
      selectedSections,
      environmentSource,
      inputs: params.inputs,
      quoteLookup: params.runtime.quoteLookup,
      batchResultsPayload: digestSections.batchResultsPayload,
      recentHistoryPayload: digestSections.recentHistoryPayload,
      historyLookup: params.historyLookup,
      queryLookupPayload: digestSections.queryLookupPayload,
      readFileLookup: params.readFileLookup,
      actionFeedback: params.actionFeedback,
      packet: packetBundle.packet,
    }),
    params.limits.environmentMaxBytes +
      params.limits.inputsMaxBytes +
      params.limits.batchResultsMaxBytes +
      params.limits.recentHistoryMaxBytes +
      params.limits.historyLookupMaxBytes +
      params.limits.queryLookupMaxBytes +
      params.limits.fileLookupMaxBytes +
      params.limits.actionFeedbackMaxBytes +
      params.limits.packetSummaryMaxBytes,
  )

  return {
    packetBundle,
    statePacket,
    eventPacket,
    selectedRememberedMemory: selectedSections.remembered_memory,
    selectedMemory: selectedSections.memory,
  }
}
