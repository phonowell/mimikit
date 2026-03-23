import { z } from 'zod'

import {
  createPromptTemplateRenderer,
  loadYamlPromptTemplates,
} from '../prompts/prompt-template-loader.js'

import {
  formatEnqueueTaskContractMissingHint as buildEnqueueTaskContractMissingHint,
  type EnqueueTaskContractHintAttrs,
} from './action-feedback-enqueue-task-contract.js'
import {
  createMutateTaskGitHintFormatters,
  mutateTaskGitHintSchemaShape,
} from './action-feedback-mutate-task-git-hints.js'

const HINT_TEMPLATE_RELATIVE_PATH = 'manager/action-feedback-hints.md'

const actionFeedbackHintSchema = z
  .object({
    unregistered_action: z.string().trim().min(1),
    invalid_action_syntax: z.string().trim().min(1),
    action_in_code_block: z.string().trim().min(1),
    invalid_action_args_empty: z.string().trim().min(1),
    invalid_action_args_with_issues: z.string().trim().min(1),
    invalid_iso_range_field: z.string().trim().min(1),
    scheduled_at_invalid: z.string().trim().min(1),
    scheduled_at_not_future: z.string().trim().min(1),
    mutate_task_not_found: z.string().trim().min(1),
    mutate_task_already_done: z.string().trim().min(1),
    mutate_task_already_paused: z.string().trim().min(1),
    mutate_task_not_paused: z.string().trim().min(1),
    mutate_task_already_canceled: z.string().trim().min(1),
    restart_runtime_unavailable: z.string().trim().min(1),
    restart_runtime_busy: z.string().trim().min(1),
    restart_runtime_already_scheduled: z.string().trim().min(1),
    ...mutateTaskGitHintSchemaShape,
    ask_user_choice_channel_unsupported: z.string().trim().min(1),
    ask_user_choice_invalid_options: z.string().trim().min(1),
    enqueue_task_requires_confirmation: z.string().trim().min(1),
    enqueue_task_worktree_prepare_failed: z.string().trim().min(1),
    enqueue_task_contract_missing: z.string().trim().min(1),
    enqueue_task_contract_missing_default_worker_prompt: z
      .string()
      .trim()
      .min(1),
    enqueue_task_contract_missing_default_title: z.string().trim().min(1),
    enqueue_task_contract_missing_default_cwd: z.string().trim().min(1),
    enqueue_task_contract_missing_default_goal: z.string().trim().min(1),
    enqueue_task_contract_missing_default_in_scope: z.string().trim().min(1),
    enqueue_task_contract_missing_default_out_of_scope: z
      .string()
      .trim()
      .min(1),
    enqueue_task_contract_missing_default_done_when_1: z.string().trim().min(1),
    plan_not_found: z.string().trim().min(1),
    update_plan_done_forbidden: z.string().trim().min(1),
    duplicate_action_generic: z.string().trim().min(1),
    remember_memory_not_stable: z.string().trim().min(1),
    set_task_result_summary_task_not_in_batch: z.string().trim().min(1),
  })
  .strict()

type ActionFeedbackHintKey = keyof z.infer<typeof actionFeedbackHintSchema>

const { path: hintTemplatePath, templates } = loadYamlPromptTemplates({
  relativePath: HINT_TEMPLATE_RELATIVE_PATH,
  schema: actionFeedbackHintSchema,
})
const renderTemplate = createPromptTemplateRenderer<ActionFeedbackHintKey>({
  path: hintTemplatePath,
  templates,
})
const renderHint = (
  key: ActionFeedbackHintKey,
  values?: Record<string, string>,
): string => renderTemplate(key, values)

const {
  formatMutateTaskGitReasonRequiredHint,
  formatMutateTaskNotDoneForGitHint,
  formatMutateTaskNotGitHint,
  formatMutateTaskReviewRequiredHint,
  formatMutateTaskMergeRequiredHint,
} = createMutateTaskGitHintFormatters(renderHint)

export const formatUnregisteredActionHint = (
  registeredActions: string[],
): string =>
  renderHint('unregistered_action', {
    registered_actions: registeredActions.join(', '),
  })

export const formatInvalidActionSyntaxHint = (): string =>
  renderHint('invalid_action_syntax')

export const formatActionInCodeBlockHint = (): string =>
  renderHint('action_in_code_block')

