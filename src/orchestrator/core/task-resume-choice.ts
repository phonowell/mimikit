import { appendHistory } from '../../history/store.js'
import { appendLog } from '../../log/append.js'
import { bestEffort } from '../../log/safe.js'
import { resolveTaskLabel } from '../../shared/task-state.js'
import { newId } from '../../shared/utils.js'

import { persistRuntimeState } from './runtime-persistence.js'
import { notifyUiSignal } from './signals.js'

import type { RuntimeState } from './runtime-state.js'
import type { PendingUserChoice, Task } from '../../types/index.js'

const RESUME_TASK_OPTION_ID = 'option-resume-task'
const KEEP_TASK_PAUSED_OPTION_ID = 'option-keep-task-paused'

const appendResumeChoiceDeferredNote = async (params: {
  runtime: RuntimeState
  task: Task
  createdAt: string
}): Promise<void> => {
  await appendHistory(params.runtime.paths.history, {
    id: `sys-${newId()}`,
    role: 'system',
    visibility: 'user',
    text: `Task "${resolveTaskLabel(params.task)}" paused at the budget boundary while another confirmation is still pending. Use Continue in the task list to resume when ready.`,
    createdAt: params.createdAt,
    focusId: params.task.focusId,
  })
}

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

export const isTaskResumeChoiceForTask = (
  choice: PendingUserChoice | null,
  taskId: string,
): boolean =>
  choice?.effect?.type === 'resume_task' && choice.effect.taskId === taskId

export const clearTaskResumeChoice = (
  runtime: RuntimeState,
  taskId: string,
): boolean => {
  if (!isTaskResumeChoiceForTask(runtime.ui.pendingUserChoice, taskId))
    return false
  runtime.ui.pendingUserChoice = null
  return true
}

export const requestTaskResumeChoice = async (params: {
  runtime: RuntimeState
  task: Task
  createdAt?: string
}): Promise<boolean> => {
  const { runtime, task } = params
  const existingChoice = runtime.ui.pendingUserChoice
  if (existingChoice) {
    await bestEffort('appendLog: task_resume_choice_skipped', () =>
      appendLog(runtime.paths.log, {
        event: 'task_resume_choice_skipped',
        taskId: task.id,
        existingChoiceId: existingChoice.id,
        reason: 'pending_choice_busy',
      }),
    )
    await bestEffort('appendHistory: task_resume_choice_skipped', () =>
      appendResumeChoiceDeferredNote({
        runtime,
        task,
        createdAt: params.createdAt ?? new Date().toISOString(),
      }),
    )
    notifyUiSignal(runtime, 'messages')
    return false
  }

  const createdAt = params.createdAt ?? new Date().toISOString()
  runtime.ui.pendingUserChoice = buildTaskResumeChoice(task, createdAt)
  await persistRuntimeState(runtime)
  await appendLog(runtime.paths.log, {
    event: 'task_resume_choice_requested',
    taskId: task.id,
    choiceId: runtime.ui.pendingUserChoice.id,
  })
  notifyUiSignal(runtime)
  return true
}
