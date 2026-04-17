import type { FocusId } from '../../foundation/types/base.js'
import type {
  ManagerWakeProfile,
  TaskResultStatus,
} from '../../foundation/types/runtime-domain.js'

export type ManagerPacketMode = 'minimal' | 'standard'

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
  primaryWorkline?:
    | {
        focusId: FocusId
        source:
          | 'user_input'
          | 'quoted_message'
          | 'task_result'
          | 'trigger'
          | 'plan_stage'
          | 'open_task'
          | 'recent_activity'
        summary?: string | undefined
        needsDecision?: boolean | undefined
        sourceInputId?: string | undefined
        sourceTaskId?: string | undefined
        sourcePlanId?: string | undefined
      }
    | undefined
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
  | 'task_contract_missing'
  | 'invalid_action_args'

export type ManagerActionFeedback = {
  action: string
  error: string
  hint: string
  attempted?: string
  code?: ManagerActionFeedbackCode
}
