import { notifyUiSignal } from '../../kernel/orchestrator/signals.js'
import { appendLog } from '../../persistence/log/append.js'
import { resolveTaskLabel } from '../shared/task-state.js'

import type { PendingUserChoice, Task } from '../../foundation/types/index.js'
import type { RuntimeState } from '../../kernel/orchestrator/runtime-state.js'

export type RuntimeResumeChoiceHydrateSlice = Pick<RuntimeState, 'tasks'> & {
  ui: Pick<RuntimeState['ui'], 'pendingUserChoices'>
}

const RESUME_TASK_OPTION_ID = 'option-resume-task'
const KEEP_TASK_PAUSED_OPTION_ID = 'option-keep-task-paused'

const buildTaskResumeChoice = (
  task: Task,
  createdAt: string,
): PendingUserChoice => ({
  id: `choice-task-resume-${task.id}`,
  question: `Task "${resolveTaskLabel(task)}" paused at the budget boundary. Continue now or keep it paused?`,
  options: [
    {
      id: RESUME_TASK_OPTION_ID,
      label: 'Continue now',
      reason: 'Resume from the saved partial result',
    },
    {
      id: KEEP_TASK_PAUSED_OPTION_ID,
      label: 'Keep paused',
      reason: 'Review the partial result first',
    },
  ],
  defaultOptionId: KEEP_TASK_PAUSED_OPTION_ID,
  createdAt,
  focusId: task.focusId,
  effect: {
    type: 'resume_task',
    taskId: task.id,
    optionId: RESUME_TASK_OPTION_ID,
    reason: 'budget_resume_choice_confirmed',
  },
})

const isRecoverableBudgetPausedTask = (task: Task): boolean =>
  task.status === 'paused' &&
  task.result?.status === 'partial' &&
  task.result.taskStatus !== 'canceled' &&
  task.result.taskStatus !== 'failed'

const resolveResumeChoiceCreatedAt = (task: Task): string =>
  task.pausedAt ?? task.result?.completedAt ?? task.createdAt

export const restoreTaskResumeChoiceOnHydrate = (
  runtime: RuntimeResumeChoiceHydrateSlice,
): void => {
  for (const task of runtime.tasks) {
    if (!isRecoverableBudgetPausedTask(task)) continue
    const choiceId = `choice-task-resume-${task.id}`
    const exists = runtime.ui.pendingUserChoices.some(
      (choice) => choice.id === choiceId,
    )
    if (exists) continue
    runtime.ui.pendingUserChoices.push(
      buildTaskResumeChoice(task, resolveResumeChoiceCreatedAt(task)),
    )
  }
}

export const isTaskResumeChoiceForTask = (
  choice: PendingUserChoice | null | undefined,
  taskId: string,
): boolean =>
  choice?.effect?.type === 'resume_task' && choice.effect.taskId === taskId

export const clearTaskResumeChoice = (
  runtime: RuntimeState,
  taskId: string,
): boolean => {
  const index = runtime.ui.pendingUserChoices.findIndex((choice) =>
    isTaskResumeChoiceForTask(choice, taskId),
  )
  if (index < 0) return false
  runtime.ui.pendingUserChoices.splice(index, 1)
  return true
}

export const requestTaskResumeChoice = async (params: {
  runtime: RuntimeState
  task: Task
  createdAt?: string
}): Promise<boolean> => {
  const { runtime, task } = params
  const createdAt = params.createdAt ?? new Date().toISOString()
  const choice = buildTaskResumeChoice(task, createdAt)
  const existingIndex = runtime.ui.pendingUserChoices.findIndex(
    (item) => item.id === choice.id,
  )
  if (existingIndex >= 0) runtime.ui.pendingUserChoices[existingIndex] = choice
  else runtime.ui.pendingUserChoices.push(choice)
  await appendLog(runtime.paths.log, {
    event: 'task_resume_choice_requested',
    taskId: task.id,
    choiceId: choice.id,
  })
  notifyUiSignal(runtime)
  return true
}
