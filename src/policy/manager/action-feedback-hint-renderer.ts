import { z } from 'zod'

import {
  createPromptTemplateRenderer,
  loadYamlPromptTemplates,
} from '../../foundation/prompting/prompt-template-loader.js'

import { mutateTaskGitHintSchemaShape } from './action-feedback-mutate-task-git-hints.js'

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
    mutate_task_resume_instruction_invalid: z.string().trim().min(1),
    mutate_task_already_canceled: z.string().trim().min(1),
    restart_runtime_unavailable: z.string().trim().min(1),
    restart_runtime_busy: z.string().trim().min(1),
    restart_runtime_already_scheduled: z.string().trim().min(1),
    ...mutateTaskGitHintSchemaShape,
    ask_user_choice_channel_unsupported: z.string().trim().min(1),
    ask_user_choice_invalid_options: z.string().trim().min(1),
    enqueue_task_worktree_prepare_failed: z.string().trim().min(1),
    enqueue_task_contract_missing: z.string().trim().min(1),
    plan_not_found: z.string().trim().min(1),
    update_plan_done_forbidden: z.string().trim().min(1),
    duplicate_action_generic: z.string().trim().min(1),
    remember_memory_not_stable: z.string().trim().min(1),
    set_task_result_summary_task_not_in_batch: z.string().trim().min(1),
  })
  .strict()

export type ActionFeedbackHintKey = keyof z.infer<
  typeof actionFeedbackHintSchema
>

const { path: hintTemplatePath, templates } = loadYamlPromptTemplates({
  relativePath: HINT_TEMPLATE_RELATIVE_PATH,
  schema: actionFeedbackHintSchema,
})

const renderTemplate = createPromptTemplateRenderer<ActionFeedbackHintKey>({
  path: hintTemplatePath,
  templates,
})

export const renderActionFeedbackHint = (
  key: ActionFeedbackHintKey,
  values?: Record<string, string>,
): string => renderTemplate(key, values)

export { templates as actionFeedbackHintTemplates }
