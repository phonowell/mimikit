import { renderActionFeedbackHint } from './action-feedback-hint-renderer.js'

type TaskControlTarget = {
  taskId?: string
  taskTitle?: string
}

const formatTaskControlTargetSuffix = (target?: TaskControlTarget): string => {
  const taskTitle = target?.taskTitle?.trim()
  const taskId = target?.taskId?.trim()
  const parts = [
    ...(taskTitle ? [`title="${taskTitle}"`] : []),
    ...(taskId ? [`task_id=${taskId}`] : []),
  ]
  return parts.length > 0 ? `（${parts.join('，')}）` : ''
}

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

export const formatTaskControlNotFoundHint = (
  target?: TaskControlTarget,
): string =>
  renderActionFeedbackHint('task_control_not_found', {
    task_ref_suffix: formatTaskControlTargetSuffix(target),
  })

export const formatTaskControlResumeInstructionsOnlyHint = (
  target?: TaskControlTarget,
): string =>
  renderActionFeedbackHint('task_control_resume_instructions_only', {
    task_ref_suffix: formatTaskControlTargetSuffix(target),
  })

export const formatTaskControlAlreadyDoneHint = (
  action: 'pause' | 'resume' | 'cancel',
  target?: TaskControlTarget,
): string =>
  renderActionFeedbackHint('task_control_already_done', {
    action,
    task_ref_suffix: formatTaskControlTargetSuffix(target),
  })

export const formatTaskControlAlreadyPausedHint = (
  target?: TaskControlTarget,
): string =>
  renderActionFeedbackHint('task_control_already_paused', {
    task_ref_suffix: formatTaskControlTargetSuffix(target),
  })

export const formatTaskControlNotPausedHint = (
  target?: TaskControlTarget,
): string =>
  renderActionFeedbackHint('task_control_not_paused', {
    task_ref_suffix: formatTaskControlTargetSuffix(target),
  })

export const formatTaskControlAlreadyCanceledHint = (
  target?: TaskControlTarget,
): string =>
  renderActionFeedbackHint('task_control_already_canceled', {
    task_ref_suffix: formatTaskControlTargetSuffix(target),
  })

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

export const formatEnqueueTaskBatchConflictHint = (
  conflictPaths: string,
): string =>
  renderActionFeedbackHint('enqueue_task_batch_conflict', {
    conflict_paths: conflictPaths,
  })

export const formatPlanNotFoundHint = (
  action: 'set_plan' | 'delete_plan',
): string => renderActionFeedbackHint('plan_not_found', { action })

export const formatSetPlanDoneForbiddenHint = (): string =>
  renderActionFeedbackHint('set_plan_done_forbidden')

export const formatDuplicateActionGenericHint = (): string =>
  renderActionFeedbackHint('duplicate_action_generic')

export const formatStableDigestIssueHint = (
  issue: 'multiline' | 'checklist' | 'protocol' | 'runtime_ref' | 'too_long',
): string => renderActionFeedbackHint(`stable_digest_issue_${issue}` as const)

export const formatRememberMemoryNotStableHint = (reason: string): string =>
  renderActionFeedbackHint('remember_memory_not_stable', { reason })

export const formatAuxiliaryWriteFailedHint = (
  action: 'remember_memory' | 'remember_project_profile',
  reason: string,
): string =>
  renderActionFeedbackHint('auxiliary_write_failed', {
    action,
    reason,
  })
