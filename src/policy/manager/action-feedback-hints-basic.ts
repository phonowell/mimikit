import { renderActionFeedbackHint } from './action-feedback-hint-renderer.js'

export const formatUnregisteredActionHint = (
  registeredActions: string[],
): string =>
  renderActionFeedbackHint('unregistered_action', {
    registered_actions: registeredActions.join(', '),
  })

export const formatInvalidActionArgsEmptyHint = (): string =>
  renderActionFeedbackHint('invalid_action_args_empty')

export const formatInvalidActionArgsWithIssuesHint = (issues: string): string =>
  renderActionFeedbackHint('invalid_action_args_with_issues', { issues })

export const formatInvalidIsoRangeFieldHint = (field: 'from' | 'to'): string =>
  renderActionFeedbackHint('invalid_iso_range_field', { field })

export const formatScheduledAtInvalidHint = (action: 'set_plan'): string =>
  renderActionFeedbackHint('scheduled_at_invalid', { action })

export const formatScheduledAtNotFutureHint = (
  action: 'set_plan',
  nowIso: string,
): string =>
  renderActionFeedbackHint('scheduled_at_not_future', {
    action,
    now_iso: nowIso,
  })

export const formatTaskControlNotFoundHint = (): string =>
  renderActionFeedbackHint('task_control_not_found')

export const formatTaskControlAlreadyDoneHint = (
  action: 'pause' | 'resume' | 'cancel',
): string => renderActionFeedbackHint('task_control_already_done', { action })

export const formatTaskControlAlreadyPausedHint = (): string =>
  renderActionFeedbackHint('task_control_already_paused')

export const formatTaskControlNotPausedHint = (): string =>
  renderActionFeedbackHint('task_control_not_paused')

export const formatTaskControlAlreadyCanceledHint = (): string =>
  renderActionFeedbackHint('task_control_already_canceled')

export const formatEnqueueTaskCwdInvalidHint = (reason: string): string =>
  renderActionFeedbackHint('enqueue_task_cwd_invalid', {
    reason,
  })

export const formatEnqueueTaskWorktreePrepareFailedHint = (
  branch: string,
  reason: string,
): string =>
  renderActionFeedbackHint('enqueue_task_worktree_prepare_failed', {
    branch,
    reason,
  })

export const formatPlanNotFoundHint = (
  action: 'set_plan' | 'delete_plan',
): string => renderActionFeedbackHint('plan_not_found', { action })

export const formatSetPlanDoneForbiddenHint = (): string =>
  renderActionFeedbackHint('set_plan_done_forbidden')

export const formatDuplicateActionGenericHint = (): string =>
  renderActionFeedbackHint('duplicate_action_generic')

export const formatRememberMemoryNotStableHint = (reason: string): string =>
  renderActionFeedbackHint('remember_memory_not_stable', { reason })