export const formatInvalidActionArgsEmptyHint = (): string =>
  renderHint('invalid_action_args_empty')

export const formatInvalidActionArgsWithIssuesHint = (issues: string): string =>
  renderHint('invalid_action_args_with_issues', { issues })

export const formatInvalidIsoRangeFieldHint = (field: 'from' | 'to'): string =>
  renderHint('invalid_iso_range_field', { field })

export const formatScheduledAtInvalidHint = (
  action: 'create_plan' | 'update_plan',
): string => renderHint('scheduled_at_invalid', { action })

export const formatScheduledAtNotFutureHint = (
  action: 'create_plan' | 'update_plan',
  nowIso: string,
): string =>
  renderHint('scheduled_at_not_future', {
    action,
    now_iso: nowIso,
  })

export const formatMutateTaskNotFoundHint = (): string =>
  renderHint('mutate_task_not_found')

export const formatMutateTaskAlreadyDoneHint = (
  op: 'pause' | 'resume' | 'cancel',
): string =>
  renderHint('mutate_task_already_done', {
    op,
  })

export const formatMutateTaskAlreadyPausedHint = (): string =>
  renderHint('mutate_task_already_paused')

export const formatMutateTaskNotPausedHint = (): string =>
  renderHint('mutate_task_not_paused')

export const formatMutateTaskAlreadyCanceledHint = (): string =>
  renderHint('mutate_task_already_canceled')
export const formatRestartRuntimeUnavailableHint = (): string =>
  renderHint('restart_runtime_unavailable')
export const formatRestartRuntimeBusyHint = (): string =>
  renderHint('restart_runtime_busy')
export const formatRestartRuntimeAlreadyScheduledHint = (): string =>
  renderHint('restart_runtime_already_scheduled')
export {
  formatMutateTaskGitReasonRequiredHint,
  formatMutateTaskMergeRequiredHint,
  formatMutateTaskNotDoneForGitHint,
  formatMutateTaskNotGitHint,
  formatMutateTaskReviewRequiredHint,
}

export const formatAskUserChoiceChannelUnsupportedHint = (): string =>
  renderHint('ask_user_choice_channel_unsupported')

export const formatAskUserChoiceInvalidOptionsHint = (): string =>
  renderHint('ask_user_choice_invalid_options')
export const formatEnqueueTaskRequiresConfirmationHint = (): string =>
  renderHint('enqueue_task_requires_confirmation')

export const formatEnqueueTaskWorktreePrepareFailedHint = (
  branch: string,
  reason: string,
): string =>
  renderHint('enqueue_task_worktree_prepare_failed', {
    branch,
    reason,
  })

const FALLBACK_TASK_CONTRACT_HINT_VALUES = {
  worker_prompt: templates.enqueue_task_contract_missing_default_worker_prompt,
  title: templates.enqueue_task_contract_missing_default_title,
  cwd: templates.enqueue_task_contract_missing_default_cwd,
  goal: templates.enqueue_task_contract_missing_default_goal,
  in_scope: templates.enqueue_task_contract_missing_default_in_scope,
  out_of_scope: templates.enqueue_task_contract_missing_default_out_of_scope,
  done_when_1: templates.enqueue_task_contract_missing_default_done_when_1,
} as const

export const formatEnqueueTaskContractMissingHint = (
  attrs?: EnqueueTaskContractHintAttrs,
): string =>
  buildEnqueueTaskContractMissingHint({
    renderHint,
    defaults: FALLBACK_TASK_CONTRACT_HINT_VALUES,
    ...(attrs ? { attrs } : {}),
  })

export const formatPlanNotFoundHint = (
  action: 'update_plan' | 'delete_plan',
): string => renderHint('plan_not_found', { action })

export const formatUpdatePlanDoneForbiddenHint = (): string =>
  renderHint('update_plan_done_forbidden')
export const formatDuplicateActionGenericHint = (): string =>
  renderHint('duplicate_action_generic')

export const formatRememberMemoryNotStableHint = (reason: string): string =>
  renderHint('remember_memory_not_stable', { reason })

export const formatSetTaskResultSummaryTaskNotInBatchHint = (
  availableHint: string,
): string =>
  renderHint('set_task_result_summary_task_not_in_batch', {
    available_hint: availableHint,
  })
