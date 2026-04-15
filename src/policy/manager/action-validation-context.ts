import type { ManagerTurnAction as Parsed } from './manager-turn-schema.js'
import type {
  ManagerWakeProfile,
  Task,
  TaskPlan,
  TaskPlanStatus,
  TaskStatus,
  UserInput,
} from '../../foundation/types/index.js'

export type FeedbackContext = {
  stateDir?: string
  taskStatusById?: Map<string, TaskStatus>
  taskById?: Map<string, Task>
  planById?: Map<string, TaskPlan>
  planStatusById?: Map<string, TaskPlanStatus>
  resultTaskIds?: Set<string>
  scheduleNowIso?: string
  allowAskUserChoice?: boolean
  wakeProfile?: ManagerWakeProfile
  inputs?: UserInput[]
  restartRuntimeAvailable?: boolean
  restartRuntimeScheduled?: boolean
  restartRuntimeBusy?: boolean
  currentActions?: Parsed[]
  defaultFocusId?: string
}
