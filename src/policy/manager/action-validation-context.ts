import type {
  ManagerWakeProfile,
  Task,
  TaskPlanStatus,
  TaskStatus,
  UserInput,
} from '../../foundation/types/index.js'
import type { Parsed } from '../actions/model/spec.js'

export type FeedbackContext = {
  stateDir?: string
  taskStatusById?: Map<string, TaskStatus>
  taskById?: Map<string, Task>
  planStatusById?: Map<string, TaskPlanStatus>
  resultTaskIds?: Set<string>
  scheduleNowIso?: string
  allowAskUserChoice?: boolean
  wakeProfile?: ManagerWakeProfile
  inputs?: UserInput[]
  supplementalEvidenceSources?: Set<'task_result'>
  restartRuntimeAvailable?: boolean
  restartRuntimeScheduled?: boolean
  restartRuntimeBusy?: boolean
  currentActions?: Parsed[]
  defaultFocusId?: string
  recentUserIntentTexts?: string[]
}
