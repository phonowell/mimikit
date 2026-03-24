import { renderActionFeedbackHint } from './action-feedback-hint-renderer.js'

export const formatUnregisteredActionHint = (
  registeredActions: string[],
): string =>
  renderActionFeedbackHint('unregistered_action', {
    registered_actions: registeredActions.join(', '),
  })

export const formatInvalidActionSyntaxHint = (): string =>
  renderActionFeedbackHint('invalid_action_syntax')

export const formatActionInCodeBlockHint = (): string =>
  renderActionFeedbackHint('action_in_code_block')

export const formatInvalidActionArgsEmptyHint = (): string =>
  renderActionFeedbackHint('invalid_action_args_empty')

export const formatInvalidActionArgsWithIssuesHint = (issues: string): string =>
  renderActionFeedbackHint('invalid_action_args_with_issues', { issues })

export const formatInvalidIsoRangeFieldHint = (field: 'from' | 'to'): string =>
  renderActionFeedbackHint('invalid_iso_range_field', { field })

export const formatScheduledAtInvalidHint = (
  action: 'create_plan' | 'update_plan',
): string => renderActionFeedbackHint('scheduled_at_invalid', { action })

export const formatScheduledAtNotFutureHint = (
  action: 'create_plan' | 'update_plan',
  nowIso: string,
): string =>
  renderActionFeedbackHint('scheduled_at_not_future', {
    action,
    now_iso: nowIso,
  })

export const formatMutateTaskNotFoundHint = (): string =>
  renderActionFeedbackHint('mutate_task_not_found')

export const formatMutateTaskAlreadyDoneHint = (
  op: 'pause' | 'resume' | 'cancel',
): string =>
  renderActionFeedbackHint('mutate_task_already_done', {
    op,
  })

export const formatMutateTaskAlreadyPausedHint = (): string =>
  renderActionFeedbackHint('mutate_task_already_paused')

export const formatMutateTaskNotPausedHint = (): string =>
  renderActionFeedbackHint('mutate_task_not_paused')

export const formatMutateTaskResumeInstructionInvalidHint = (): string =>
  renderActionFeedbackHint('mutate_task_resume_instruction_invalid')

export const formatMutateTaskAlreadyCanceledHint = (): string =>
  renderActionFeedbackHint('mutate_task_already_canceled')

export const formatRestartRuntimeUnavailableHint = (): string =>
  renderActionFeedbackHint('restart_runtime_unavailable')

export const formatRestartRuntimeBusyHint = (): string =>
  renderActionFeedbackHint('restart_runtime_busy')

export const formatRestartRuntimeAlreadyScheduledHint = (): string =>
  renderActionFeedbackHint('restart_runtime_already_scheduled')

export const formatAskUserChoiceChannelUnsupportedHint = (): string =>
  renderActionFeedbackHint('ask_user_choice_channel_unsupported')

export const formatAskUserChoiceInvalidOptionsHint = (): string =>
  renderActionFeedbackHint('ask_user_choice_invalid_options')

export const formatEnqueueTaskRequiresConfirmationHint = (): string =>
  renderActionFeedbackHint('enqueue_task_requires_confirmation')

export const formatEnqueueTaskWorktreePrepareFailedHint = (
  branch: string,
  reason: string,
): string =>
  renderActionFeedbackHint('enqueue_task_worktree_prepare_failed', {
    branch,
    reason,
  })

export const formatPlanNotFoundHint = (
  action: 'update_plan' | 'delete_plan',
): string => renderActionFeedbackHint('plan_not_found', { action })

export const formatUpdatePlanDoneForbiddenHint = (): string =>
  renderActionFeedbackHint('update_plan_done_forbidden')

export const formatDuplicateActionGenericHint = (): string =>
  renderActionFeedbackHint('duplicate_action_generic')

export const formatRememberMemoryNotStableHint = (reason: string): string =>
  renderActionFeedbackHint('remember_memory_not_stable', { reason })

export const formatSetTaskResultSummaryTaskNotInBatchHint = (
  availableHint: string,
): string =>
  renderActionFeedbackHint('set_task_result_summary_task_not_in_batch', {
    available_hint: availableHint,
  })
