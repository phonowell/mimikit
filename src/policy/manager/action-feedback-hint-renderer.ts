import { z } from 'zod'

import {
  createPromptTemplateRenderer,
  loadYamlPromptTemplates,
} from '../../foundation/prompting/prompt-template-loader.js'

const HINT_TEMPLATE_RELATIVE_PATH = 'manager/action-feedback-hints.md'

const actionFeedbackHintSchema = z
  .object({
    unregistered_action: z.string().trim().min(1),
    invalid_action_args_empty: z.string().trim().min(1),
    invalid_action_args_with_issues: z.string().trim().min(1),
    invalid_iso_range_field: z.string().trim().min(1),
    scheduled_at_invalid: z.string().trim().min(1),
    scheduled_at_not_future: z.string().trim().min(1),
    task_control_not_found: z.string().trim().min(1),
    task_control_resume_instructions_only: z.string().trim().min(1),
    task_control_already_done: z.string().trim().min(1),
    task_control_already_paused: z.string().trim().min(1),
    task_control_not_paused: z.string().trim().min(1),
    task_control_already_canceled: z.string().trim().min(1),
    enqueue_task_cwd_invalid: z.string().trim().min(1),
    enqueue_task_worktree_prepare_failed: z.string().trim().min(1),
    enqueue_task_batch_conflict: z.string().trim().min(1),
    enqueue_task_resume_existing: z.string().trim().min(1),
    enqueue_task_contract_missing: z.string().trim().min(1),
    plan_not_found: z.string().trim().min(1),
    set_plan_done_forbidden: z.string().trim().min(1),
    duplicate_action_generic: z.string().trim().min(1),
    remember_memory_not_stable: z.string().trim().min(1),
    missing_result_followup_action: z.string().trim().min(1),
    stable_digest_issue_multiline: z.string().trim().min(1),
    stable_digest_issue_checklist: z.string().trim().min(1),
    stable_digest_issue_protocol: z.string().trim().min(1),
    stable_digest_issue_runtime_ref: z.string().trim().min(1),
    stable_digest_issue_too_long: z.string().trim().min(1),
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
