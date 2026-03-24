import type { FocusId } from '../../foundation/types/base.js'
import type {
  ManagerWakeProfile,
  TaskResultStatus,
} from '../../foundation/types/runtime-domain.js'

export type ManagerPacketMode = 'minimal' | 'standard' | 'expanded'

export type ManagerPacketSection =
  | 'packet_summary'
  | 'environment'
  | 'focus_list'
  | 'working_focuses'
  | 'remembered_memory'
  | 'memory'
  | 'tasks'
  | 'plans'
  | 'inputs'
  | 'batch_results'
  | 'recent_history'
  | 'action_feedback'

type ManagerSectionDigest = {
  section: 'recent_history' | 'batch_results'
  mode: 'digest'
  sourceBytes: number
  digestBytes: number
  sourceItems: number
  digestItems: number
  sourceRefCount: number
}

export type ManagerContextPacket = {
  id: string
  createdAt: string
  wakeProfile: ManagerWakeProfile
  mode: ManagerPacketMode
  counts: {
    inputs: number
    results: number
    tasks: number
    plans: number
    workingFocuses: number
  }
  latestUserInput?:
    | {
        id: string
        focusId: FocusId
        text: string
      }
    | undefined
  latestResult?:
    | {
        taskId: string
        status: TaskResultStatus
        focusId?: FocusId | undefined
        summary?: string | undefined
        stopReason?: string | undefined
        archivePath?: string | undefined
      }
    | undefined
  activeTaskIds?: string[] | undefined
  activePlanIds?: string[] | undefined
  workingFocusIds?: FocusId[] | undefined
  sectionDigests?: ManagerSectionDigest[] | undefined
  includedSections: ManagerPacketSection[]
  prunedSections: ManagerPacketSection[]
}

export type ManagerEnv = {
  lastUser?: {
    source?: string
    platform?: string
    clientLocale?: string
    clientTimeZone?: string
    clientOffsetMinutes?: number
    clientNowIso?: string
  }
  wakeProfile?: ManagerWakeProfile
  workerSlots?: {
    maxSlots: number
    occupiedSlots: number
    availableSlots: number
  }
}

export type ManagerActionFeedback = {
  action: string
  error: string
  hint: string
  attempted?: string
}
