import type { FocusId } from '../../foundation/types/base.js'
import type {
  ManagerWakeProfile,
  TaskResultStatus,
} from '../../foundation/types/runtime-domain.js'

export type ManagerPacketMode = 'minimal' | 'standard' | 'expanded'

export type ManagerPacketSection =
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

export type ManagerActionFeedbackCode =
  | 'intent_evidence_missing'
  | 'task_contract_missing'
  | 'invalid_action_args'

export type ManagerActionFeedbackRepair = {
  kind: 'fix_action_args'
  issues?: string[] | undefined
  missing_required_attr?: string | undefined
  missing_required_attrs?: string[] | undefined
  unknown_attrs?: string[] | undefined
}

export type ManagerActionFeedback = {
  action: string
  error: string
  hint: string
  attempted?: string
  code?: ManagerActionFeedbackCode
  repair?: ManagerActionFeedbackRepair
}
