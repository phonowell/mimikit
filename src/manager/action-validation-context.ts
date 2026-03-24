import type {
  ManagerWakeProfile,
  Task,
  TaskPlanStatus,
  TaskStatus,
  UserInput,
} from '../types/index.js'

export type FeedbackContext = {
  taskStatusById?: Map<string, TaskStatus>
  taskById?: Map<string, Task>
  planStatusById?: Map<string, TaskPlanStatus>
  resultTaskIds?: Set<string>
  scheduleNowIso?: string
  allowAskUserChoice?: boolean
  confirmedRunTaskChoiceIds?: Set<string>
  wakeProfile?: ManagerWakeProfile
  allowedActions?: Set<string>
  inputs?: UserInput[]
  supplementalEvidenceSources?: Set<'task_result'>
  restartRuntimeAvailable?: boolean
  restartRuntimeScheduled?: boolean
  restartRuntimeBusy?: boolean
}
