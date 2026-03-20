import { z } from 'zod'

import {
  createPromptTemplateRenderer,
  loadYamlPromptTemplates,
} from '../prompts/prompt-template-loader.js'

import {
  formatEnqueueTaskContractMissingHint as buildEnqueueTaskContractMissingHint,
  type EnqueueTaskContractHintAttrs,
} from './action-feedback-enqueue-task-contract.js'

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
    ask_user_choice_channel_unsupported: z.string().trim().min(1),
    ask_user_choice_invalid_options: z.string().trim().min(1),
    enqueue_task_provider_disabled: z.string().trim().min(1),
    enqueue_task_requires_confirmation: z.string().trim().min(1),
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
    duplicate_query_context_action_limit: z.string().trim().min(1),
    duplicate_read_file_action_limit: z.string().trim().min(1),
    duplicate_action_generic: z.string().trim().min(1),
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

export const formatAskUserChoiceChannelUnsupportedHint = (): string =>
  renderHint('ask_user_choice_channel_unsupported')

export const formatAskUserChoiceInvalidOptionsHint = (): string =>
  renderHint('ask_user_choice_invalid_options')

export const formatEnqueueTaskProviderDisabledHint = (
  provider: string,
): string =>
  renderHint('enqueue_task_provider_disabled', {
    provider,
  })

export const formatEnqueueTaskRequiresConfirmationHint = (): string =>
  renderHint('enqueue_task_requires_confirmation')

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

export const formatDuplicateQueryContextActionLimitHint = (): string =>
  renderHint('duplicate_query_context_action_limit')

export const formatDuplicateReadFileActionLimitHint = (): string =>
  renderHint('duplicate_read_file_action_limit')

export const formatDuplicateActionGenericHint = (): string =>
  renderHint('duplicate_action_generic')

export const formatSetTaskResultSummaryTaskNotInBatchHint = (
  availableHint: string,
): string =>
  renderHint('set_task_result_summary_task_not_in_batch', {
    available_hint: availableHint,
  })
