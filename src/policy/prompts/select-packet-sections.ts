import { shouldIncludePacketSection } from './manager-context-packet.js'

import type {
  ManagerPacketMode,
  ManagerPacketSection,
  ManagerWakeProfile,
} from '../../foundation/types/index.js'

export type PacketSections = Record<ManagerPacketSection, string>
export type PacketSectionPolicy = Record<ManagerPacketSection, boolean>

const SELECTABLE_PACKET_SECTIONS: ManagerPacketSection[] = [
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
}): PacketSections => {
  const selectedSections: PacketSections = { ...params.sections }
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
    )
      continue
    selectedSections[section] = ''
  }
  return selectedSections
}
