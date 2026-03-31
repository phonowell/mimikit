import { cancelTask } from '../../execution/worker/cancel-task.js'
import { pauseTask } from '../../execution/worker/pause-task.js'
import { recordTaskGitLifecycle } from '../../execution/worker/record-task-git-lifecycle.js'
import { resumeTask } from '../../execution/worker/resume-task.js'

import { applyRunTask } from './action-apply-create.js'
import { ActionApplyFeedbackError } from './action-apply-feedback-error.js'
import {
  formatRecordTaskGitMergeRequiredHint,
  formatRecordTaskGitNotDoneHint,
  formatRecordTaskGitNotFoundHint,
  formatRecordTaskGitNotGitHint,
  formatRecordTaskGitReviewRequiredHint,
  formatTaskControlAlreadyCanceledHint,
  formatTaskControlAlreadyDoneHint,
  formatTaskControlAlreadyPausedHint,
  formatTaskControlNotFoundHint,
  formatTaskControlNotPausedHint,
} from './action-feedback-hints.js'
import { ACTION_PROMPT_SPECS } from './action-prompt-spec.js'
import {
  createContinueAction,
  type ManagerActionDefinition,
} from './action-registry-shared.js'
import {
  validateRecordTaskGit,
  validateRunTask,
  validateTaskControl,
} from './action-validation.js'

import type { Parsed } from '../actions/model/spec.js'

const rejectApply = (
  action: 'task_control' | 'record_task_git',
  hint: string,
): never => {
  throw new ActionApplyFeedbackError({
    action,
    error: 'action_execution_rejected',
    hint,
  })
}

const applyTaskControlAction = async (
  runtime: Parameters<ManagerActionDefinition['apply']>[0],
  item: Parsed,
): Promise<void> => {
  if (item.type !== 'task_control') return
  const task = runtime.tasks.find((candidate) => candidate.id === item.task_id)
  const taskTarget = {
    taskId: item.task_id,
    ...(task?.title ? { taskTitle: task.title } : {}),
  }
  const instructions = item.instructions ?? []

  if (item.action === 'pause') {
    const result = await pauseTask(runtime, item.task_id, {
      source: 'deferred',
    })
    if (result.ok) return
    if (result.status === 'not_found')
      rejectApply('task_control', formatTaskControlNotFoundHint(taskTarget))
    if (result.status === 'already_paused') {
      rejectApply(
        'task_control',
        formatTaskControlAlreadyPausedHint(taskTarget),
      )
    }
    rejectApply(
      'task_control',
      formatTaskControlAlreadyDoneHint('pause', taskTarget),
    )
  }

  if (item.action === 'resume') {
    const result = await resumeTask(runtime, item.task_id, {
      source: 'deferred',
      ...(instructions[0]
        ? { resumeInstruction: instructions.join('\n') }
        : {}),
    })
    if (result.ok) return
    if (result.status === 'not_found')
      rejectApply('task_control', formatTaskControlNotFoundHint(taskTarget))
    if (result.status === 'not_paused')
      rejectApply('task_control', formatTaskControlNotPausedHint(taskTarget))
    rejectApply(
      'task_control',
      formatTaskControlAlreadyDoneHint('resume', taskTarget),
    )
  }

  const result = await cancelTask(runtime, item.task_id, {
    source: 'deferred',
  })
  if (result.ok) return
  if (result.status === 'not_found')
    rejectApply('task_control', formatTaskControlNotFoundHint(taskTarget))
  if (result.status === 'already_canceled') {
    rejectApply(
      'task_control',
      formatTaskControlAlreadyCanceledHint(taskTarget),
    )
  }
  rejectApply(
    'task_control',
    formatTaskControlAlreadyDoneHint('cancel', taskTarget),
  )
}

const applyRecordTaskGitAction = async (
  runtime: Parameters<ManagerActionDefinition['apply']>[0],
  item: Parsed,
): Promise<void> => {
  if (item.type !== 'record_task_git') return

  const result = await recordTaskGitLifecycle(
    runtime,
    item.task_id,
    item.state,
    {
      source: 'deferred',
    },
  )
  if (result.ok) return
  if (result.status === 'not_found')
    rejectApply('record_task_git', formatRecordTaskGitNotFoundHint())
  if (result.status === 'not_done')
    rejectApply('record_task_git', formatRecordTaskGitNotDoneHint(item.state))
  if (result.status === 'not_git')
    rejectApply('record_task_git', formatRecordTaskGitNotGitHint(item.state))
  if (result.status === 'review_required')
    rejectApply('record_task_git', formatRecordTaskGitReviewRequiredHint())
  rejectApply('record_task_git', formatRecordTaskGitMergeRequiredHint())
}

export const TASK_ACTION_DEFINITIONS = [
  {
    name: 'enqueue_task',
    domain: 'task',
    prompt: ACTION_PROMPT_SPECS.enqueue_task,
    validate: (item, context) => validateRunTask(item, context),
    apply: (runtime, item, context) =>
      applyRunTask(runtime, item, context.seen, context.options),
  } satisfies ManagerActionDefinition,
  createContinueAction(
    {
      name: 'task_control',
      domain: 'task',
      prompt: ACTION_PROMPT_SPECS.task_control,
    },
    (item, context) => validateTaskControl(item, context),
    applyTaskControlAction,
  ),
  createContinueAction(
    {
      name: 'record_task_git',
      domain: 'task',
      prompt: ACTION_PROMPT_SPECS.record_task_git,
    },
    (item, context) => validateRecordTaskGit(item, context),
    applyRecordTaskGitAction,
  ),
] satisfies ManagerActionDefinition[]
