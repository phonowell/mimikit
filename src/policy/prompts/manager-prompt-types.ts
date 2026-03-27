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

export type ManagerPromptPayload = {
  prompt: string
  promptSegments: ProviderPromptSegment[]
  contextPacket: ManagerContextPacket
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
  workingFocusIds?: FocusId[]
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
}
