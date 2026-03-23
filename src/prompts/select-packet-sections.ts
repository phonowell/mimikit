import { shouldIncludePacketSection } from './manager-context-packet.js'

import type {
  ManagerPacketMode,
  ManagerPacketSection,
  ManagerWakeProfile,
} from '../types/index.js'

export type PacketSections = Record<ManagerPacketSection, string>
export type PacketSectionPolicy = Record<
  Exclude<ManagerPacketSection, 'packet_summary'>,
  boolean
>

const SELECTABLE_PACKET_SECTIONS: Exclude<
  ManagerPacketSection,
  'packet_summary'
>[] = [
  'environment',
  'focus_list',
  'working_focuses',
  'remembered_memory',
  'memory',
  'tasks',
  'plans',
  'inputs',
  'batch_results',
  'recent_history',
  'action_feedback',
]

export const resolvePacketSectionPolicy = (params: {
  mode: ManagerPacketMode
  wakeProfile: ManagerWakeProfile
}): PacketSectionPolicy => {
  const policy: PacketSectionPolicy = {
    environment: false,
    focus_list: false,
    working_focuses: false,
    remembered_memory: false,
    memory: false,
    tasks: false,
    plans: false,
    inputs: false,
    batch_results: false,
    recent_history: false,
    action_feedback: false,
  }
  for (const section of SELECTABLE_PACKET_SECTIONS) {
    policy[section] = shouldIncludePacketSection({
      mode: params.mode,
      wakeProfile: params.wakeProfile,
      section,
      hasContent: true,
    })
  }
  return policy
}

export const selectPacketSections = (params: {
  sections: PacketSections
  mode: ManagerPacketMode
  wakeProfile: ManagerWakeProfile
}): {
  selectedSections: PacketSections
  includedSections: ManagerPacketSection[]
  prunedSections: ManagerPacketSection[]
} => {
  const selectedSections: PacketSections = { ...params.sections }
  const includedSections: ManagerPacketSection[] = []
  const prunedSections: ManagerPacketSection[] = []
  for (const section of SELECTABLE_PACKET_SECTIONS) {
    const value = params.sections[section]
    const hasContent = value.trim().length > 0
    if (
      shouldIncludePacketSection({
        mode: params.mode,
        wakeProfile: params.wakeProfile,
        section,
        hasContent,
      })
    ) {
      includedSections.push(section)
      continue
    }
    if (hasContent) prunedSections.push(section)
    selectedSections[section] = ''
  }
  return { selectedSections, includedSections, prunedSections }
}
