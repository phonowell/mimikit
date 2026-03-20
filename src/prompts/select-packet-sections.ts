import { shouldIncludePacketSection } from './manager-context-packet.js'

import type {
  ManagerPacketMode,
  ManagerPacketSection,
  ManagerWakeProfile,
} from '../types/index.js'

export type PacketSections = Record<ManagerPacketSection, string>

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
  'history_lookup',
  'query_lookup',
  'file_lookup',
  'action_feedback',
]

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
