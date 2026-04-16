import { encodePromptTextSection } from '../../foundation/prompting/build-prompts-helpers.js'

import { buildManagerContextPacket } from './manager-context-packet.js'
import {
  buildEventPacketPayload,
  buildStatePacketPayload,
} from './manager-prompt-packet-content.js'
import { buildManagerPacketSectionSource } from './manager-prompt-section-source.js'
import {
  type PacketSectionPolicy,
  selectPacketSections,
} from './select-packet-sections.js'

import type { ManagerPromptRuntimeData } from './manager-prompt-runtime-helpers.js'
import type {
  BuildManagerPromptParams,
  ManagerPromptPacketBuildResult,
} from './manager-prompt-types.js'
import type {
  ManagerEnv,
  ManagerPacketMode,
} from '../../foundation/types/index.js'

export const buildManagerPromptPackets = (params: {
  workDir: string
  wakeProfile: NonNullable<ManagerEnv['wakeProfile']>
  packetMode: ManagerPacketMode
  limits: BuildManagerPromptParams['promptSectionLimits']
  runtime: ManagerPromptRuntimeData
  inputs: BuildManagerPromptParams['inputs']
  tasks: BuildManagerPromptParams['tasks']
  plans: BuildManagerPromptParams['plans']
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
      env: params.env,
      sectionPolicy: params.sectionPolicy,
    })
  const selectedSections = selectPacketSections({
    sections: sectionSources,
    mode: params.packetMode,
    wakeProfile: params.wakeProfile,
  })
  const contextPacket = buildManagerContextPacket({
    wakeProfile: params.wakeProfile,
    mode: params.packetMode,
    inputs: params.inputs,
    results: params.runtime.pendingResults,
    tasks: params.tasks,
    plans: params.plans ?? [],
    workingFocusIds: params.runtime.normalizedWorkingFocusIds,
  })
  const workingFocusIds = contextPacket.workingFocusIds ?? []
  const sectionText = (value: string, maxBytes: number): string =>
    encodePromptTextSection(value, maxBytes)
  const statePacketPayload = buildStatePacketPayload({
    selectedSections,
    focusPayload: params.runtime.focusPayload,
    tasks: params.tasks,
    workDir: params.workDir,
    plans: params.plans,
    workingFocusIds,
    primaryWorkline: contextPacket.primaryWorkline,
    ...(contextPacket.latestResult?.taskId
      ? { latestResultTaskId: contextPacket.latestResult.taskId }
      : {}),
  })
  const statePacket = sectionText(
    statePacketPayload.payload,
    params.limits.focusListMaxBytes +
      params.limits.workingFocusesMaxBytes +
      params.limits.tasksMaxBytes +
      params.limits.plansMaxBytes,
  )
  const eventPacket = sectionText(
    buildEventPacketPayload({
      selectedSections,
      environmentSource,
      inputs: params.inputs,
      quoteLookup: params.runtime.quoteLookup,
      batchResultsPayload: digestSections.batchResultsPayload,
      recentHistoryPayload: digestSections.recentHistoryPayload,
      packet: contextPacket,
    }),
    params.limits.environmentMaxBytes +
      params.limits.inputsMaxBytes +
      params.limits.batchResultsMaxBytes +
      params.limits.recentHistoryMaxBytes,
  )

  return {
    contextPacket,
    statePacket,
    eventPacket,
    selectedRememberedMemory: selectedSections.remembered_memory,
    selectedMemory: selectedSections.memory,
    promptSelection: statePacketPayload.selection,
  }
}
