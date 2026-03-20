import type { AppConfig } from '../config.js'
import type { ProviderPromptSegment } from '../providers/types.js'
import type {
  FocusId,
  FocusMeta,
  HistoryLookupMessage,
  ManagerActionFeedback,
  ManagerContextPacket,
  ManagerEnv,
  ManagerPacketMode,
  QueryLookupMessage,
  ReadFileLookupMessage,
  Task,
  TaskPlan,
  TaskResult,
  UserInput,
} from '../types/index.js'

export type PromptSectionLimits = AppConfig['manager']['promptSections']

export type ManagerPromptPayload = {
  prefix: string
  suffix: string
  prompt: string
  promptSegments: ProviderPromptSegment[]
  contextPacket: ManagerContextPacket
  packetSummary: string
}

export type BuildManagerPromptParams = {
  stateDir: string
  workDir: string
  inputs: UserInput[]
  results: TaskResult[]
  tasks: Task[]
  promptSectionLimits: PromptSectionLimits
  plans?: TaskPlan[]
  historyLookup?: HistoryLookupMessage[]
  queryLookup?: QueryLookupMessage
  readFileLookup?: ReadFileLookupMessage[]
  actionFeedback?: ManagerActionFeedback[]
  env?: ManagerEnv
  focuses?: FocusMeta[]
  workingFocusIds?: FocusId[]
  packetMode?: ManagerPacketMode
  wakeProfile?: ManagerEnv['wakeProfile']
}

export type ManagerPromptPacketBuildResult = {
  packetBundle: {
    packet: ManagerContextPacket
    summaryText: string
  }
  statePacket: string
  eventPacket: string
  selectedRememberedMemory: string
  selectedMemory: string
}
