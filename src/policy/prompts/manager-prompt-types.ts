import type { AppConfig } from '../../bootstrap/config.js'
import type { ProviderPromptSegment } from '../../execution/providers/types.js'
import type {
  FocusId,
  FocusMeta,
  ManagerActionFeedback,
  ManagerContextPacket,
  ManagerEnv,
  ManagerPacketMode,
  Task,
  TaskPlan,
  TaskResult,
  UserInput,
} from '../../foundation/types/index.js'

export type PromptSectionLimits = AppConfig['manager']['promptSections']
export type OrderedWorkingFocusIds = FocusId[]

export type PromptSectionUsage = {
  system: number
  action_surface: number
  state_packet: number
  event_packet: number
  project_profile: number
  remembered_memory: number
  memory: number
}

export type PromptSelectionSummary = {
  tasks: {
    selected: number
    full: number
    card: number
  }
  plans: {
    selected: number
    full: number
    card: number
  }
}

export type ManagerPromptPayload = {
  prompt: string
  promptSegments: ProviderPromptSegment[]
  contextPacket: ManagerContextPacket
  promptSections: PromptSectionUsage
  promptSelection: PromptSelectionSummary
}

export type BuildManagerPromptParams = {
  stateDir: string
  workDir: string
  startupWorktree?: string
  inputs: UserInput[]
  results: TaskResult[]
  tasks: Task[]
  promptSectionLimits: PromptSectionLimits
  plans?: TaskPlan[]
  actionFeedback?: ManagerActionFeedback[]
  env?: ManagerEnv
  focuses?: FocusMeta[]
  workingFocusIds?: OrderedWorkingFocusIds
  packetMode?: ManagerPacketMode
  wakeProfile?: ManagerEnv['wakeProfile']
}

export type ManagerPromptPacketBuildResult = {
  contextPacket: ManagerContextPacket
  statePacket: string
  eventPacket: string
  selectedProjectProfile: string
  selectedRememberedMemory: string
  selectedMemory: string
  promptSelection: PromptSelectionSummary
}
